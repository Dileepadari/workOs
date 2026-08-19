import { TASK_STATUSES, TASK_STATUS_LABELS } from '@/lib/taskMeta';
import { TaskCard } from './TaskCard';
import type { Task, ProjectLite, Member } from './types';

interface Props {
  tasks: Task[];
  projectMap: Record<string, ProjectLite>;
  memberMap: Record<string, Member>;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
}

export function TaskListView({ tasks, projectMap, memberMap, selectedIds, onToggleSelect, onEdit, onDelete }: Props) {
  return (
    <div className="space-y-6">
      {TASK_STATUSES.map((status) => {
        const statusTasks = tasks.filter((t) => t.status === status);
        if (statusTasks.length === 0) return null;
        return (
          <div key={status}>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-medium uppercase text-muted-foreground">
              {TASK_STATUS_LABELS[status]}
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs normal-case">{statusTasks.length}</span>
            </h3>
            <div className="space-y-1.5">
              {statusTasks.map((task, index) => (
                <div key={task.id} className="animate-fade-in hover-lift" style={{ animationDelay: `${Math.min(index * 40, 480)}ms` }}>
                  <TaskCard
                    task={task}
                    project={task.project_id ? projectMap[task.project_id] : undefined}
                    assignee={task.assignee_id ? memberMap[task.assignee_id] : undefined}
                    selected={selectedIds.has(task.id)}
                    onToggleSelect={() => onToggleSelect(task.id)}
                    onEdit={() => onEdit(task)}
                    onDelete={() => onDelete(task.id)}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {tasks.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">No tasks match these filters</p>}
    </div>
  );
}
