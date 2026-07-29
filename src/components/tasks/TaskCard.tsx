import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Clock, Edit2, Trash2, GripVertical } from 'lucide-react';
import { format } from 'date-fns';
import { PRIORITY_COLORS } from '@/lib/taskMeta';
import { memberLabel } from './AssigneePicker';
import type { Task, ProjectLite, Member } from './types';

interface Props {
  task: Task;
  project?: ProjectLite;
  assignee?: Member;
  selected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  dragHandleProps?: Record<string, unknown>;
  isDragging?: boolean;
}

export function TaskCard({ task, project, assignee, selected, onToggleSelect, onEdit, onDelete, dragHandleProps, isDragging }: Props) {
  return (
    <div className={`group flex items-start gap-2 rounded-md border border-border bg-card p-2.5 transition-colors hover:bg-muted/50 ${isDragging ? 'opacity-50' : ''}`}>
      {dragHandleProps && (
        <button {...dragHandleProps} className="mt-0.5 cursor-grab text-muted-foreground/50 hover:text-muted-foreground touch-none">
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      )}
      <Checkbox checked={selected} onCheckedChange={onToggleSelect} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className={`text-xs sm:text-sm ${task.status === 'done' ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{task.title}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge className={`text-[10px] ${PRIORITY_COLORS[task.priority]}`}>{task.priority}</Badge>
          {project && (
            <Badge variant="outline" className="text-[10px]">
              <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: project.color }} />
              {project.name}
            </Badge>
          )}
          {task.due_date && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="h-3 w-3" />{format(new Date(task.due_date), 'MMM d')}
            </span>
          )}
          {assignee && (
            <span className="ml-auto flex items-center gap-1" title={memberLabel(assignee)}>
              <Avatar className="h-4 w-4"><AvatarFallback className="text-[9px]">{memberLabel(assignee)[0]?.toUpperCase()}</AvatarFallback></Avatar>
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onEdit}><Edit2 className="h-3 w-3" /></Button>
        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={onDelete}><Trash2 className="h-3 w-3" /></Button>
      </div>
    </div>
  );
}
