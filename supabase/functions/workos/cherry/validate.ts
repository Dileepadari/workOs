// What Cherry is allowed to write, and what she has to ask about first.
//
// Runs in two places, and the second one is the one that matters: /parse uses
// it to work out which questions to ask, and /apply re-runs it from scratch
// against the proposal in the request body, which is treated as untrusted. A
// hand-crafted request that drops the questions and posts the payload directly
// is rejected by exactly the same code that generated them.
//
// Honest scope note: this is a guardrail on Cherry, not a security boundary
// for the app. POST /data still accepts any column Postgres accepts. The real
// boundary remains the table allowlist, the membership checks, the server-side
// stamping of workspace_id/created_by, and the database's own constraints.

import type {
  CherryAction, CherryFieldSource, CherryFieldView, CherryQuestion, CherryTable,
} from "./types.ts";
import { ENTITY_SCHEMA, type FieldSpec } from "./schema.ts";

export interface ValidationOutcome {
  payload: Record<string, unknown>;
  fields: CherryFieldView[];
  questions: CherryQuestion[];
  refusals: { reason: string; detail: string }[];
  /** Set when a required field has no value and no answer. Blocks /apply. */
  missingRequired: string[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^\d{2}:\d{2}$/;

/**
 * Checks one action's payload against its entity spec.
 *
 * `grounded` carries the message text so ungrounded model output can be
 * dropped: a value the model supplied with no quote and no supporting phrase
 * in the message becomes a question instead of a write. Pass null to skip that
 * check, which is what /apply does - by then the values came from the user.
 */
export function validateAction(
  action: CherryAction,
  message: string | null,
  answers: Record<string, unknown> = {},
  skipped: Set<string> = new Set(),
): ValidationOutcome {
  const spec = ENTITY_SCHEMA[action.table];
  const out: ValidationOutcome = {
    payload: {}, fields: [], questions: [], refusals: [], missingRequired: [],
  };

  if (!spec) {
    out.refusals.push({ reason: "table_not_allowed", detail: `Cherry cannot touch ${action.table}.` });
    return out;
  }

  const allowed =
    action.operation === "insert" ? spec.cherry.allowInsert :
    action.operation === "update" ? spec.cherry.allowUpdate :
    spec.cherry.allowDelete;
  if (!allowed) {
    out.refusals.push({
      reason: "operation_not_allowed",
      detail: `Cherry does not ${action.operation === "insert" ? "create" : action.operation} ${spec.labelPlural}.`,
    });
    return out;
  }

  // A delete carries no payload by construction, so there is nothing to check.
  if (action.operation === "delete") return out;

  const sources = new Map<string, CherryFieldSource>();

  for (const [name, raw] of Object.entries(action.payload ?? {})) {
    const field = spec.fields[name];
    if (!field) {
      // Silently dropping would let a model quietly set columns nobody
      // reviewed; saying so keeps it visible.
      out.refusals.push({ reason: "unknown_field", detail: `Ignored "${name}" - not something a ${spec.label} has.` });
      continue;
    }
    const checked = coerce(raw, field);
    if (checked.error) {
      out.refusals.push({ reason: "bad_value", detail: `Ignored ${field.label}: ${checked.error}` });
      continue;
    }
    if (checked.value === null || checked.value === undefined) continue;

    // Ungrounded values become questions rather than writes.
    if (message !== null && field.evidence && !field.evidence.test(message)) {
      out.questions.push(question(action.id, name, field, spec.label));
      continue;
    }

    out.payload[name] = checked.value;
    sources.set(name, "extracted");
  }

  // Answers the user has already given win over everything.
  for (const [key, value] of Object.entries(answers)) {
    if (!key.startsWith(`${action.id}.`)) continue;
    const name = key.slice(action.id.length + 1);
    const field = spec.fields[name];
    if (!field) continue;
    const checked = coerce(value, field);
    if (checked.error) {
      out.refusals.push({ reason: "bad_answer", detail: `${field.label}: ${checked.error}` });
      continue;
    }
    if (checked.value === null) continue;
    out.payload[name] = checked.value;
    sources.set(name, "answered");
  }

  // Defaults, for display only - the database applies its own.
  if (action.operation === "insert") {
    for (const [name, field] of Object.entries(spec.fields)) {
      if (field.default === undefined || name in out.payload) continue;
      sources.set(name, "default");
      out.fields.push(view(name, field, field.default, "default"));
    }
  }

  // What still needs asking.
  for (const [name, field] of Object.entries(spec.fields)) {
    if (name in out.payload) continue;
    if (skipped.has(`${action.id}.${name}`)) continue;
    // Only inserts need their required fields up front; an update just changes
    // what it changes.
    if (field.need === "required" && action.operation === "insert") {
      out.missingRequired.push(name);
      out.questions.push(question(action.id, name, field, spec.label));
    } else if (field.need === "recommended" && action.operation === "insert") {
      out.questions.push(question(action.id, name, field, spec.label));
    }
  }

  for (const [name, value] of Object.entries(out.payload)) {
    out.fields.push(view(name, spec.fields[name], value, sources.get(name) ?? "extracted"));
  }

  return out;
}

function question(actionId: string, name: string, field: FieldSpec, entityLabel: string): CherryQuestion {
  const blocking = field.need === "required";
  return {
    id: `${actionId}.${name}`,
    action_id: actionId,
    field: name,
    blocking,
    prompt: field.ask || `What should the ${entityLabel}'s ${field.label.toLowerCase()} be?`,
    input: inputFor(field),
    ...(blocking ? {} : { skip_label: field.skipLabel ?? `Skip ${field.label.toLowerCase()}` }),
  };
}

function inputFor(field: FieldSpec): CherryQuestion["input"] {
  switch (field.kind) {
    case "enum": return { kind: "enum", options: (field.enum ?? []).map((v) => ({ value: v, label: humanise(v) })) };
    case "date": return { kind: "date" };
    case "time": return { kind: "time" };
    case "timestamptz": return { kind: "text" };
    case "number": return { kind: "number", min: field.min, max: field.max };
    case "boolean": return { kind: "boolean" };
    case "tags": return { kind: "tags" };
    case "longtext": case "blocks": return { kind: "longtext" };
    case "ref:projects": return { kind: "row_ref", table: "projects", options: [] };
    case "ref:users": return { kind: "text" };
    default: return { kind: "text" };
  }
}

function view(name: string, field: FieldSpec | undefined, value: unknown, source: CherryFieldSource): CherryFieldView {
  return {
    field: name,
    label: field?.label ?? name,
    value,
    display: display(value, field),
    source,
  };
}

function display(value: unknown, field?: FieldSpec): string {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "-";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (field?.kind === "enum") return humanise(String(value));
  const s = String(value);
  return s.length > 160 ? `${s.slice(0, 159)}…` : s;
}

function humanise(v: string): string {
  return v.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function coerce(raw: unknown, field: FieldSpec): { value?: unknown; error?: string } {
  if (raw === null || raw === undefined || raw === "") return { value: null };

  switch (field.kind) {
    case "number": {
      const n = Number(raw);
      if (!Number.isFinite(n)) return { error: "not a number" };
      if (field.min !== undefined && n < field.min) return { error: `must be at least ${field.min}` };
      if (field.max !== undefined && n > field.max) return { error: `must be at most ${field.max}` };
      return { value: Math.round(n) };
    }
    case "boolean":
      if (typeof raw === "boolean") return { value: raw };
      return { value: /^(true|yes|1|done)$/i.test(String(raw)) };
    case "date": {
      const s = String(raw).slice(0, 10);
      if (!ISO_DATE.test(s)) return { error: "needs to be a date" };
      return { value: s };
    }
    case "time": {
      const s = String(raw).slice(0, 5);
      if (!HHMM.test(s)) return { error: "needs to be a time like 14:30" };
      return { value: s };
    }
    case "timestamptz": {
      const t = Date.parse(String(raw));
      if (Number.isNaN(t)) return { error: "needs to be a date and time" };
      return { value: new Date(t).toISOString() };
    }
    case "enum": {
      const s = String(raw);
      if (!field.enum?.includes(s)) return { error: `must be one of ${field.enum?.join(", ")}` };
      return { value: s };
    }
    case "tags": {
      const arr = Array.isArray(raw)
        ? raw.map(String)
        : String(raw).split(",").map((s) => s.trim()).filter(Boolean);
      if (field.max && arr.length > field.max) return { error: `at most ${field.max}` };
      return { value: arr };
    }
    case "url": {
      const s = String(raw).trim();
      if (!/^https?:\/\//i.test(s)) return { error: "needs to start with http:// or https://" };
      return { value: s };
    }
    case "color": {
      const s = String(raw).trim();
      if (!/^#[0-9a-f]{6}$/i.test(s)) return { error: "needs to be a hex colour" };
      return { value: s };
    }
    default: {
      let s = String(raw);
      if (field.max && s.length > field.max) s = s.slice(0, field.max);
      return { value: s };
    }
  }
}

/** Guards that apply to a whole proposal rather than one action. */
export function checkLimits(actions: CherryAction[]): { reason: string; detail: string }[] {
  const refusals: { reason: string; detail: string }[] = [];
  const deletes = actions.filter((a) => a.operation === "delete");
  const projectDeletes = deletes.filter((a) => a.table === "projects");

  if (deletes.length > 5) {
    refusals.push({ reason: "too_many_deletes", detail: `That is ${deletes.length} deletions in one go. Ask me for a few at a time so you can see each one.` });
  }
  if (projectDeletes.length > 1) {
    refusals.push({ reason: "too_many_project_deletes", detail: "One project at a time - deleting a project takes its milestones and meetings with it." });
  }

  const perTable = new Map<CherryTable, number>();
  for (const a of actions) perTable.set(a.table, (perTable.get(a.table) ?? 0) + 1);
  for (const [table, n] of perTable) {
    const cap = ENTITY_SCHEMA[table]?.cherry.maxPerProposal ?? 0;
    if (n > cap) {
      refusals.push({ reason: "too_many", detail: `That is ${n} ${ENTITY_SCHEMA[table].labelPlural} at once; I will do ${cap}. Ask again for the rest.` });
    }
  }
  return refusals;
}
