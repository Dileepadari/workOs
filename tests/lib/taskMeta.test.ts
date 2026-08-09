import { describe, it, expect } from 'vitest';
import {
  TASK_STATUSES, TASK_STATUS_LABELS, TASK_STATUS_COLORS,
  TASK_PRIORITIES, PRIORITY_COLORS, getNextStatus, sortTasks, type TaskLike,
} from '@/lib/taskMeta';

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
