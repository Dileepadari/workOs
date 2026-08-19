// Cherry without a model.
//
// Regex and the workspace context, nothing else. It handles the imperative
// forms people actually type - "add a task to fix the header for Website due
// friday", "mark the auth work done", "delete the old landing page project" -
// and stops honestly when it cannot.
//
// The bias is deliberately toward asking rather than guessing. With no model
// there is no judgement to fall back on, so a half-understood sentence becomes
// "unclear" plus a specific question, never a plausible-looking wrong action.
// Everything it produces still goes through the same confirmation UI, so a
// weak parse is visible before anything is written.

import type { CherryDraft, CherryDraftCommand, CherryOperation, CherryTable } from "./types.ts";
import { type CherryContext, keywords, stem } from "./context.ts";

const TABLE_WORDS: { re: RegExp; table: CherryTable }[] = [
  { re: /\b(task|todo|to-?do|ticket)s?\b/i, table: "tasks" },
  { re: /\bprojects?\b/i, table: "projects" },
  { re: /\bnotes?\b/i, table: "notes" },
  { re: /\bmilestones?\b/i, table: "milestones" },
  { re: /\bmeetings?\b/i, table: "meetings" },
  { re: /\bevents?\b/i, table: "events" },
  { re: /\b(link|bookmark|url)s?\b/i, table: "links" },
  { re: /\bresources?\b/i, table: "resources" },
];

const INSERT_VERBS = /\b(add|create|new|make|start|log|note down|jot)\b/i;
const DELETE_VERBS = /\b(delete|remove|drop|get rid of|bin)\b/i;
const UPDATE_VERBS = /\b(mark|set|change|update|rename|move|reschedule|assign|finish|finished|complete|completed|done|close|closed|reopen)\b/i;

const STATUS_WORDS: { re: RegExp; value: string }[] = [
  { re: /\b(done|finished|complete[d]?|closed)\b/i, value: "done" },
  { re: /\b(in ?progress|started|doing|working on)\b/i, value: "in_progress" },
  { re: /\b(blocked|stuck|waiting)\b/i, value: "blocked" },
  { re: /\b(dropped|cancelled|canceled|abandoned)\b/i, value: "dropped" },
  { re: /\b(todo|to-?do|not started|reopen(ed)?)\b/i, value: "todo" },
];

const PRIORITY_WORDS: { re: RegExp; value: string }[] = [
  { re: /\b(urgent|asap|critical|emergency)\b/i, value: "urgent" },
  { re: /\bhigh(?: priority)?\b/i, value: "high" },
  { re: /\blow(?: priority)?\b/i, value: "low" },
  { re: /\b(medium|normal)(?: priority)?\b/i, value: "medium" },
];

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Dates people actually write. Anything else is left for the question. */
function parseDate(text: string, today: string): { value: string; quote: string } | null {
  const base = new Date(`${today}T12:00:00Z`);
  const add = (days: number) => { const d = new Date(base); d.setUTCDate(d.getUTCDate() + days); return iso(d); };

  let m = text.match(/\b(today|tonight)\b/i);
  if (m) return { value: today, quote: m[0] };
  m = text.match(/\btomorrow\b/i);
  if (m) return { value: add(1), quote: m[0] };
  m = text.match(/\byesterday\b/i);
  if (m) return { value: add(-1), quote: m[0] };

  m = text.match(/\bin (\d+) (day|week)s?\b/i);
  if (m) return { value: add(Number(m[1]) * (m[2].toLowerCase() === "week" ? 7 : 1)), quote: m[0] };

  m = text.match(/\b(next |this )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
  if (m) {
    const target = WEEKDAYS.indexOf(m[2].toLowerCase());
    const cur = base.getUTCDay();
    let delta = (target - cur + 7) % 7;
    // "monday" said on a Monday means the next one, not today.
    if (delta === 0) delta = 7;
    if (/next/i.test(m[1] ?? "") && delta < 7) delta += 7;
    return { value: add(delta), quote: m[0] };
  }

  m = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (m) return { value: m[1], quote: m[0] };

  m = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (m) {
    const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : base.getUTCFullYear();
    // Day-first, matching how the app formats dates elsewhere.
    const day = Number(m[1]), month = Number(m[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { value: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, quote: m[0] };
    }
  }
  return null;
}

function parseTime(text: string): { value: string; quote: string } | null {
  const m = text.match(/\bat (\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const mins = m[2] ?? "00";
  const suffix = m[3]?.toLowerCase();
  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  if (hour > 23) return null;
  return { value: `${String(hour).padStart(2, "0")}:${mins}`, quote: m[0] };
}

/** Best-scoring context row for a phrase, or null when nothing is close. */
function bestMatch(phrase: string, rows: { handle: string; label: string }[]): { handle: string; score: number } | null {
  const want = keywords(phrase);
  if (!want.size) return null;
  let best: { handle: string; score: number } | null = null;
  for (const row of rows) {
    const have = keywords(row.label);
    if (!have.size) continue;
    let shared = 0;
    for (const w of want) if (have.has(w)) shared++;
    if (!shared) continue;
    let score = shared / Math.min(want.size, have.size);
    if (row.label.toLowerCase().includes(phrase.toLowerCase().trim())) score += 0.25;
    if (!best || score > best.score) best = { handle: row.handle, score };
  }
  return best && best.score >= 0.5 ? best : null;
}

const FIELD_PREPOSITIONS = /\s+\b(for|in|on|by|due|at|with|to|priority|assigned? to|before|after)\b/i;

/** The title, taken as the span between the entity noun and the first
 *  field-introducing word. Quoted text always wins if present. */
function extractTitle(clause: string, table: CherryTable): string | null {
  const quoted = clause.match(/["“']([^"”']{2,200})["”']/);
  if (quoted) return quoted[1].trim();

  let rest = clause;
  const noun = TABLE_WORDS.find((t) => t.table === table)?.re;
  if (noun) {
    const m = rest.match(noun);
    if (m && m.index !== undefined) rest = rest.slice(m.index + m[0].length);
  }
  rest = rest.replace(INSERT_VERBS, " ").replace(/^\s*(to|that|called|named|titled|about|saying)\b/i, " ");
  const cut = rest.search(FIELD_PREPOSITIONS);
  if (cut > 0) rest = rest.slice(0, cut);
  const title = rest.replace(/\s+/g, " ").trim().replace(/[.,;:]+$/, "");
  return title.length >= 2 ? title : null;
}

function detectTable(clause: string): CherryTable | null {
  for (const t of TABLE_WORDS) if (t.re.test(clause)) return t.table;
  return null;
}

function detectOperation(clause: string): CherryOperation | null {
  if (DELETE_VERBS.test(clause)) return "delete";
  if (INSERT_VERBS.test(clause)) return "insert";
  if (UPDATE_VERBS.test(clause)) return "update";
  return null;
}

export function parseCommandLexically(message: string, ctx: CherryContext): CherryDraft {
  const text = message.trim();
  const clauses = text
    .split(/\s*(?:;|\n|,?\s+and then\s+|\.\s+)\s*/)
    .map((c) => c.trim())
    .filter((c) => c.length > 2);

  const commands: CherryDraftCommand[] = [];
  let unparsed = 0;

  for (const clause of clauses) {
    const operation = detectOperation(clause);
    if (!operation) { unparsed++; continue; }

    // With no entity noun, a "mark X done" style clause is still almost
    // certainly about a task - that is the only thing with a status. Anything
    // else without a noun is genuinely ambiguous.
    let table = detectTable(clause);
    if (!table && operation === "update" && STATUS_WORDS.some((s) => s.re.test(clause))) table = "tasks";
    if (!table && operation === "insert") table = "tasks";
    if (!table) { unparsed++; continue; }

    const fields: CherryDraftCommand["fields"] = [];
    const push = (name: string, value: string | number | boolean | null, quote: string) =>
      fields.push({ name, value, quote });

    // Project scoping: a small closed set, so this is reliable.
    let projectHint: string | null = null;
    const projMatch = clause.match(/\b(?:for|in|on|under)\s+(?:the\s+)?([\w][\w\s&'-]{1,60})/i);
    if (projMatch) {
      const hit = bestMatch(projMatch[1], ctx.projects);
      if (hit) {
        projectHint = projMatch[1].trim();
        if (table !== "projects") push("project_id", ctx.byHandle.get(hit.handle)!.id, projMatch[0]);
      }
    }

    if (operation === "insert") {
      const title = extractTitle(clause, table);
      if (!title) { unparsed++; continue; }
      push(table === "projects" ? "name" : "title", title, title);

      const due = parseDate(clause, ctx.today);
      if (due) push(table === "meetings" || table === "events" ? "scheduled_at" : "due_date", due.value, due.quote);
      const time = parseTime(clause);
      if (time && table === "tasks") push("due_time", time.value, time.quote);

      const pri = PRIORITY_WORDS.find((p) => p.re.test(clause));
      if (pri && table === "tasks") push("priority", pri.value, clause.match(pri.re)![0]);

      const url = clause.match(/\bhttps?:\/\/\S+/i);
      if (url) push("url", url[0], url[0]);

      const assignee = clause.match(/@([\w.-]+)/);
      if (assignee) {
        const hit = bestMatch(assignee[1], ctx.members);
        if (hit) push("assignee_id", ctx.byHandle.get(hit.handle)!.id, assignee[0]);
      }

      commands.push({ table, operation, target_hint: null, fields });
      continue;
    }

    // update / delete both need something to point at.
    const targetText = extractTargetPhrase(clause, table, operation);
    if (!targetText) { unparsed++; continue; }

    if (operation === "update") {
      const status = STATUS_WORDS.find((s) => s.re.test(clause));
      if (status && table === "tasks") push("status", status.value, clause.match(status.re)![0]);
      const pri = PRIORITY_WORDS.find((p) => p.re.test(clause));
      if (pri && table === "tasks") push("priority", pri.value, clause.match(pri.re)![0]);
      const due = parseDate(clause, ctx.today);
      if (due && /\b(due|by|resched|move)\b/i.test(clause)) push("due_date", due.value, due.quote);
      const rename = clause.match(/\brename\s+.*?\s+to\s+["“']?([^"”']{2,200})["”']?$/i);
      if (rename) push(table === "projects" ? "name" : "title", rename[1].trim(), rename[0]);

      // An update that changes nothing is not an update.
      if (!fields.some((f) => f.name !== "project_id")) { unparsed++; continue; }
    }

    commands.push({
      table, operation,
      target_hint: { text: targetText, project_hint: projectHint, id_ref: null },
      fields: operation === "delete" ? [] : fields,
    });
  }

  if (!commands.length) {
    return {
      understanding: "",
      intent_kind: "unclear",
      reply: unparsed
        ? "I'm running without an AI key, so I only follow fairly direct instructions. Try something like \"add a task to fix the header for Website, due Friday\" or \"mark the auth work done\"."
        : "I didn't catch a change in that. Tell me what to add, change or remove.",
      commands: [],
    };
  }

  const kinds = new Set(commands.map((c) => c.operation));
  const intent = kinds.size > 1
    ? "mixed"
    : kinds.has("insert") ? "create" : kinds.has("delete") ? "delete" : "modify";

  return {
    understanding: describe(commands),
    intent_kind: intent,
    reply: unparsed
      ? `I got ${commands.length} of that. Some of it I couldn't follow without an AI key.`
      : "",
    commands,
  };
}

function extractTargetPhrase(clause: string, table: CherryTable, operation: CherryOperation): string | null {
  const quoted = clause.match(/["“']([^"”']{2,200})["”']/);
  if (quoted) return quoted[1].trim();

  let rest = clause
    .replace(operation === "delete" ? DELETE_VERBS : UPDATE_VERBS, " ")
    .replace(TABLE_WORDS.find((t) => t.table === table)?.re ?? /$^/, " ")
    .replace(/^\s*(the|my|that|this|a|an)\b/i, " ");

  // Trailing "... done" / "... to high" is the change, not the name.
  for (const s of STATUS_WORDS) rest = rest.replace(s.re, " ");
  for (const p of PRIORITY_WORDS) rest = rest.replace(p.re, " ");
  rest = rest.replace(/\bas\b|\bto\b(?=\s*$)/gi, " ");
  const cut = rest.search(/\s+\b(for|in|on|by|due|at|priority|assigned? to)\b/i);
  if (cut > 0) rest = rest.slice(0, cut);

  const phrase = rest.replace(/\s+/g, " ").trim().replace(/[.,;:]+$/, "");
  return phrase.split(/\s+/).filter((w) => stem(w).length > 2).length ? phrase : null;
}

function describe(commands: CherryDraftCommand[]): string {
  const bits = commands.map((c) => {
    const title = c.fields.find((f) => f.name === "title" || f.name === "name")?.value;
    if (c.operation === "insert") return `add a ${singular(c.table)}${title ? ` called "${title}"` : ""}`;
    if (c.operation === "delete") return `delete the ${singular(c.table)} you called "${c.target_hint?.text}"`;
    return `update "${c.target_hint?.text}"`;
  });
  const joined = bits.length === 1 ? bits[0] : `${bits.slice(0, -1).join(", ")} and ${bits[bits.length - 1]}`;
  return `You want me to ${joined}.`;
}

function singular(table: CherryTable): string {
  return table.replace(/ies$/, "y").replace(/s$/, "").replace(/_/g, " ");
}
