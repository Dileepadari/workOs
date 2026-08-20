import { DndContext, useDraggable, useDroppable, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@/components/ui/badge';
import { TASK_STATUSES, TASK_STATUS_LABELS, type TaskStatus } from '@/lib/taskMeta';
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
  onStatusChange: (taskId: string, status: TaskStatus) => void;
}

function DraggableCard(props: React.ComponentProps<typeof TaskCard> & { id: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: props.id });
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;
  return (
    <div ref={setNodeRef} style={style}>
      <TaskCard {...props} dragHandleProps={{ ...attributes, ...listeners }} isDragging={isDragging} />
    </div>
  );
}

function Column({ status, children, count }: { status: TaskStatus; children: React.ReactNode; count: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div ref={setNodeRef} className={`flex min-w-[260px] flex-1 flex-col rounded-md border p-2 transition-colors ${isOver ? 'border-primary bg-primary/5' : 'border-border bg-muted/20'}`}>
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="text-xs font-medium uppercase text-muted-foreground">{TASK_STATUS_LABELS[status]}</h3>
        <Badge variant="secondary" className="text-xs">{count}</Badge>
      </div>
      <div className="flex-1 space-y-1.5 min-h-[60px]">{children}</div>
    </div>
  );
}

export function TaskBoardView({ tasks, projectMap, memberMap, selectedIds, onToggleSelect, onEdit, onDelete, onStatusChange }: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const newStatus = over.id as TaskStatus;
    const task = tasks.find((t) => t.id === active.id);
    if (task && task.status !== newStatus) onStatusChange(task.id, newStatus);
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {TASK_STATUSES.map((status) => {
          const statusTasks = tasks.filter((t) => t.status === status);
          return (
            <Column key={status} status={status} count={statusTasks.length}>
              {statusTasks.map((task) => (
                <DraggableCard
                  key={task.id}
                  id={task.id}
                  task={task}
                  project={task.project_id ? projectMap[task.project_id] : undefined}
                  assignee={task.assignee_id ? memberMap[task.assignee_id] : undefined}
                  selected={selectedIds.has(task.id)}
                  onToggleSelect={() => onToggleSelect(task.id)}
                  onEdit={() => onEdit(task)}
                  onDelete={() => onDelete(task.id)}
                />
              ))}
            </Column>
          );
        })}
      </div>
    </DndContext>
  );
}
