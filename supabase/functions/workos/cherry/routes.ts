// Cherry's four routes.
//
// Dependencies are injected rather than imported, because the authorization
// and execution helpers live in index.ts and index.ts mounts these handlers -
// importing both ways would be a cycle. Passing them in also makes the one
// rule that matters testable: every write Cherry makes goes through the same
// authorizeDataOp/executeDataOp pair the rest of the app uses.

import type {
  CherryAction, CherryAmbiguity, CherryApplyResult, CherryProposal, CherryQuestion,
  CherryTable, CherryTurn, CherryUndoEntry, CherryUndoToken,
} from "./types.ts";
import { CHERRY_LIMITS } from "./types.ts";
import { ENTITY_SCHEMA, isCherryTable, resolveFieldName } from "./schema.ts";
import { buildContext, renderContext } from "./context.ts";
import { ambiguityFor, countCascade, findDuplicate, resolveTarget } from "./resolve.ts";
import { checkLimits, validateAction } from "./validate.ts";
import { parseCommand, resolveProvider, testProvider } from "./ai.ts";
import { buildUserPrompt } from "./prompts.ts";

// deno-lint-ignore no-explicit-any
type Db = any;
// deno-lint-ignore no-explicit-any
type AuthedUser = { sub: string; username: string; [k: string]: any };

export interface CherryDeps {
  db: Db;
  /** The caller's own decrypted AI keys, if they have set any. */
  userKeys: (userId: string) => Promise<{ anthropic?: string; gemini?: string; provider?: string }>;
  json: (body: unknown, status?: number) => Response;
  authorize: (op: {
    table: string; operation: string; workspace_id: string;
    payload?: unknown; id?: string; idColumn?: string; filters?: Record<string, unknown>;
  }, user: AuthedUser) => Promise<
    { ok: true; role: string; config: unknown } | { ok: false; status: number; error: string }
  >;
  execute: (op: {
    table: string; operation: string; workspace_id: string;
    payload?: unknown; id?: string; idColumn?: string; filters?: Record<string, unknown>;
  }, user: AuthedUser, config: unknown) => Promise<{ data?: unknown; error?: string; status?: number }>;
}

// ------------------------------------------------------------- /status --

export async function handleCherryStatus(user: AuthedUser, deps: CherryDeps): Promise<Response> {
  const keys = await deps.userKeys(user.sub);
  const p = resolveProvider(undefined, keys);
  return deps.json({ provider: p.name, model: p.model ?? null, reason: p.reason });
}

export async function handleCherryTest(req: Request, user: AuthedUser, deps: CherryDeps): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const keys = await deps.userKeys(user.sub);
  const result = await testProvider(body?.provider, keys);
  return deps.json(result, result.ok ? 200 : 400);
}

// -------------------------------------------------------------- /parse --

export async function handleCherryParse(req: Request, user: AuthedUser, deps: CherryDeps): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const workspaceId = String(body?.workspace_id ?? "");
  if (!workspaceId) return deps.json({ error: "Missing workspace_id" }, 400);

  // Membership is checked with a harmless read through the same gate every
  // other request uses, so Cherry cannot be a way around it.
  const gate = await deps.authorize({ table: "projects", operation: "select", workspace_id: workspaceId, filters: {} }, user);
  if (!gate.ok) return deps.json({ error: gate.error }, gate.status);

  const answers = (body?.answers ?? {}) as Record<string, unknown>;
  const resolutions = (body?.resolutions ?? {}) as Record<string, string>;
  const skips = new Set<string>(Array.isArray(body?.skips) ? body.skips.map(String) : []);
  const pending = body?.pending_proposal as CherryProposal | undefined;

  // Answering a question, or picking between candidates, is a pure merge over
  // the pending proposal. No model call: answering three questions should not
  // cost three round trips, and re-running the model would give it a chance to
  // rewrite actions the user has already read and approved.
  const hasMerge = Object.keys(answers).length || Object.keys(resolutions).length || skips.size;
  if (pending && hasMerge && !String(body?.message ?? "").trim()) {
    const merged = mergeAnswers(pending, answers, resolutions, skips);
    return deps.json({ proposal: merged, provider: "merge", degraded_from: null, provider_error: null });
  }

  const message = String(body?.message ?? "").trim().slice(0, CHERRY_LIMITS.maxMessageChars);
  if (message.length < 2) return deps.json({ error: "Tell me what you want to change." }, 400);

  const history: CherryTurn[] = (Array.isArray(body?.history) ? body.history : [])
    .slice(-CHERRY_LIMITS.maxHistoryTurns)
    .filter((t: unknown): t is CherryTurn => Boolean(t) && typeof (t as CherryTurn).text === "string")
    .map((t: CherryTurn) => ({ role: t.role === "cherry" ? "cherry" : "user", text: String(t.text).slice(0, 1200) }));

  const scopeProjectId = body?.scope?.project_id ? String(body.scope.project_id) : null;
  const ctx = await buildContext(deps.db, workspaceId, message, scopeProjectId, body?.today);

  const prompt = buildUserPrompt({
    message,
    contextBlock: renderContext(ctx),
    history,
    pending: pending ? slimPending(pending) : undefined,
    today: ctx.today,
    weekday: ctx.weekday,
  });

  const keys = await deps.userKeys(user.sub);
  const { draft, provider, degradedFrom, error } = await parseCommand(message, prompt, ctx, body?.provider, keys);

  const proposal: CherryProposal = {
    proposal_id: crypto.randomUUID(),
    understanding: draft.understanding ?? "",
    intent_kind: draft.intent_kind ?? "unclear",
    reply: draft.reply ?? "",
    actions: [],
    questions: [],
    ambiguities: [],
    refusals: [],
    blocked_by: "nothing",
    generated_at: new Date().toISOString(),
  };

  const commands = (draft.commands ?? []).slice(0, CHERRY_LIMITS.maxActionsPerProposal);
  if ((draft.commands ?? []).length > CHERRY_LIMITS.maxActionsPerProposal) {
    proposal.refusals.push({
      reason: "too_many",
      detail: `That is more than ${CHERRY_LIMITS.maxActionsPerProposal} changes at once. I have taken the first ${CHERRY_LIMITS.maxActionsPerProposal}; ask again for the rest.`,
    });
  }

  let n = 0;
  for (const cmd of commands) {
    if (!isCherryTable(cmd.table)) {
      proposal.refusals.push({ reason: "table_not_allowed", detail: `I do not manage ${cmd.table}.` });
      continue;
    }
    const actionId = `a${++n}`;
    const spec = ENTITY_SCHEMA[cmd.table];

    // Fields the model could not ground in the message are dropped here, in
    // validate, rather than being written as though the user had said them.
    const payload: Record<string, unknown> = {};
    for (const f of cmd.fields ?? []) {
      if (!f?.name) continue;
      const fieldName = resolveFieldName(cmd.table, f.name);
      if (!fieldName) {
        proposal.refusals.push({ reason: "unknown_field", detail: `Ignored "${f.name}" - not something a ${spec.label} has.` });
        continue;
      }
      const quoted = f.quote && message.toLowerCase().includes(String(f.quote).toLowerCase().slice(0, 40));
      const spec2 = spec.fields[fieldName];
      if (spec2?.evidence && !quoted && !spec2.evidence.test(message)) continue;

      // The model refers to rows by the short handles the context block used
      // (p2, u1). Those are this request's invention and mean nothing to the
      // database, so they are translated back here - the one place that
      // mapping exists. A handle that does not resolve is dropped rather than
      // written, which turns it into a question instead of a broken uuid.
      if (spec2?.kind === "ref:projects" || spec2?.kind === "ref:users") {
        const raw = String(f.value ?? "");
        const wantTable = spec2.kind === "ref:projects" ? "projects" : "users";
        const viaHandle = ctx.byHandle.get(raw);
        if (viaHandle && viaHandle.table === wantTable) {
          payload[fieldName] = viaHandle.id;
          continue;
        }
        if (/^[0-9a-f-]{36}$/i.test(raw)) {
          payload[fieldName] = raw;
          continue;
        }
        const pool = wantTable === "projects" ? ctx.projects : ctx.members;
        const byName = pool.find((r) => r.label.toLowerCase() === raw.toLowerCase())
          ?? pool.find((r) => r.label.toLowerCase().includes(raw.toLowerCase()) && raw.length > 2);
        if (byName) payload[fieldName] = byName.id;
        continue;
      }

      payload[fieldName] = f.value;
    }

    const action: CherryAction = {
      id: actionId, table: cmd.table, operation: cmd.operation,
      payload, target: null, summary: "", fields: [],
      severity: cmd.operation === "delete" ? "destructive" : cmd.operation === "update" ? "medium" : "low",
      ready: false,
    };

    if (cmd.operation === "insert") {
      const titleField = spec.titleField;
      const title = payload[titleField];
      if (typeof title === "string" && title.trim()) {
        const dup = await findDuplicate(deps.db, workspaceId, cmd.table, title, ctx);
        if (dup) {
          // Saying the same thing twice should not leave two rows.
          proposal.refusals.push({
            reason: "already_exists",
            detail: `You already have a ${spec.label} called "${dup.label}", so I have left it alone.`,
          });
          n--;
          continue;
        }
      }
    } else {
      const hint = cmd.target_hint;
      if (!hint?.text) {
        proposal.refusals.push({ reason: "no_target", detail: `I could not tell which ${spec.label} you meant.` });
        n--;
        continue;
      }
      const res = await resolveTarget(deps.db, workspaceId, cmd.table, hint, ctx, cmd.operation);
      if (res.kind === "resolved") {
        action.target = res.target;
      } else if (res.kind === "ambiguous") {
        proposal.ambiguities.push(ambiguityFor(actionId, cmd.table, res.candidates, hint.text));
      } else {
        // A delete that cannot be pinned down is refused outright, not asked
        // about: deleting the wrong row is not something a confirmation
        // dialog can undo the surprise of.
        proposal.refusals.push({
          reason: "target_not_found",
          detail: `I could not find a ${spec.label} matching "${hint.text}", so I have not ${cmd.operation === "delete" ? "deleted" : "changed"} anything.`,
        });
        n--;
        continue;
      }
    }

    if (cmd.operation === "delete" && action.target) {
      const cascade = await countCascade(deps.db, workspaceId, cmd.table, action.target.id);
      action.destructive = {
        cascade_summary: cascade.summary,
        requires_typed_confirmation: spec.cherry.deleteRequiresTypedConfirmation,
        typed_confirmation_phrase: spec.cherry.deleteRequiresTypedConfirmation ? action.target.label : undefined,
        undo_is_complete: cascade.lost.length === 0,
      };
      const prefer = spec.cherry.preferInsteadOfDelete;
      if (prefer) proposal.refusals.push({ reason: "prefer_archive", detail: prefer.phrasing });
    }

    const outcome = validateAction(action, message, answers, skips);
    action.payload = cmd.operation === "delete" ? {} : outcome.payload;
    // A uuid tells the user nothing. Reference fields are shown by the name of
    // the thing they point at, so "is this the right project?" is answerable
    // by reading the card rather than by trusting it.
    action.fields = outcome.fields.map((f) => {
      const kind = spec.fields[f.field]?.kind;
      if (kind !== "ref:projects" && kind !== "ref:users") return f;
      const pool = kind === "ref:projects" ? ctx.projects : ctx.members;
      const hit = pool.find((r) => r.id === String(f.value));
      return hit ? { ...f, display: hit.label } : f;
    });
    action.summary = summarise(action, spec.label);
    action.ready = outcome.missingRequired.length === 0 &&
      (cmd.operation === "insert" || Boolean(action.target));
    proposal.questions.push(...outcome.questions);
    proposal.refusals.push(...outcome.refusals);
    proposal.actions.push(action);
  }

  proposal.refusals.push(...checkLimits(proposal.actions));
  proposal.blocked_by = proposal.questions.some((q) => q.blocking)
    ? "questions"
    : proposal.ambiguities.length ? "ambiguity" : "nothing";

  return deps.json({
    proposal, provider,
    degraded_from: degradedFrom ?? null,
    provider_error: error ?? null,
  });
}

// -------------------------------------------------------------- /apply --

export async function handleCherryApply(req: Request, user: AuthedUser, deps: CherryDeps): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const workspaceId = String(body?.workspace_id ?? "");
  const proposal = body?.proposal as CherryProposal | undefined;
  const confirmed: string[] = Array.isArray(body?.confirmed_action_ids) ? body.confirmed_action_ids.map(String) : [];
  const typed = (body?.typed_confirmations ?? {}) as Record<string, string>;

  if (!workspaceId) return deps.json({ error: "Missing workspace_id" }, 400);
  if (!proposal?.actions?.length) return deps.json({ error: "Nothing to apply." }, 400);

  const result: CherryApplyResult = {
    applied: [], skipped: [], failed: [],
    undo: { workspace_id: workspaceId, entries: [], unrecoverable: [], created_at: new Date().toISOString() },
    touched: { tables: [], project_ids: [] },
  };

  const touchedTables = new Set<string>();
  const touchedProjects = new Set<string>();

  for (const action of proposal.actions) {
    // The confirmation gate. Not a flag that could default to true - an action
    // the user did not tick is simply never executed.
    if (!confirmed.includes(action.id)) {
      result.skipped.push({ action_id: action.id, reason: "not confirmed" });
      continue;
    }
    if (!isCherryTable(action.table)) {
      result.failed.push({ action_id: action.id, error: "Table not allowed" });
      continue;
    }
    const spec = ENTITY_SCHEMA[action.table];

    // Re-validated from scratch: the proposal arrived in the request body and
    // is therefore untrusted. A hand-crafted call that strips the questions
    // and posts the payload hits exactly the code that raised them.
    const outcome = validateAction(action, null, {}, new Set());
    if (outcome.missingRequired.length) {
      result.failed.push({
        action_id: action.id,
        error: `Missing ${outcome.missingRequired.map((f) => spec.fields[f]?.label ?? f).join(", ")}.`,
      });
      continue;
    }
    if (outcome.refusals.length && action.operation !== "delete") {
      result.failed.push({ action_id: action.id, error: outcome.refusals[0].detail });
      continue;
    }

    if (action.operation === "delete" && spec.cherry.deleteRequiresTypedConfirmation) {
      const expected = action.target?.label ?? "";
      if (!expected || typed[action.id] !== expected) {
        result.failed.push({ action_id: action.id, error: `Type the ${spec.label}'s name exactly to confirm deleting it.` });
        continue;
      }
    }

    const op = {
      table: action.table,
      operation: action.operation === "insert" ? "insert" : action.operation,
      workspace_id: workspaceId,
      payload: action.operation === "delete" ? undefined : outcome.payload,
      id: action.target?.id,
      idColumn: "id",
    };

    const gate = await deps.authorize(op, user);
    if (!gate.ok) {
      result.failed.push({ action_id: action.id, error: gate.error });
      continue;
    }

    // Snapshot before changing anything, so undo restores rather than guesses.
    let before: Record<string, unknown> | null = null;
    if (action.operation !== "insert" && action.target) {
      const { data } = await deps.db.from(action.table).select("*").eq("id", action.target.id).maybeSingle();
      before = data ?? null;
    }

    if (action.operation === "delete") {
      const cascade = await countCascade(deps.db, workspaceId, action.table, action.target!.id);
      result.undo.unrecoverable.push(...cascade.lost);
      for (const c of cascade.lost) touchedTables.add(c.table);
    }

    const exec = await deps.execute(op, user, gate.config);
    if (exec.error) {
      result.failed.push({ action_id: action.id, error: exec.error });
      continue;
    }

    const row = exec.data as Record<string, unknown> | undefined;
    const rowId = String(row?.id ?? action.target?.id ?? "");
    result.applied.push({
      action_id: action.id, table: action.table, operation: action.operation,
      row_id: rowId, summary: action.summary,
    });
    result.undo.entries.push({
      table: action.table, operation: action.operation, row_id: rowId,
      before: action.operation === "insert" ? null : before,
    } as CherryUndoEntry);

    touchedTables.add(action.table);
    const pid = (row?.project_id as string) ?? (before?.project_id as string) ?? null;
    if (pid) touchedProjects.add(pid);
  }

  result.touched.tables = [...touchedTables];
  result.touched.project_ids = [...touchedProjects];
  return deps.json(result);
}

// --------------------------------------------------------------- /undo --

export async function handleCherryUndo(req: Request, user: AuthedUser, deps: CherryDeps): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const token = body?.undo as CherryUndoToken | undefined;
  const workspaceId = String(body?.workspace_id ?? token?.workspace_id ?? "");
  if (!workspaceId || !token?.entries?.length) return deps.json({ error: "Nothing to undo." }, 400);

  let reverted = 0;
  const failed: string[] = [];

  // Reverse order, so an undo of several changes unwinds them the way they
  // were made rather than fighting its own foreign keys.
  for (const entry of [...token.entries].reverse()) {
    const inverse = entry.operation === "insert"
      ? { table: entry.table, operation: "delete", workspace_id: workspaceId, id: entry.row_id, idColumn: "id" }
      : entry.operation === "update"
      ? { table: entry.table, operation: "update", workspace_id: workspaceId, id: entry.row_id, idColumn: "id", payload: strip(entry.before) }
      // A delete is undone by putting the row back with its original id, so
      // anything that still points at it lines up again.
      : { table: entry.table, operation: "insert", workspace_id: workspaceId, payload: entry.before ?? {} };

    const gate = await deps.authorize(inverse, user);
    if (!gate.ok) { failed.push(gate.error); continue; }
    const exec = await deps.execute(inverse, user, gate.config);
    if (exec.error) failed.push(exec.error);
    else reverted++;
  }

  return deps.json({ reverted, failed, unrecoverable: token.unrecoverable ?? [] });
}

// ------------------------------------------------------------- helpers --

/** Columns the server owns and an undo must not try to set. */
function strip(row: Record<string, unknown> | null): Record<string, unknown> {
  if (!row) return {};
  const { id: _id, workspace_id: _w, created_by: _c, created_at: _ca, updated_at: _u, ...rest } = row;
  return rest;
}

function mergeAnswers(
  proposal: CherryProposal,
  answers: Record<string, unknown>,
  resolutions: Record<string, string>,
  skips: Set<string>,
): CherryProposal {
  const next: CherryProposal = structuredClone(proposal);

  for (const amb of next.ambiguities) {
    const chosen = resolutions[amb.id];
    if (!chosen) continue;
    // Only a candidate Cherry actually offered - never an arbitrary id.
    const target = amb.candidates.find((c) => c.id === chosen);
    if (!target) continue;
    amb.resolved_target_id = chosen;
    const action = next.actions.find((a) => a.id === amb.action_id);
    if (action) action.target = target;
  }
  next.ambiguities = next.ambiguities.filter((a) => !a.resolved_target_id);

  for (const action of next.actions) {
    const outcome = validateAction(action, null, answers, skips);
    if (action.operation !== "delete") {
      // Re-validating recomputes every display string, which would undo the
      // human labels the parse step resolved for reference fields - a project
      // would silently turn back into a uuid the moment you answered an
      // unrelated question. Carry forward the label wherever the value has
      // not changed.
      const previous = new Map(action.fields.map((f) => [`${f.field}:${String(f.value)}`, f.display]));
      action.payload = { ...action.payload, ...outcome.payload };
      action.fields = outcome.fields.map((f) => {
        const kept = previous.get(`${f.field}:${String(f.value)}`);
        return kept ? { ...f, display: kept } : f;
      });
    }
    const spec = ENTITY_SCHEMA[action.table];
    action.summary = summarise(action, spec.label);
    action.ready = outcome.missingRequired.length === 0 &&
      (action.operation === "insert" || Boolean(action.target));
    next.questions = next.questions
      .filter((q) => q.action_id !== action.id)
      .concat(outcome.questions.map((q) => markAnswered(q, answers, skips)));
  }

  next.blocked_by = next.questions.some((q) => q.blocking && q.answered_value === undefined && !q.skipped)
    ? "questions"
    : next.ambiguities.length ? "ambiguity" : "nothing";
  return next;
}

function markAnswered(q: CherryQuestion, answers: Record<string, unknown>, skips: Set<string>): CherryQuestion {
  if (skips.has(q.id)) return { ...q, skipped: true };
  if (q.id in answers) return { ...q, answered_value: answers[q.id] };
  return q;
}

/** Keeps the pending proposal small enough to sit in a prompt. */
function slimPending(p: CherryProposal) {
  return {
    understanding: p.understanding,
    actions: p.actions.map((a) => ({
      id: a.id, table: a.table, operation: a.operation,
      target: a.target?.label ?? null, payload: a.payload,
    })),
    open_questions: p.questions.filter((q) => q.answered_value === undefined && !q.skipped).map((q) => q.prompt),
  };
}

function summarise(action: CherryAction, entityLabel: string): string {
  const spec = ENTITY_SCHEMA[action.table];
  const title = action.payload[spec.titleField] ?? action.target?.label ?? "";
  const bits: string[] = [];

  if (action.operation === "insert") {
    bits.push(`Create ${article(entityLabel)} ${entityLabel}`);
    if (title) bits.push(`"${title}"`);
  } else if (action.operation === "delete") {
    bits.push(`Delete the ${entityLabel} "${action.target?.label ?? ""}"`);
  } else {
    bits.push(`Update "${action.target?.label ?? title}"`);
    const changed = Object.keys(action.payload)
      .map((k) => spec.fields[k]?.label?.toLowerCase() ?? k)
      .filter(Boolean);
    if (changed.length) bits.push(`- ${changed.join(", ")}`);
  }
  return bits.join(" ");
}

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

export const CHERRY_ROUTE_TABLES: CherryTable[] = Object.keys(ENTITY_SCHEMA) as CherryTable[];
export type { CherryAmbiguity };
