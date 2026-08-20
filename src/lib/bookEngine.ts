// Turning a day's work into a page.
//
// The numbers come from real rows and nothing else - tasks actually completed,
// focus blocks actually run, meetings actually scheduled. Where the templated
// writer puts prose around them it is describing what the numbers say, never
// adding a claim they do not support. A page that flatters you is worthless as
// a record.
//
// This runs client-side against data already fetched. Cherry's AI layer can
// rewrite the narrative later; the metrics are computed here either way, so
// the figures on the page are the same whichever wrote it.

import {
  addDays, endOfWeek, format, isSameDay, isWithinInterval, parseISO, startOfWeek,
} from 'date-fns';
import type { FocusSessionRow, ProjectRow, TaskRow } from '@/hooks/useWorkData';

/** Monday. Passed explicitly everywhere - date-fns defaults to Sunday, which
 *  quietly put every "this week" boundary a day out. */
export const WEEK_OPTS = { weekStartsOn: 1 as const };

export const isoDate = (d: Date) => format(d, 'yyyy-MM-dd');
export const weekStartOf = (d: Date) => startOfWeek(d, WEEK_OPTS);

export interface DayMetrics {
  tasks_completed: number;
  tasks_created: number;
  focus_minutes: number;
  focus_sessions: number;
  interruptions: number;
  meetings: number;
  notes_written: number;
  milestones_hit: number;
  links_saved: number;
  projects_touched: number;
}

export interface DaySnapshot {
  date: string;
  metrics: DayMetrics;
  completedTitles: string[];
  createdTitles: string[];
  projectNames: string[];
  overdue: number;
}

interface Sourced {
  tasks: TaskRow[];
  projects: ProjectRow[];
  sessions: FocusSessionRow[];
  notes?: { id: string; title?: string; created_at: string }[];
  meetings?: { id: string; scheduled_at: string; project_id?: string | null }[];
  milestones?: { id: string; title?: string; date: string; is_completed?: boolean }[];
  links?: { id: string; created_at: string }[];
}

const onDate = (iso: string | null | undefined, day: Date) => {
  if (!iso) return false;
  try { return isSameDay(parseISO(iso), day); } catch { return false; }
};

export function buildDaySnapshot(day: Date, src: Sourced): DaySnapshot {
  const date = isoDate(day);

  // completed_at is a real column now. Before it existed this used updated_at,
  // which meant editing an old finished task counted it as finished again.
  const completed = src.tasks.filter((t) => t.status === 'done' && onDate(t.completed_at, day));
  const created = src.tasks.filter((t) => onDate(t.created_at, day));
  const sessions = src.sessions.filter((s) => !s.was_break && onDate(s.started_at, day));

  const projectIds = new Set<string>();
  for (const t of [...completed, ...created]) if (t.project_id) projectIds.add(t.project_id);
  for (const s of sessions) if (s.project_id) projectIds.add(s.project_id);

  const nameOf = (id: string) => src.projects.find((p) => p.id === id)?.name;
  const projectNames = [...projectIds].map(nameOf).filter((n): n is string => Boolean(n));

  const metrics: DayMetrics = {
    tasks_completed: completed.length,
    tasks_created: created.length,
    focus_minutes: sessions.reduce((a, s) => a + (s.actual_minutes || 0), 0),
    focus_sessions: sessions.length,
    interruptions: sessions.reduce((a, s) => a + (s.interruptions || 0), 0),
    meetings: (src.meetings ?? []).filter((m) => onDate(m.scheduled_at, day)).length,
    notes_written: (src.notes ?? []).filter((n) => onDate(n.created_at, day)).length,
    milestones_hit: (src.milestones ?? []).filter((m) => m.is_completed && m.date === date).length,
    links_saved: (src.links ?? []).filter((l) => onDate(l.created_at, day)).length,
    projects_touched: projectNames.length,
  };

  const overdue = src.tasks.filter(
    (t) => t.status !== 'done' && t.status !== 'dropped' && t.due_date && t.due_date < date,
  ).length;

  return {
    date,
    metrics,
    completedTitles: completed.map((t) => t.title),
    createdTitles: created.map((t) => t.title),
    projectNames,
    overdue,
  };
}

const duration = (mins: number) => {
  if (!mins) return '0m';
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
};

const list = (items: string[], max = 3): string => {
  const shown = items.slice(0, max);
  const rest = items.length - shown.length;
  const joined = shown.length > 1
    ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
    : shown[0] ?? '';
  return rest > 0 ? `${joined}, and ${rest} more` : joined;
};

/**
 * The templated writer.
 *
 * Every sentence is conditional on there being something to say. A day with
 * nothing logged gets a page that says so plainly rather than a paragraph of
 * filler - the empty page is information too.
 */
export function writeDayPage(s: DaySnapshot) {
  const m = s.metrics;
  const nothing = !m.tasks_completed && !m.focus_minutes && !m.meetings && !m.notes_written && !m.tasks_created;

  const highlights: string[] = [];
  const friction: string[] = [];

  if (m.tasks_completed) highlights.push(`Closed ${m.tasks_completed} ${m.tasks_completed === 1 ? 'task' : 'tasks'}: ${list(s.completedTitles)}.`);
  // Deciding what the work is *is* the work on a planning day. This used to be
  // a bare count in the metric strip, so a day spent scoping five things read
  // as an empty page with the number 5 on it - the titles were computed and
  // then thrown away.
  if (m.tasks_created) {
    highlights.push(`Put ${m.tasks_created} ${m.tasks_created === 1 ? 'task' : 'tasks'} on the board: ${list(s.createdTitles, 4)}.`);
  }
  if (m.focus_minutes) highlights.push(`${duration(m.focus_minutes)} of focused work across ${m.focus_sessions} ${m.focus_sessions === 1 ? 'block' : 'blocks'}.`);
  if (m.milestones_hit) highlights.push(`Hit ${m.milestones_hit} ${m.milestones_hit === 1 ? 'milestone' : 'milestones'}.`);
  if (m.meetings) highlights.push(`${m.meetings} ${m.meetings === 1 ? 'meeting' : 'meetings'}.`);
  if (m.notes_written) highlights.push(`Wrote ${m.notes_written} ${m.notes_written === 1 ? 'note' : 'notes'}.`);
  if (m.projects_touched > 1) highlights.push(`Moved work on ${list(s.projectNames)}.`);

  if (m.interruptions > 2) {
    friction.push(`${m.interruptions} interruptions across ${m.focus_sessions} blocks - the blocks were not really uninterrupted.`);
  }
  if (s.overdue) friction.push(`${s.overdue} ${s.overdue === 1 ? 'task is' : 'tasks are'} past their due date.`);
  // Only worth saying when something was also being finished. On a pure
  // planning day "the board grew" is the point, not a problem.
  if (m.tasks_created > m.tasks_completed + 2 && m.tasks_completed > 0) {
    friction.push(`You added ${m.tasks_created} and closed ${m.tasks_completed}. The board grew today.`);
  }
  if (m.focus_sessions === 0 && m.tasks_completed > 0) {
    friction.push('Things got done, but no focus block was recorded - so there is no picture of where the time went.');
  }

  const title = nothing
    ? 'A quiet one'
    : m.tasks_completed >= 3 || m.focus_minutes >= 180 ? 'A solid day'
    : m.tasks_completed ? 'Steady'
    : m.tasks_created ? 'Planning' : 'In motion';

  const summary = nothing
    ? 'Nothing was logged on this day. That is either a day off, or a day the tools did not see - both are worth knowing.'
    : [
        m.focus_minutes ? `${duration(m.focus_minutes)} of focused work` : null,
        m.tasks_completed ? `${m.tasks_completed} ${m.tasks_completed === 1 ? 'task' : 'tasks'} closed` : null,
        m.tasks_created ? `${m.tasks_created} ${m.tasks_created === 1 ? 'task' : 'tasks'} added` : null,
        m.meetings ? `${m.meetings} ${m.meetings === 1 ? 'meeting' : 'meetings'}` : null,
        m.notes_written ? `${m.notes_written} ${m.notes_written === 1 ? 'note' : 'notes'} written` : null,
        s.projectNames.length ? `work on ${list(s.projectNames, 2)}` : null,
      ].filter(Boolean).join(', ').replace(/,([^,]*)$/, ' and$1') + '.';

  return { title, summary: summary.charAt(0).toUpperCase() + summary.slice(1), highlights, friction };
}

// ------------------------------------------------------------- the week --

export interface WeekMetrics extends DayMetrics {
  days_logged: number;
  best_day: string | null;
  overdue_carried: number;
}

export function buildWeekSnapshot(weekStart: Date, src: Sourced) {
  const start = startOfWeek(weekStart, WEEK_OPTS);
  const end = endOfWeek(weekStart, WEEK_OPTS);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const daily = days.map((d) => buildDaySnapshot(d, src));

  const sum = (pick: (m: DayMetrics) => number) => daily.reduce((a, d) => a + pick(d.metrics), 0);

  // Measured against the week being looked at, not against today - the old
  // Weekly Review always used the current week, so browsing back through
  // history showed the same overdue count every time.
  const overdueCarried = src.tasks.filter(
    (t) => t.status !== 'done' && t.status !== 'dropped' && t.due_date && parseISO(t.due_date) < start,
  ).length;

  const best = daily.reduce<{ date: string; score: number } | null>((acc, d) => {
    const score = d.metrics.tasks_completed * 2 + d.metrics.focus_minutes / 30;
    return !acc || score > acc.score ? { date: d.date, score } : acc;
  }, null);

  const projectNames = [...new Set(daily.flatMap((d) => d.projectNames))];

  const metrics: WeekMetrics = {
    tasks_completed: sum((m) => m.tasks_completed),
    tasks_created: sum((m) => m.tasks_created),
    focus_minutes: sum((m) => m.focus_minutes),
    focus_sessions: sum((m) => m.focus_sessions),
    interruptions: sum((m) => m.interruptions),
    meetings: sum((m) => m.meetings),
    notes_written: sum((m) => m.notes_written),
    milestones_hit: sum((m) => m.milestones_hit),
    links_saved: sum((m) => m.links_saved),
    projects_touched: projectNames.length,
    days_logged: daily.filter((d) => d.metrics.tasks_completed || d.metrics.focus_minutes || d.metrics.meetings).length,
    best_day: best && best.score > 0 ? best.date : null,
    overdue_carried: overdueCarried,
  };

  const upcoming = src.tasks
    .filter((t) => t.status !== 'done' && t.status !== 'dropped' && t.due_date &&
      isWithinInterval(parseISO(t.due_date), { start: addDays(end, 1), end: addDays(end, 7) }))
    .map((t) => t.title);

  return {
    week_start: isoDate(start),
    metrics,
    daily: daily.map((d) => ({ date: d.date, label: format(parseISO(d.date), 'EEE'), completed: d.metrics.tasks_completed, focus: d.metrics.focus_minutes })),
    projectNames,
    upcoming,
  };
}

export function writeWeekPage(w: ReturnType<typeof buildWeekSnapshot>) {
  const m = w.metrics;
  const wins: string[] = [];
  const concerns: string[] = [];
  const focusNext: string[] = [];

  if (m.tasks_completed) wins.push(`${m.tasks_completed} tasks closed across ${m.days_logged} working ${m.days_logged === 1 ? 'day' : 'days'}.`);
  if (m.focus_minutes) wins.push(`${duration(m.focus_minutes)} of focused work in ${m.focus_sessions} blocks.`);
  if (m.milestones_hit) wins.push(`${m.milestones_hit} ${m.milestones_hit === 1 ? 'milestone' : 'milestones'} reached.`);
  if (w.projectNames.length) wins.push(`Progress on ${list(w.projectNames, 4)}.`);

  if (m.overdue_carried) concerns.push(`${m.overdue_carried} ${m.overdue_carried === 1 ? 'task was' : 'tasks were'} already overdue when the week began.`);
  if (m.tasks_created > m.tasks_completed) concerns.push(`You added ${m.tasks_created} and closed ${m.tasks_completed} - the backlog grew by ${m.tasks_created - m.tasks_completed}.`);
  if (m.days_logged <= 2 && m.tasks_completed) concerns.push(`Everything landed in ${m.days_logged} ${m.days_logged === 1 ? 'day' : 'days'}. That is a burst, not a rhythm.`);
  if (m.focus_sessions && m.interruptions / m.focus_sessions > 2) concerns.push(`Around ${Math.round(m.interruptions / m.focus_sessions)} interruptions per block.`);

  for (const t of w.upcoming.slice(0, 4)) focusNext.push(t);

  const summary = m.days_logged === 0
    ? 'Nothing was recorded this week.'
    : `${m.tasks_completed} closed, ${duration(m.focus_minutes)} focused, across ${m.days_logged} ${m.days_logged === 1 ? 'day' : 'days'} of activity.`;

  const title = m.days_logged === 0 ? 'A blank week'
    : m.tasks_completed >= 10 ? 'A heavy week'
    : m.tasks_completed >= 4 ? 'A steady week' : 'A light week';

  return { title, summary, wins, concerns, focus_next: focusNext };
}
