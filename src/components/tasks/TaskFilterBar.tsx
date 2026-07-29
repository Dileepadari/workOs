import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Search, X } from 'lucide-react';
import { TASK_STATUSES, TASK_STATUS_LABELS, TASK_PRIORITIES } from '@/lib/taskMeta';
import { memberLabel } from './AssigneePicker';
import type { ProjectLite, Member } from './types';

export interface TaskFilters {
  status: string; // 'all' | TaskStatus
  priority: string; // 'all' | TaskPriority
  project: string; // 'all' | project id
  assignee: string; // 'all' | 'unassigned' | user id
  search: string;
}

export const DEFAULT_FILTERS: TaskFilters = { status: 'all', priority: 'all', project: 'all', assignee: 'all', search: '' };

interface Props {
  filters: TaskFilters;
  onChange: (filters: TaskFilters) => void;
  projects: ProjectLite[];
  members: Member[];
}

export function TaskFilterBar({ filters, onChange, projects, members }: Props) {
  const set = (patch: Partial<TaskFilters>) => onChange({ ...filters, ...patch });
  const isDefault = JSON.stringify(filters) === JSON.stringify(DEFAULT_FILTERS);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-48">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={filters.search} onChange={(e) => set({ search: e.target.value })} placeholder="Search tasks..." className="h-8 pl-8 text-xs" />
      </div>

      <Select value={filters.status} onValueChange={(v) => set({ status: v })}>
        <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {TASK_STATUSES.map((s) => <SelectItem key={s} value={s}>{TASK_STATUS_LABELS[s]}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={filters.priority} onValueChange={(v) => set({ priority: v })}>
        <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All priorities</SelectItem>
          {TASK_PRIORITIES.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={filters.project} onValueChange={(v) => set({ project: v })}>
        <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All projects</SelectItem>
          <SelectItem value="none">No project</SelectItem>
          {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={filters.assignee} onValueChange={(v) => set({ assignee: v })}>
        <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Anyone</SelectItem>
          <SelectItem value="unassigned">Unassigned</SelectItem>
          {members.map((m) => <SelectItem key={m.users.id} value={m.users.id}>{memberLabel(m)}</SelectItem>)}
        </SelectContent>
      </Select>

      {!isDefault && (
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => onChange(DEFAULT_FILTERS)}>
          <X className="mr-1 h-3 w-3" />Clear
        </Button>
      )}
    </div>
  );
}

export function applyTaskFilters<T extends { status: string; priority: string; project_id: string | null; assignee_id: string | null; title: string; description: string | null; content_text?: string | null }>(
  tasks: T[],
  filters: TaskFilters,
): T[] {
  return tasks.filter((t) => {
    if (filters.status !== 'all' && t.status !== filters.status) return false;
    if (filters.priority !== 'all' && t.priority !== filters.priority) return false;
    if (filters.project === 'none' && t.project_id) return false;
    if (filters.project !== 'all' && filters.project !== 'none' && t.project_id !== filters.project) return false;
    if (filters.assignee === 'unassigned' && t.assignee_id) return false;
    if (filters.assignee !== 'all' && filters.assignee !== 'unassigned' && t.assignee_id !== filters.assignee) return false;
    if (filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      const haystack = `${t.title} ${t.description ?? ''} ${t.content_text ?? ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}
