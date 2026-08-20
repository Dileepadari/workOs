// The slice of the workspace Cherry is allowed to see.
//
// Two constraints shape this. It has to be small - a workspace does not fit in
// a prompt and sending it would be slow, expensive and worse at the job. And
// it must not contain row ids: rows are exposed under short handles (p1, t7)
// minted per request and thrown away with it, so the model has no id to
// hallucinate and no id to be talked into by text inside somebody's note.
//
// Titles only, never bodies. That costs Cherry the ability to answer questions
// about a note's contents, which is a deliberate trade: note bodies are the
// most likely place for text that tries to give her instructions.

import type { CherryTable } from "./types.ts";

const TITLE_CAP = 90;
const CAPS = { projects: 60, members: 40, tasks: 25, keyword: 8 } as const;

export interface ContextRow {
  handle: string;
  id: string;
  table: CherryTable | "users";
  label: string;
  detail?: string;
  project_id?: string | null;
}

export interface CherryContext {
  today: string;
  weekday: string;
  /** handle -> row, for turning an id_ref back into a real id server-side. */
  byHandle: Map<string, ContextRow>;
  projects: ContextRow[];
  members: ContextRow[];
  tasks: ContextRow[];
  keywordHits: ContextRow[];
  scopeProjectId: string | null;
  /** Facts, for answering rather than for changing. See buildDigest. */
  digest: Digest;
}

/**
 * The numbers Cherry needs to answer a question.
 *
 * Without this she can only ever change things: the rest of the context is
 * titles and handles, so "what is due next" or "how many tasks are open" had
 * nothing behind them and she would either decline or guess. These are counted
 * server-side from real rows, so an answer she gives is arithmetic rather than
 * an impression.
 */
export interface Digest {
  openTasks: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  overdue: { title: string; due: string; project: string | null }[];
  overdueCount: number;
  upcoming: { title: string; due: string; project: string | null }[];
  unscheduled: number;
  meetings: { title: string; when: string; project: string | null }[];
  projects: { name: string; status: string; open: number; done: number }[];
  focusMinutesThisWeek: number;
  completedThisWeek: number;
}

const STOPWORDS = new Set([
  "the", "a", "an", "my", "our", "to", "for", "of", "and", "on", "in", "at", "it", "is", "was",
  "i", "we", "me", "add", "new", "create", "make", "set", "put", "get", "got", "do", "did",
  "please", "can", "you", "that", "this", "then", "with", "from", "about", "into", "up",
  "task", "tasks", "project", "projects", "note", "notes", "link", "links",
]);

/** Crude suffix stripping, on purpose - a real stemmer is overkill for
 *  matching two short titles, and people never repeat a title verbatim. */
export function stem(word: string): string {
  return word.replace(/(ing|ed|es|s)$/, "").replace(/e$/, "");
}

export function keywords(text: string): Set<string> {
  return new Set(
    String(text).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
      .map(stem)
      .filter((w) => w.length > 2),
  );
}

const truncate = (s: string, n = TITLE_CAP) =>
  s.length > n ? `${s.slice(0, n - 1)}…` : s;

// deno-lint-ignore no-explicit-any
type Db = any;

export async function buildContext(
  db: Db,
  workspaceId: string,
  message: string,
  scopeProjectId: string | null,
): Promise<CherryContext> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const weekday = now.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });

  const byHandle = new Map<string, ContextRow>();
  let counter = 0;
  const mint = (prefix: string, id: string, table: ContextRow["table"], label: string, detail?: string, projectId?: string | null): ContextRow => {
    const row: ContextRow = { handle: `${prefix}${++counter}`, id, table, label, detail, project_id: projectId ?? null };
    byHandle.set(row.handle, row);
    return row;
  };

  const wanted = keywords(message);

  // Projects: a small closed set, and the thing most references hang off.
  const { data: projectRows } = await db
    .from("projects").select("id, name, status")
    .eq("workspace_id", workspaceId)
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(CAPS.projects);
  const projects = (projectRows ?? []).map((p: { id: string; name: string; status: string }) =>
    mint("p", p.id, "projects", truncate(p.name), p.status));

  // Members, for "assign it to sam".
  const { data: memberRows } = await db
    .from("workspace_members").select("user_id, users(id, username, display_name)")
    .eq("workspace_id", workspaceId).limit(CAPS.members);
  const members = (memberRows ?? [])
    .map((m: { users?: { id: string; username: string; display_name?: string } }) => m.users)
    .filter(Boolean)
    .map((u: { id: string; username: string; display_name?: string }) =>
      mint("u", u.id, "users", u.display_name || u.username, `@${u.username}`));

  // Open work, most recently touched. This is what "mark X done" usually means.
  const { data: taskRows } = await db
    .from("tasks").select("id, title, status, priority, project_id, due_date")
    .eq("workspace_id", workspaceId)
    .not("status", "in", "(done,dropped)")
    .order("updated_at", { ascending: false })
    .limit(CAPS.tasks);
  const tasks = (taskRows ?? []).map((t: { id: string; title: string; status: string; priority: string; project_id: string | null; due_date: string | null }) =>
    mint("t", t.id, "tasks", truncate(t.title),
      [t.status, t.priority, t.due_date ? `due ${t.due_date}` : null].filter(Boolean).join(" · "),
      t.project_id));

  // Anything else the words point at. Only searched when the message has
  // content words to search with.
  const keywordHits: ContextRow[] = [];
  if (wanted.size) {
    const extraTables: { table: CherryTable; titleCol: string; prefix: string }[] = [
      { table: "notes", titleCol: "title", prefix: "n" },
      { table: "milestones", titleCol: "title", prefix: "m" },
      { table: "meetings", titleCol: "title", prefix: "g" },
      { table: "events", titleCol: "title", prefix: "e" },
      { table: "links", titleCol: "title", prefix: "l" },
    ];
    for (const spec of extraTables) {
      const { data } = await db
        .from(spec.table).select(`id, ${spec.titleCol}, project_id`)
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(120);
      const scored = (data ?? [])
        .map((r: Record<string, unknown>) => {
          const label = String(r[spec.titleCol] ?? "");
          const have = keywords(label);
          let shared = 0;
          for (const w of wanted) if (have.has(w)) shared++;
          return { r, label, shared };
        })
        .filter((x: { shared: number }) => x.shared > 0)
        .sort((a: { shared: number }, b: { shared: number }) => b.shared - a.shared)
        .slice(0, CAPS.keyword);
      for (const hit of scored) {
        keywordHits.push(mint(spec.prefix, String(hit.r.id), spec.table, truncate(hit.label), undefined, (hit.r.project_id as string) ?? null));
      }
    }
  }

  const digest = await buildDigest(db, workspaceId, today, projects);

  return { today, weekday, byHandle, projects, members, tasks, keywordHits, scopeProjectId, digest };
}

/** Counted from real rows, capped so the prompt stays small. */
async function buildDigest(
  db: Db,
  workspaceId: string,
  today: string,
  projects: ContextRow[],
): Promise<Digest> {
  const nameOf = (id: string | null) => (id ? projects.find((p) => p.id === id)?.label ?? null : null);

  const { data: taskRows } = await db
    .from("tasks")
    .select("title, status, priority, due_date, project_id, completed_at")
    .eq("workspace_id", workspaceId)
    .limit(1000);
  const tasks = (taskRows ?? []) as {
    title: string; status: string; priority: string;
    due_date: string | null; project_id: string | null; completed_at: string | null;
  }[];

  const live = tasks.filter((t) => t.status !== "done" && t.status !== "dropped");
  const byStatus: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  for (const t of live) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    byPriority[t.priority] = (byPriority[t.priority] ?? 0) + 1;
  }

  const dated = live.filter((t) => t.due_date).sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  const overdueAll = dated.filter((t) => t.due_date! < today);
  const upcomingAll = dated.filter((t) => t.due_date! >= today);

  const shape = (t: typeof tasks[number]) => ({
    title: t.title.slice(0, 80),
    due: t.due_date!,
    project: nameOf(t.project_id),
  });

  // Monday of this week, matching the book.
  const monday = new Date(`${today}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const weekStart = monday.toISOString().slice(0, 10);

  const completedThisWeek = tasks.filter(
    (t) => t.status === "done" && t.completed_at && t.completed_at.slice(0, 10) >= weekStart,
  ).length;

  const { data: meetingRows } = await db
    .from("meetings")
    .select("title, scheduled_at, project_id")
    .eq("workspace_id", workspaceId)
    .gte("scheduled_at", `${today}T00:00:00Z`)
    .order("scheduled_at", { ascending: true })
    .limit(5);

  const { data: focusRows } = await db
    .from("focus_sessions")
    .select("actual_minutes, was_break, started_at")
    .eq("workspace_id", workspaceId)
    .gte("started_at", `${weekStart}T00:00:00Z`)
    .limit(500);

  const openByProject = new Map<string, { open: number; done: number }>();
  for (const t of tasks) {
    if (!t.project_id) continue;
    const entry = openByProject.get(t.project_id) ?? { open: 0, done: 0 };
    if (t.status === "done") entry.done++;
    else if (t.status !== "dropped") entry.open++;
    openByProject.set(t.project_id, entry);
  }

  return {
    openTasks: live.length,
    byStatus,
    byPriority,
    overdue: overdueAll.slice(0, 5).map(shape),
    overdueCount: overdueAll.length,
    upcoming: upcomingAll.slice(0, 8).map(shape),
    unscheduled: live.filter((t) => !t.due_date).length,
    meetings: ((meetingRows ?? []) as { title: string; scheduled_at: string; project_id: string | null }[])
      .map((m) => ({ title: m.title.slice(0, 80), when: m.scheduled_at, project: nameOf(m.project_id) })),
    projects: projects.map((p) => ({
      name: p.label,
      status: p.detail ?? "active",
      open: openByProject.get(p.id)?.open ?? 0,
      done: openByProject.get(p.id)?.done ?? 0,
    })),
    focusMinutesThisWeek: ((focusRows ?? []) as { actual_minutes: number; was_break: boolean }[])
      .filter((f) => !f.was_break)
      .reduce((a, f) => a + (f.actual_minutes || 0), 0),
    completedThisWeek,
  };
}

/** The context as the model sees it: handles and labels, no ids. */
export function renderContext(ctx: CherryContext): string {
  const lines: string[] = [];
  const section = (title: string, rows: ContextRow[]) => {
    if (!rows.length) return;
    lines.push(`${title}:`);
    for (const r of rows) {
      const project = r.project_id
        ? ctxProjectName(ctx, r.project_id)
        : null;
      const bits = [r.detail, project ? `in ${project}` : null].filter(Boolean).join(" · ");
      lines.push(`  ${r.handle}  ${r.label}${bits ? `  (${bits})` : ""}`);
    }
  };

  section("Projects", ctx.projects);
  section("People", ctx.members);
  section("Open tasks", ctx.tasks);
  section("Other matches", ctx.keywordHits);

  const d = ctx.digest;
  lines.push("");
  lines.push("Where things stand right now:");
  lines.push(`  ${d.openTasks} open tasks (${Object.entries(d.byStatus).map(([k, v]) => `${v} ${k.replace(/_/g, " ")}`).join(", ") || "none"})`);
  if (Object.keys(d.byPriority).length) {
    lines.push(`  by priority: ${Object.entries(d.byPriority).map(([k, v]) => `${v} ${k}`).join(", ")}`);
  }
  lines.push(`  ${d.overdueCount} overdue, ${d.unscheduled} with no due date`);
  lines.push(`  ${d.completedThisWeek} closed this week, ${d.focusMinutesThisWeek} minutes of focus logged`);
  // One list, soonest first, with anything already past marked as such.
  // Overdue and upcoming used to be printed as two separate blocks, and asking
  // "what is my next deadline" reliably got the first *future* item back while
  // something already late sat unmentioned above it. Chronological order is
  // what anyone means by "next", and being late does not stop a deadline being
  // the nearest one.
  const deadlines = [
    ...d.overdue.map((t) => ({ ...t, late: true })),
    ...d.upcoming.map((t) => ({ ...t, late: false })),
  ];
  if (deadlines.length) {
    lines.push("  Deadlines, soonest first:");
    for (const t of deadlines) {
      lines.push(`    ${t.due}  ${t.title}${t.project ? ` (${t.project})` : ""}${t.late ? "  [OVERDUE]" : ""}`);
    }
  }
  if (d.meetings.length) {
    lines.push("  Upcoming meetings:");
    for (const m of d.meetings) lines.push(`    ${m.when}  ${m.title}${m.project ? ` (${m.project})` : ""}`);
  }
  if (d.projects.length) {
    lines.push("  Projects:");
    for (const p of d.projects) lines.push(`    ${p.name} - ${p.open} open, ${p.done} done, ${p.status}`);
  }

  if (ctx.scopeProjectId) {
    const name = ctxProjectName(ctx, ctx.scopeProjectId);
    if (name) lines.push(`\nThey are currently looking at the project "${name}".`);
  }
  return lines.join("\n") || "(this workspace is empty)";
}

function ctxProjectName(ctx: CherryContext, projectId: string): string | null {
  return ctx.projects.find((p) => p.id === projectId)?.label ?? null;
}
