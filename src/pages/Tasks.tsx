import { useEffect, useMemo, useState } from 'react';
import { api, workspaces as workspacesApi } from '@/lib/api';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Plus, List, LayoutGrid, Calendar as CalendarIcon, Bookmark, ChevronDown, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { TASK_STATUSES, TASK_PRIORITIES, TASK_STATUS_LABELS, sortTasks, type SortKey, type TaskStatus } from '@/lib/taskMeta';
import { TaskFilterBar, DEFAULT_FILTERS, applyTaskFilters, type TaskFilters } from '@/components/tasks/TaskFilterBar';
import { TaskListView } from '@/components/tasks/TaskListView';
import { TaskBoardView } from '@/components/tasks/TaskBoardView';
import { BulkActionBar } from '@/components/tasks/BulkActionBar';
import { preventAccidentalDialogClose } from '@/lib/utils';
import { AssigneePicker } from '@/components/tasks/AssigneePicker';
import { ListSkeleton } from '@/components/skeletons/primitives';
import type { Task, ProjectLite, Member } from '@/components/tasks/types';
import { BlockEditor } from '@/components/editor/BlockEditor';
import { legacyTextToBlocks } from '@/lib/blockContent';

type TaskForm = {
  title: string; status: TaskStatus;
  priority: Task['priority']; due_date: string; due_time: string; project_id: string; assignee_id: string;
};

const emptyForm: TaskForm = { title: '', status: 'todo', priority: 'medium', due_date: '', due_time: '', project_id: '', assignee_id: '' };

interface SavedView { id: string; name: string; view_type: 'list' | 'board'; filters: TaskFilters; sort: { key: SortKey } }

export default function Tasks() {
  const { currentWorkspace } = useWorkspace();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [loading, setLoading] = useState(true);

  const [view, setView] = useState<'list' | 'board'>('list');
  const [filters, setFilters] = useState<TaskFilters>(DEFAULT_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [draftId, setDraftId] = useState('');
  const [pendingContent, setPendingContent] = useState<{ blocks: unknown[]; text: string } | null>(null);
  const [form, setForm] = useState<TaskForm>({ ...emptyForm });
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; taskId: string | null }>({ open: false, taskId: null });
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [saveViewName, setSaveViewName] = useState('');

  const wsId = currentWorkspace?.id;

  const fetchData = async () => {
    if (!wsId) return;
    const [tasksRes, projectsRes, membersRes, viewsRes] = await Promise.all([
      api.select<Task>('tasks', wsId),
      api.select<ProjectLite>('projects', wsId),
      workspacesApi.members(wsId),
      api.select<SavedView>('saved_views', wsId, { entity_type: 'tasks' }),
    ]);
    setTasks(tasksRes);
    setProjects(projectsRes);
    setMembers(membersRes);
    setSavedViews(viewsRes);
    setLoading(false);
  };

  useEffect(() => { if (wsId) fetchData(); }, [wsId]);

  const projectMap = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects]);
  const memberMap = useMemo(() => Object.fromEntries(members.map((m) => [m.users.id, m])), [members]);

  const visibleTasks = useMemo(() => sortTasks(applyTaskFilters(tasks, filters), sortKey), [tasks, filters, sortKey]);

  const resetForm = () => { setForm({ ...emptyForm }); setEditingTask(null); setPendingContent(null); };

  const openNewTask = () => { resetForm(); setDraftId(crypto.randomUUID()); setDialogOpen(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wsId) return;
    const content_json = pendingContent?.blocks ?? (editingTask?.content_json ?? legacyTextToBlocks(editingTask?.description));
    const content_text = pendingContent?.text ?? editingTask?.content_text ?? '';
    const payload = {
      title: form.title,
      content_json, content_text,
      status: form.status,
      priority: form.priority,
      due_date: form.due_date || null,
      due_time: form.due_time || null,
      project_id: form.project_id || null,
      assignee_id: form.assignee_id || null,
    };
    if (editingTask) await api.update('tasks', wsId, editingTask.id, payload);
    else await api.insert('tasks', wsId, { id: draftId, ...payload });
    setDialogOpen(false);
    resetForm();
    fetchData();
  };

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setDraftId(task.id);
    setPendingContent(null);
    setForm({
      title: task.title, status: task.status, priority: task.priority,
      due_date: task.due_date ?? '', due_time: task.due_time ?? '', project_id: task.project_id ?? '', assignee_id: task.assignee_id ?? '',
    });
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => setDeleteConfirm({ open: true, taskId: id });
  const confirmDelete = async () => {
    if (!deleteConfirm.taskId || !wsId) return;
    await api.remove('tasks', wsId, deleteConfirm.taskId);
    setDeleteConfirm({ open: false, taskId: null });
    setSelectedIds((s) => { const n = new Set(s); n.delete(deleteConfirm.taskId!); return n; });
    fetchData();
  };

  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    if (!wsId) return;
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t))); // optimistic for smooth drag
    await api.update('tasks', wsId, taskId, { status });
    fetchData();
  };

  const toggleSelect = (id: string) => setSelectedIds((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const bulk = {
    setStatus: async (status: TaskStatus) => {
      if (!wsId) return;
      await Promise.all([...selectedIds].map((id) => api.update('tasks', wsId, id, { status })));
      setSelectedIds(new Set());
      fetchData();
    },
    assign: async (userId: string | null) => {
      if (!wsId) return;
      await Promise.all([...selectedIds].map((id) => api.update('tasks', wsId, id, { assignee_id: userId })));
      setSelectedIds(new Set());
      fetchData();
    },
    moveToProject: async (projectId: string | null) => {
      if (!wsId) return;
      await Promise.all([...selectedIds].map((id) => api.update('tasks', wsId, id, { project_id: projectId })));
      setSelectedIds(new Set());
      fetchData();
    },
    delete: async () => {
      if (!wsId) return;
      await Promise.all([...selectedIds].map((id) => api.remove('tasks', wsId, id)));
      setSelectedIds(new Set());
      fetchData();
    },
  };

  const applySavedView = (v: SavedView) => {
    setFilters(v.filters);
    setSortKey(v.sort?.key ?? 'created_at');
    setView(v.view_type);
  };

  const saveCurrentView = async () => {
    if (!wsId || !saveViewName.trim()) return;
    await api.insert('saved_views', wsId, {
      name: saveViewName.trim(), entity_type: 'tasks', view_type: view, filters, sort: { key: sortKey },
    });
    setSaveViewName('');
    setSaveViewOpen(false);
    fetchData();
  };

  const deleteSavedView = async (id: string) => {
    if (!wsId) return;
    await api.remove('saved_views', wsId, id);
    fetchData();
  };

  return (
    <div className="animate-fade-in px-4 py-4 sm:px-6 sm:py-6 space-y-4">
      <PageHeader title="Tasks" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{tasks.filter((t) => t.status !== 'done').length} open {tasks.filter((t) => t.status !== 'done').length === 1 ? 'task' : 'tasks'}</p>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-border p-0.5">
            <Button variant={view === 'list' ? 'secondary' : 'ghost'} size="sm" className="h-7 px-2" onClick={() => setView('list')}><List className="h-3.5 w-3.5" /></Button>
            <Button variant={view === 'board' ? 'secondary' : 'ghost'} size="sm" className="h-7 px-2" onClick={() => setView('board')}><LayoutGrid className="h-3.5 w-3.5" /></Button>
          </div>
          <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
            <Link to="/calendar"><CalendarIcon className="mr-1.5 h-3.5 w-3.5" />Calendar</Link>
          </Button>
          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
            <DialogTrigger asChild><Button size="sm" onClick={openNewTask}><Plus className="mr-2 h-4 w-4" />New Task</Button></DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl" {...preventAccidentalDialogClose}>
              <DialogHeader><DialogTitle>{editingTask ? 'Edit Task' : 'New Task'}</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Title</Label>
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required className="h-9 text-sm" />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Description</Label>
                  {wsId && draftId && (
                    <BlockEditor
                      key={draftId}
                      content={editingTask?.content_json ?? legacyTextToBlocks(editingTask?.description)}
                      onChange={(blocks, text) => setPendingContent({ blocks, text })}
                      workspaceId={wsId}
                      entityType="tasks"
                      entityId={draftId}
                      className="min-h-[160px] rounded-md border border-border"
                    />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Priority</Label>
                    <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as Task['priority'] })}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>{TASK_PRIORITIES.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Status</Label>
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as TaskStatus })}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>{TASK_STATUSES.map((s) => <SelectItem key={s} value={s}>{TASK_STATUS_LABELS[s]}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Due Date</Label>
                    <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="h-9 text-sm" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Due Time</Label>
                    <Input type="time" value={form.due_time} onChange={(e) => setForm({ ...form, due_time: e.target.value })} className="h-9 text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Project</Label>
                    <Select value={form.project_id || 'none'} onValueChange={(v) => setForm({ ...form, project_id: v === 'none' ? '' : v })}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Assignee</Label>
                    <AssigneePicker members={members} value={form.assignee_id || null} onChange={(id) => setForm({ ...form, assignee_id: id ?? '' })} className="h-9 text-sm" />
                  </div>
                </div>
                <Button type="submit" className="w-full">{editingTask ? 'Save Changes' : 'Create Task'}</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 justify-between">
        <TaskFilterBar filters={filters} onChange={setFilters} projects={projects} members={members} />
        <div className="flex items-center gap-2">
          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="created_at">Newest first</SelectItem>
              <SelectItem value="due_date">Due date</SelectItem>
              <SelectItem value="priority">Priority</SelectItem>
              <SelectItem value="manual">Manual order</SelectItem>
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs"><Bookmark className="mr-1.5 h-3.5 w-3.5" />Views<ChevronDown className="ml-1 h-3 w-3" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {savedViews.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">No saved views yet</p>}
              {savedViews.map((v) => (
                <DropdownMenuItem key={v.id} className="flex items-center justify-between gap-2" onClick={() => applySavedView(v)}>
                  <span className="truncate">{v.name}</span>
                  <button onClick={(e) => { e.stopPropagation(); deleteSavedView(v.id); }} className="text-muted-foreground hover:text-destructive"><X className="h-3 w-3" /></button>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setSaveViewOpen(true)}><Plus className="mr-2 h-3.5 w-3.5" />Save current view</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <BulkActionBar
        count={selectedIds.size}
        projects={projects}
        members={members}
        onClear={() => setSelectedIds(new Set())}
        onSetStatus={bulk.setStatus}
        onAssign={bulk.assign}
        onMoveToProject={bulk.moveToProject}
        onDelete={bulk.delete}
      />

      {loading ? (
        <ListSkeleton count={6} />
      ) : view === 'list' ? (
        <TaskListView tasks={visibleTasks} projectMap={projectMap} memberMap={memberMap} selectedIds={selectedIds} onToggleSelect={toggleSelect} onEdit={handleEdit} onDelete={handleDelete} />
      ) : (
        <TaskBoardView tasks={visibleTasks} projectMap={projectMap} memberMap={memberMap} selectedIds={selectedIds} onToggleSelect={toggleSelect} onEdit={handleEdit} onDelete={handleDelete} onStatusChange={handleStatusChange} />
      )}

      <Dialog open={saveViewOpen} onOpenChange={setSaveViewOpen}>
        <DialogContent {...preventAccidentalDialogClose}>
          <DialogHeader><DialogTitle>Save current view</DialogTitle></DialogHeader>
          <Input value={saveViewName} onChange={(e) => setSaveViewName(e.target.value)} placeholder="e.g. My urgent tasks" autoFocus />
          <DialogFooter><Button onClick={saveCurrentView} disabled={!saveViewName.trim()}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteConfirm.open}
        onOpenChange={(open) => setDeleteConfirm({ ...deleteConfirm, open })}
        title="Delete task?"
        description="This action cannot be undone. The task will be permanently deleted."
        confirmText="Delete"
        variant="destructive"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
