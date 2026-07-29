import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Trash2 } from 'lucide-react';
import { TASK_STATUSES, TASK_STATUS_LABELS, type TaskStatus } from '@/lib/taskMeta';
import { memberLabel } from './AssigneePicker';
import type { ProjectLite, Member } from './types';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface Props {
  count: number;
  projects: ProjectLite[];
  members: Member[];
  onClear: () => void;
  onSetStatus: (status: TaskStatus) => void;
  onAssign: (userId: string | null) => void;
  onMoveToProject: (projectId: string | null) => void;
  onDelete: () => void;
}

export function BulkActionBar({ count, projects, members, onClear, onSetStatus, onAssign, onMoveToProject, onDelete }: Props) {
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  if (count === 0) return null;

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
      <span className="text-xs font-medium text-foreground">{count} selected</span>

      <Select onValueChange={(v) => onSetStatus(v as TaskStatus)}>
        <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue placeholder="Set status" /></SelectTrigger>
        <SelectContent>
          {TASK_STATUSES.map((s) => <SelectItem key={s} value={s}>{TASK_STATUS_LABELS[s]}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select onValueChange={(v) => onAssign(v === 'unassigned' ? null : v)}>
        <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue placeholder="Assign to" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="unassigned">Unassigned</SelectItem>
          {members.map((m) => <SelectItem key={m.users.id} value={m.users.id}>{memberLabel(m)}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select onValueChange={(v) => onMoveToProject(v === 'none' ? null : v)}>
        <SelectTrigger className="h-7 w-[140px] text-xs"><SelectValue placeholder="Move to project" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No project</SelectItem>
          {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
        </SelectContent>
      </Select>

      <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => setDeleteConfirm(true)}>
        <Trash2 className="mr-1 h-3 w-3" />Delete
      </Button>

      <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" onClick={onClear}>
        <X className="mr-1 h-3 w-3" />Clear selection
      </Button>

      <ConfirmDialog
        open={deleteConfirm}
        onOpenChange={setDeleteConfirm}
        title={`Delete ${count} task${count === 1 ? '' : 's'}?`}
        description="This action cannot be undone."
        confirmText="Delete"
        variant="destructive"
        onConfirm={() => { onDelete(); setDeleteConfirm(false); }}
      />
    </div>
  );
}
