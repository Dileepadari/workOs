// Single source of truth for task/project status & priority metadata.
// Previously reimplemented independently (and inconsistently) in
// Tasks.tsx, ProjectDetail.tsx, Dashboard.tsx, Projects.tsx.

export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done' | 'dropped';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type ProjectStatus = 'active' | 'on_hold' | 'archived';

export const TASK_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'done', 'dropped'];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  done: 'Done',
  dropped: 'Dropped',
};

// Tint kept low-opacity (/10, not /20) so text-on-tint clears WCAG AA
// contrast in dark mode — at /20 the tinted background sits too close in
// luminance to the same-hue text color to read reliably on a dark page.
export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  todo: 'bg-muted text-muted-foreground',
  in_progress: 'bg-primary/10 text-primary',
  blocked: 'bg-warning/10 text-warning',
  done: 'bg-success/10 text-success',
  dropped: 'bg-muted text-muted-foreground line-through',
};

export const TASK_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  // Slow, gentle breathing pulse — urgent items should feel alive without
  // being an alarming fast blink.
  urgent: 'bg-destructive/10 text-destructive animate-pulse [animation-duration:2.5s]',
  high: 'bg-warning/10 text-warning',
  medium: 'bg-primary/10 text-primary',
  low: 'bg-muted text-muted-foreground',
};

export const PRIORITY_ORDER: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  active: 'bg-success/10 text-success',
  on_hold: 'bg-warning/10 text-warning',
  archived: 'bg-muted text-muted-foreground',
};

const NEXT_STATUS: Partial<Record<TaskStatus, TaskStatus>> = {
  todo: 'in_progress',
  in_progress: 'done',
  blocked: 'in_progress',
};

export function getNextStatus(status: TaskStatus): TaskStatus | undefined {
  return NEXT_STATUS[status];
}

export interface TaskLike {
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  sort_order?: number;
  created_at: string;
}

export type SortKey = 'due_date' | 'priority' | 'created_at' | 'manual';

export function sortTasks<T extends TaskLike>(tasks: T[], sortKey: SortKey): T[] {
  const arr = [...tasks];
  switch (sortKey) {
    case 'due_date':
      return arr.sort((a, b) => {
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return +new Date(a.due_date) - +new Date(b.due_date);
      });
    case 'priority':
      return arr.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
    case 'manual':
      return arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    case 'created_at':
    default:
      return arr.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  }
}
