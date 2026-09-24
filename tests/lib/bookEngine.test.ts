/**
 * The book engine: what a day and a week actually count.
 *
 * Worth pinning down because every figure here is a claim about the user's
 * own record, and three of the bugs the source comments describe were
 * off-by-one date errors that a reader would never spot on the page.
 */

import { describe, expect, it } from 'vitest';
import {
  buildDaySnapshot,
  buildWeekSnapshot,
  isoDate,
  weekStartOf,
  writeDayPage,
  writeWeekPage,
} from '@/lib/bookEngine';
import type { FocusSessionRow, ProjectRow, TaskRow } from '@/hooks/useWorkData';

const task = (over: Partial<TaskRow> = {}): TaskRow => ({
  id: 't1', title: 'A task', description: null,
  content_json: null, content_text: null,
  status: 'todo', priority: 'medium',
  due_date: null, due_time: null, completed_at: null,
  project_id: null, assignee_id: null,
  time_estimate_min: null, sort_order: 0,
  created_at: '2026-03-02T09:00:00.000Z', updated_at: '2026-03-02T09:00:00.000Z',
  ...over,
});

const session = (over: Partial<FocusSessionRow> = {}): FocusSessionRow => ({
  id: 's1', task_id: null, project_id: null,
  started_at: '2026-03-02T10:00:00.000Z', ended_at: null,
  planned_minutes: 25, actual_minutes: 25,
  was_break: false, interruptions: 0, completed: true,
  note: null, created_at: '2026-03-02T10:00:00.000Z',
  ...over,
});

const project = (over: Partial<ProjectRow> = {}): ProjectRow => ({
  id: 'p1', name: 'Atlas', description: null, status: 'active',
  color: null, type: null, tags: null, slug: null,
  start_date: null, target_end_date: null,
  repo_url: null, status_note: null,
  created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
  ...over,
});

const empty = { tasks: [], projects: [], sessions: [] };

// Monday 2 March 2026.
const MONDAY = new Date('2026-03-02T12:00:00.000Z');

describe('weekStartOf', () => {
  it('starts the week on Monday, not Sunday', () => {
    // date-fns defaults to Sunday, which put every week boundary a day out.
    expect(isoDate(weekStartOf(new Date('2026-03-04T12:00:00.000Z')))).toBe('2026-03-02');
  });

  it('treats Sunday as the end of the week it closes', () => {
    expect(isoDate(weekStartOf(new Date('2026-03-08T12:00:00.000Z')))).toBe('2026-03-02');
  });

  it('is stable on the Monday itself', () => {
    expect(isoDate(weekStartOf(MONDAY))).toBe('2026-03-02');
  });
});

describe('buildDaySnapshot', () => {
  it('counts a task as completed on its completed_at, not its updated_at', () => {
    // Before completed_at existed this used updated_at, so editing an old
    // finished task counted it as finished again today.
    const snap = buildDaySnapshot(MONDAY, {
      ...empty,
      tasks: [
        task({ status: 'done', completed_at: '2026-02-20T09:00:00.000Z', updated_at: '2026-03-02T09:00:00.000Z' }),
      ],
    });
    expect(snap.metrics.tasks_completed).toBe(0);
  });

  it('counts one completed on the day itself', () => {
    const snap = buildDaySnapshot(MONDAY, {
      ...empty,
      tasks: [task({ status: 'done', completed_at: '2026-03-02T16:00:00.000Z' })],
    });
    expect(snap.metrics.tasks_completed).toBe(1);
    expect(snap.completedTitles).toEqual(['A task']);
  });

  it('ignores a done task with no completed_at', () => {
    const snap = buildDaySnapshot(MONDAY, {
      ...empty,
      tasks: [task({ status: 'done', completed_at: null })],
    });
    expect(snap.metrics.tasks_completed).toBe(0);
  });

  it('excludes break sessions from focus time', () => {
    const snap = buildDaySnapshot(MONDAY, {
      ...empty,
      sessions: [session({ actual_minutes: 50 }), session({ id: 's2', was_break: true, actual_minutes: 10 })],
    });
    expect(snap.metrics.focus_minutes).toBe(50);
    expect(snap.metrics.focus_sessions).toBe(1);
  });

  it('names each project touched once, however many rows touched it', () => {
    const snap = buildDaySnapshot(MONDAY, {
      ...empty,
      projects: [project()],
      tasks: [
        task({ id: 'a', status: 'done', completed_at: '2026-03-02T11:00:00.000Z', project_id: 'p1' }),
        task({ id: 'b', created_at: '2026-03-02T11:30:00.000Z', project_id: 'p1' }),
      ],
      sessions: [session({ project_id: 'p1' })],
    });
    expect(snap.projectNames).toEqual(['Atlas']);
    expect(snap.metrics.projects_touched).toBe(1);
  });

  it('drops a project id that no longer resolves to a name', () => {
    const snap = buildDaySnapshot(MONDAY, {
      ...empty,
      projects: [],
      tasks: [task({ status: 'done', completed_at: '2026-03-02T11:00:00.000Z', project_id: 'gone' })],
    });
    expect(snap.projectNames).toEqual([]);
  });

  it('counts overdue strictly before the day, never including it', () => {
    const snap = buildDaySnapshot(MONDAY, {
      ...empty,
      tasks: [
        task({ id: 'a', due_date: '2026-03-01' }),
        task({ id: 'b', due_date: '2026-03-02' }),
        task({ id: 'c', due_date: '2026-02-01', status: 'done' }),
        task({ id: 'd', due_date: '2026-02-01', status: 'dropped' }),
      ],
    });
    // Only 'a'. A task due today is not late, and done/dropped never are.
    expect(snap.overdue).toBe(1);
  });

  it('survives an unparseable timestamp rather than throwing', () => {
    const snap = buildDaySnapshot(MONDAY, {
      ...empty,
      tasks: [task({ status: 'done', completed_at: 'not a date' })],
    });
    expect(snap.metrics.tasks_completed).toBe(0);
  });

  it('counts milestones by exact date string', () => {
    const snap = buildDaySnapshot(MONDAY, {
      ...empty,
      milestones: [
        { id: 'm1', date: '2026-03-02', is_completed: true },
        { id: 'm2', date: '2026-03-02', is_completed: false },
        { id: 'm3', date: '2026-03-03', is_completed: true },
      ],
    });
    expect(snap.metrics.milestones_hit).toBe(1);
  });
});

describe('buildWeekSnapshot', () => {
  it('sums the seven days from its Monday', () => {
    const week = buildWeekSnapshot(MONDAY, {
      ...empty,
      tasks: [
        task({ id: 'a', status: 'done', completed_at: '2026-03-02T10:00:00.000Z' }),
        task({ id: 'b', status: 'done', completed_at: '2026-03-08T10:00:00.000Z' }),
        task({ id: 'c', status: 'done', completed_at: '2026-03-09T10:00:00.000Z' }),
      ],
    });
    // Monday to Sunday inclusive: 'a' and 'b'. 'c' is the next Monday.
    expect(week.metrics.tasks_completed).toBe(2);
  });

  it('measures carried overdue against the week shown, not against today', () => {
    // The Weekly Review always used the current week, so browsing back through
    // history showed the same overdue count on every page.
    const week = buildWeekSnapshot(MONDAY, {
      ...empty,
      tasks: [
        task({ id: 'a', due_date: '2026-02-25' }),
        task({ id: 'b', due_date: '2026-03-04' }),
      ],
    });
    expect(week.metrics.overdue_carried).toBe(1);
  });

  it('picks the best day by completions weighted against focus time', () => {
    const week = buildWeekSnapshot(MONDAY, {
      ...empty,
      tasks: [task({ id: 'a', status: 'done', completed_at: '2026-03-03T10:00:00.000Z' })],
      sessions: [session({ started_at: '2026-03-05T10:00:00.000Z', actual_minutes: 180 })],
    });
    // 180 focus minutes scores 6, one completion scores 2.
    expect(week.metrics.best_day).toBe('2026-03-05');
  });

  it('has no best day in a week with nothing in it', () => {
    expect(buildWeekSnapshot(MONDAY, empty).metrics.best_day).toBeNull();
  });

  it('counts only days that actually had something logged', () => {
    const week = buildWeekSnapshot(MONDAY, {
      ...empty,
      tasks: [task({ id: 'a', status: 'done', completed_at: '2026-03-03T10:00:00.000Z' })],
      sessions: [session({ started_at: '2026-03-05T10:00:00.000Z' })],
    });
    expect(week.metrics.days_logged).toBe(2);
  });
});

describe('the templated writer', () => {
  it('says plainly that nothing was logged rather than padding', () => {
    const page = writeDayPage(buildDaySnapshot(MONDAY, empty));
    expect(JSON.stringify(page).length).toBeGreaterThan(0);
    expect(JSON.stringify(page)).not.toMatch(/undefined|NaN/);
  });

  it('never emits undefined or NaN for a full day', () => {
    const page = writeDayPage(
      buildDaySnapshot(MONDAY, {
        ...empty,
        projects: [project()],
        tasks: [task({ status: 'done', completed_at: '2026-03-02T10:00:00.000Z', project_id: 'p1' })],
        sessions: [session({ actual_minutes: 95 })],
      }),
    );
    expect(JSON.stringify(page)).not.toMatch(/undefined|NaN/);
  });

  it('writes a week page without undefined or NaN', () => {
    const page = writeWeekPage(buildWeekSnapshot(MONDAY, empty));
    expect(JSON.stringify(page)).not.toMatch(/undefined|NaN/);
  });
});
