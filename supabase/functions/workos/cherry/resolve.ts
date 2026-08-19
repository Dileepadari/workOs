// Turning "the auth refactor" into a row id.
//
// The model describes; this decides. That split is what makes hallucinated ids
// impossible, and it is also where the "ask, never guess" rule lives: two rows
// that both look plausible produce a question, not a coin flip.
//
// Updates and deletes are treated asymmetrically on purpose. A wrong update is
// visible on the row and reversible from the undo token. A wrong delete of a
// row the user had forgotten existed is neither, so a delete that cannot be
// resolved to exactly one confident match is refused outright.

import type { CherryAmbiguity, CherryTable, CherryTarget } from "./types.ts";
import { type CherryContext, keywords } from "./context.ts";
import { ENTITY_SCHEMA } from "./schema.ts";

/** Tuned against real titles; expect to move them. Logged on every decision
 *  so there is data to move them with. */
export const RESOLVE = {
  /** Below this, nothing is a match at all. */
  floor: 0.35,
  /** At or above this, a clear winner is accepted. */
  confident: 0.55,
  /** ...provided it also beats the runner-up by this factor. */
  dominance: 1.4,
  /** Rows fetched per table before falling back to narrower filtering. */
  candidateCap: 500,
} as const;

export type Resolution =
  | { kind: "resolved"; target: CherryTarget }
  | { kind: "ambiguous"; candidates: CherryTarget[] }
  | { kind: "none"; searched: number };

// deno-lint-ignore no-explicit-any
type Db = any;

interface Candidate {
  id: string;
  label: string;
  score: number;
  detail: string;
  project_id: string | null;
}

export async function resolveTarget(
  db: Db,
  workspaceId: string,
  table: CherryTable,
  hint: { text: string; project_hint?: string | null; id_ref?: string | null },
  ctx: CherryContext,
  operation: "update" | "delete",
): Promise<Resolution> {
  const spec = ENTITY_SCHEMA[table];
  const titleField = spec.titleField;

  // A handle the model echoed back from the context block. It still has to be
  // checked - the handle map is this request's, so a stale or invented handle
  // simply misses.
  if (hint.id_ref) {
    const row = ctx.byHandle.get(hint.id_ref);
    if (row && row.table === table) {
      return {
        kind: "resolved",
        target: { id: row.id, table, label: row.label, context: row.detail, confidence: 1, matched_on: hint.text },
      };
    }
  }

  const { data } = await db
    .from(table)
    .select(`id, ${titleField}, project_id`)
    .eq("workspace_id", workspaceId)
    .limit(RESOLVE.candidateCap);

  const rows: Record<string, unknown>[] = data ?? [];
  if (!rows.length) return { kind: "none", searched: 0 };

  // A named project narrows the field hard; the page you are looking at only
  // nudges, so "mark X done" from a project page still finds X elsewhere
  // rather than reporting that it does not exist.
  const hintedProjectId = hint.project_hint
    ? ctx.projects.find((p) => keywordOverlap(hint.project_hint!, p.label) >= 0.5)?.id ?? null
    : null;

  const want = keywords(hint.text);
  const phrase = hint.text.toLowerCase().trim();

  const scored: Candidate[] = [];
  for (const row of rows) {
    const label = String(row[titleField] ?? "");
    if (!label) continue;
    const projectId = (row.project_id as string | null) ?? null;
    if (hintedProjectId && projectId && projectId !== hintedProjectId) continue;

    const have = keywords(label);
    if (!have.size || !want.size) continue;
    let shared = 0;
    for (const w of want) if (have.has(w)) shared++;
    if (!shared) continue;

    let score = shared / Math.min(want.size, have.size);
    const lower = label.toLowerCase();
    if (lower.includes(phrase) || phrase.includes(lower)) score += 0.25;
    if (hintedProjectId && projectId === hintedProjectId) score += 0.15;
    else if (ctx.scopeProjectId && projectId === ctx.scopeProjectId) score += 0.1;

    scored.push({ id: String(row.id), label, score, detail: describeRow(ctx, row, projectId), project_id: projectId });
  }

  scored.sort((a, b) => b.score - a.score);
  const above = scored.filter((c) => c.score >= RESOLVE.floor);
  if (!above.length) return { kind: "none", searched: rows.length };

  const [best, second] = above;
  const dominant = !second || best.score >= second.score * RESOLVE.dominance;

  if (best.score >= RESOLVE.confident && dominant) {
    return { kind: "resolved", target: toTarget(best, table, hint.text) };
  }

  // Deletes get no benefit of the doubt.
  if (operation === "delete" && !(best.score >= RESOLVE.confident && dominant)) {
    return above.length > 1
      ? { kind: "ambiguous", candidates: above.slice(0, 6).map((c) => toTarget(c, table, hint.text)) }
      : { kind: "none", searched: rows.length };
  }

  if (above.length > 1) {
    return { kind: "ambiguous", candidates: above.slice(0, 6).map((c) => toTarget(c, table, hint.text)) };
  }
  return { kind: "resolved", target: toTarget(best, table, hint.text) };
}

function toTarget(c: Candidate, table: CherryTable, matchedOn: string): CherryTarget {
  return {
    id: c.id, table, label: c.label,
    context: c.detail || undefined,
    confidence: Math.min(1, Number(c.score.toFixed(2))),
    matched_on: matchedOn,
  };
}

function describeRow(ctx: CherryContext, row: Record<string, unknown>, projectId: string | null): string {
  const bits: string[] = [];
  if (projectId) {
    const name = ctx.projects.find((p) => p.id === projectId)?.label;
    if (name) bits.push(`in ${name}`);
  }
  if (typeof row.status === "string") bits.push(String(row.status).replace(/_/g, " "));
  if (typeof row.due_date === "string") bits.push(`due ${row.due_date}`);
  return bits.join(" · ");
}

function keywordOverlap(a: string, b: string): number {
  const wa = keywords(a), wb = keywords(b);
  if (!wa.size || !wb.size) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / Math.min(wa.size, wb.size);
}

/**
 * Would this insert duplicate something that already exists?
 *
 * "Add a task to fix auth" said twice should not leave two identical rows, and
 * more importantly should not leave one when the first is still sitting there
 * open. A near-certain match becomes an update or a refusal instead.
 */
export async function findDuplicate(
  db: Db,
  workspaceId: string,
  table: CherryTable,
  title: string,
  ctx: CherryContext,
): Promise<CherryTarget | null> {
  const spec = ENTITY_SCHEMA[table];
  const { data } = await db
    .from(table)
    .select(`id, ${spec.titleField}, project_id`)
    .eq("workspace_id", workspaceId)
    .limit(RESOLVE.candidateCap);

  let best: Candidate | null = null;
  for (const row of data ?? []) {
    const label = String(row[spec.titleField] ?? "");
    const score = keywordOverlap(title, label);
    if (score >= 0.75 && (!best || score > best.score)) {
      best = {
        id: String(row.id), label, score,
        detail: describeRow(ctx, row, (row.project_id as string | null) ?? null),
        project_id: (row.project_id as string | null) ?? null,
      };
    }
  }
  return best ? toTarget(best, table, title) : null;
}

/** Real counts for what a delete would take with it. */
export async function countCascade(
  db: Db,
  workspaceId: string,
  table: CherryTable,
  rowId: string,
): Promise<{ summary: string[]; lost: { table: string; count: number; parent_id: string }[] }> {
  const cascades = ENTITY_SCHEMA[table].cherry.cascades ?? [];
  const summary: string[] = [];
  const lost: { table: string; count: number; parent_id: string }[] = [];

  for (const c of cascades) {
    const { count } = await db
      .from(c.table)
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq(c.column, rowId);
    const n = count ?? 0;
    if (!n) continue;
    if (c.onDelete === "cascade") {
      summary.push(`${n} ${n === 1 ? singular(c.table) : c.table} will be deleted`);
      lost.push({ table: c.table, count: n, parent_id: rowId });
    } else {
      summary.push(`${n} ${n === 1 ? singular(c.table) : c.table} will be unlinked but kept`);
    }
  }
  return { summary, lost };
}

function singular(table: string): string {
  return table.replace(/ies$/, "y").replace(/s$/, "");
}

export function ambiguityFor(actionId: string, table: CherryTable, candidates: CherryTarget[], phrase: string): CherryAmbiguity {
  const spec = ENTITY_SCHEMA[table];
  return {
    id: `${actionId}.target`,
    action_id: actionId,
    prompt: `More than one ${spec.label} matches "${phrase}". Which one do you mean?`,
    candidates,
    allow_all: false,
  };
}
