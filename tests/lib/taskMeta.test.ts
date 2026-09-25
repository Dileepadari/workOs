// Covers task status and priority ordering, labels and transitions.
import { describe, it, expect } from 'vitest';
import { TASK_STATUSES, TASK_STATUS_LABELS, TASK_STATUS_COLORS, TASK_PRIORITIES, PRIORITY_COLORS, getNextStatus, sortTasks, type TaskLike, dueDay, dueDateAtLocalMidnight } from '@/lib/taskMeta';

const task = (over: Partial<TaskLike> = {}): TaskLike => ({
  status: 'todo',
  priority: 'medium',
  due_date: null,
  created_at: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('metadata maps', () => {
  it('covers every status and priority', () => {
    for (const status of TASK_STATUSES) {
      expect(TASK_STATUS_LABELS[status]).toBeTruthy();
      expect(TASK_STATUS_COLORS[status]).toBeTruthy();
    }
    for (const priority of TASK_PRIORITIES) {
      expect(PRIORITY_COLORS[priority]).toBeTruthy();
    }
  });
});

describe('getNextStatus', () => {
  it('advances through the working states', () => {
    expect(getNextStatus('todo')).toBe('in_progress');
    expect(getNextStatus('in_progress')).toBe('done');
    expect(getNextStatus('blocked')).toBe('in_progress');
  });

  it('has no next step for terminal states', () => {
    expect(getNextStatus('done')).toBeUndefined();
    expect(getNextStatus('dropped')).toBeUndefined();
  });
});

describe('sortTasks', () => {
  it('does not mutate the input array', () => {
    const input = [task({ created_at: '2026-01-01T00:00:00.000Z' }), task({ created_at: '2026-02-01T00:00:00.000Z' })];
    const copy = [...input];
    sortTasks(input, 'created_at');
    expect(input).toEqual(copy);
  });

  it('sorts newest first by created_at', () => {
    const older = task({ created_at: '2026-01-01T00:00:00.000Z' });
    const newer = task({ created_at: '2026-06-01T00:00:00.000Z' });
    expect(sortTasks([older, newer], 'created_at')).toEqual([newer, older]);
  });

  it('sorts by priority, most urgent first', () => {
    const low = task({ priority: 'low' });
    const urgent = task({ priority: 'urgent' });
    const high = task({ priority: 'high' });
    expect(sortTasks([low, urgent, high], 'priority')).toEqual([urgent, high, low]);
  });

  it('sorts by due date and pushes undated tasks to the end', () => {
    const undated = task({ due_date: null });
    const soon = task({ due_date: '2026-03-01' });
    const later = task({ due_date: '2026-09-01' });
    expect(sortTasks([undated, later, soon], 'due_date')).toEqual([soon, later, undated]);
  });

  it('sorts by explicit manual order, treating a missing order as first', () => {
    const third = task({ sort_order: 3 });
    const first = task({ sort_order: 1 });
    const unset = task();
    expect(sortTasks([third, first, unset], 'manual')).toEqual([unset, first, third]);
  });
});

describe('dueDay', () => {
  it('passes a bare date through', () => {
    expect(dueDay('2026-10-03')).toBe('2026-10-03');
  });

  it('takes the day out of a full timestamp', () => {
    // The column is declared DATE in the migrations, but the deployed database
    // hands back a timestamp. Appending a time to the raw value built
    // "2026-10-03T00:00:00.000ZT00:00:00", which is an invalid date - and
    // format() throws on one, which unmounted the entire Tasks page.
    expect(dueDay('2026-10-03T00:00:00.000Z')).toBe('2026-10-03');
  });

  it('returns null for nothing, and for something that is not a date', () => {
    expect(dueDay(null)).toBeNull();
    expect(dueDay(undefined)).toBeNull();
    expect(dueDay('')).toBeNull();
    expect(dueDay('tomorrow')).toBeNull();
  });
});

describe('dueDateAtLocalMidnight', () => {
  it('builds a valid date from a timestamp', () => {
    const d = dueDateAtLocalMidnight('2026-10-03T00:00:00.000Z');
    expect(d).not.toBeNull();
    expect(Number.isNaN((d as Date).getTime())).toBe(false);
  });

  it('lands on local midnight of that day, not a UTC instant', () => {
    // Parsing the timestamp directly would give a UTC instant that can fall on
    // the previous calendar day west of Greenwich, so a task due the 3rd reads
    // as due the 2nd.
    const d = dueDateAtLocalMidnight('2026-10-03T00:00:00.000Z') as Date;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(9);
    expect(d.getDate()).toBe(3);
    expect(d.getHours()).toBe(0);
  });

  it('agrees for both shapes of the same day', () => {
    const a = dueDateAtLocalMidnight('2026-10-03') as Date;
    const b = dueDateAtLocalMidnight('2026-10-03T00:00:00.000Z') as Date;
    expect(a.getTime()).toBe(b.getTime());
  });

  it('returns null rather than an Invalid Date', () => {
    expect(dueDateAtLocalMidnight(null)).toBeNull();
    expect(dueDateAtLocalMidnight('not a date')).toBeNull();
  });
});
