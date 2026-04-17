import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, Clock, Edit2, CheckCircle2, Circle } from 'lucide-react';
import { format } from 'date-fns';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: 'todo' | 'in_progress' | 'done' | 'blocked' | 'dropped';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date: string | null;
  due_time: string | null;
  project_id: string | null;
  created_at: string;
}

interface Project { id: string; name: string; color: string; }

type TaskForm = {
  title: string; description: string; status: Task['status'];
  priority: Task['priority']; due_date: string; due_time: string; project_id: string;
};

const emptyForm: TaskForm = { title: '', description: '', status: 'todo', priority: 'medium', due_date: '', due_time: '', project_id: '' };

const priorityColors: Record<string, string> = {
  urgent: 'bg-destructive/20 text-destructive',
  high: 'bg-warning/20 text-warning',
  medium: 'bg-primary/20 text-primary',
  low: 'bg-muted text-muted-foreground',
};

const statusLabels: Record<string, string> = { todo: 'To Do', in_progress: 'In Progress', done: 'Done', blocked: 'Blocked', dropped: 'Dropped' };

export default function Tasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [form, setForm] = useState<TaskForm>({ ...emptyForm });
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; taskId: string | null }>({ open: false, taskId: null });
  const [completeConfirm, setCompleteConfirm] = useState<{ open: boolean; taskId: string | null }>({ open: false, taskId: null });

  const fetchData = async () => {
    const [tasksRes, projectsRes] = await Promise.all([
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('projects').select('id, name, color'),
    ]);
    setTasks(tasksRes.data ?? []);
    setProjects(projectsRes.data ?? []);
    setLoading(false);
  };

  useEffect(() => { if (user) fetchData(); }, [user]);

  const resetForm = () => { setForm({ ...emptyForm }); setEditingTask(null); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      title: form.title,
      description: form.description || null,
      status: form.status,
      priority: form.priority,
      due_date: form.due_date || null,
      due_time: form.due_time || null,
      project_id: form.project_id || null,
    };
    if (editingTask) {
      await supabase.from('tasks').update(payload).eq('id', editingTask.id);
    } else {
      await supabase.from('tasks').insert({ ...payload, user_id: user!.id });
    }
    setDialogOpen(false);
    resetForm();
    fetchData();
  };

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setForm({
      title: task.title,
      description: task.description ?? '',
      status: task.status,
      priority: task.priority,
      due_date: task.due_date ?? '',
      due_time: task.due_time ?? '',
      project_id: task.project_id ?? '',
    });
    setDialogOpen(true);
  };

  const toggleDone = async (task: Task) => {
    const newStatus = task.status === 'done' ? 'todo' : 'done';
    setCompleteConfirm({ open: true, taskId: task.id });
  };

  const confirmToggleDone = async () => {
    if (!completeConfirm.taskId) return;
    const task = tasks.find(t => t.id === completeConfirm.taskId);
    if (!task) return;
    const newStatus = task.status === 'done' ? 'todo' : 'done';
    await supabase.from('tasks').update({ status: newStatus }).eq('id', completeConfirm.taskId);
    setCompleteConfirm({ open: false, taskId: null });
    fetchData();
  };

  const handleDelete = async (id: string) => {
    setDeleteConfirm({ open: true, taskId: id });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm.taskId) return;
    await supabase.from('tasks').delete().eq('id', deleteConfirm.taskId);
    setDeleteConfirm({ open: false, taskId: null });
    fetchData();
  };

  const updateStatus = async (taskId: string, status: Task['status']) => {
    await supabase.from('tasks').update({ status }).eq('id', taskId);
    fetchData();
  };

  const filteredTasks = filter === 'all' ? tasks : tasks.filter((t) => t.status === filter);

  const groupedByStatus = {
    todo: filteredTasks.filter((t) => t.status === 'todo'),
    in_progress: filteredTasks.filter((t) => t.status === 'in_progress'),
    done: filteredTasks.filter((t) => t.status === 'done'),
    blocked: filteredTasks.filter((t) => t.status === 'blocked'),
    dropped: filteredTasks.filter((t) => t.status === 'dropped'),
  };

  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p]));

  return (
    <div className="animate-fade-in px-4 py-4 sm:px-6 sm:py-6 space-y-6">
      <PageHeader title="Tasks" />

      <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{tasks.filter((t) => t.status !== 'done').length} open tasks</p>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-2 h-4 w-4" />New Task</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingTask ? 'Edit Task' : 'New Task'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Title</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required className="h-9 text-sm" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Priority</Label>
                  <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as Task['priority'] })}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Task['status'] })}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todo">To Do</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="done">Done</SelectItem>
                      <SelectItem value="blocked">Blocked</SelectItem>
                      <SelectItem value="dropped">Dropped</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Due Date</Label>
                  <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="h-9 text-sm" />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Due Time</Label>
                  <Input type="time" value={form.due_time} onChange={(e) => setForm({ ...form, due_time: e.target.value })} className="h-9 text-sm" />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Project</Label>
                  <Select value={form.project_id} onValueChange={(v) => setForm({ ...form, project_id: v })}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button type="submit" className="w-full">{editingTask ? 'Save Changes' : 'Create Task'}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-2 flex-wrap">
        {['all', 'todo', 'in_progress', 'done', 'blocked', 'dropped'].map((s) => (
          <Button key={s} variant={filter === s ? 'default' : 'outline'} size="sm" onClick={() => setFilter(s)} className="text-xs">
            {s === 'all' ? 'All' : statusLabels[s]}
          </Button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {(['todo', 'in_progress', 'done', 'blocked', 'dropped'] as const).map((status) => (
            <Card key={status}>
              <CardHeader className="pb-4 sm:pb-6">
                <CardTitle className="flex items-center justify-between text-sm font-semibold">
                  <span>{statusLabels[status]}</span>
                  <Badge variant="secondary" className="text-xs">{groupedByStatus[status].length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 p-4 sm:p-6">
                {groupedByStatus[status].map((task) => (
                  <div key={task.id} className="group flex items-start gap-3 rounded-md border border-border p-3 transition-colors hover:bg-muted/50">
                    <Checkbox
                      checked={task.status === 'done'}
                      onCheckedChange={() => toggleDone(task)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${task.status === 'done' ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                        {task.title}
                      </p>
                      {task.description && (
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{task.description}</p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge className={`text-xs ${priorityColors[task.priority]}`}>{task.priority}</Badge>
                        {task.project_id && projectMap[task.project_id] && (
                          <Badge variant="outline" className="text-xs">
                            <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: projectMap[task.project_id].color }} />
                            {projectMap[task.project_id].name}
                          </Badge>
                        )}
                        {task.due_date && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {format(new Date(task.due_date), 'MMM d')}{task.due_time ? ` ${task.due_time}` : ''}
                          </span>
                        )}
                      </div>
                      {/* Quick status change */}
                      {task.status !== 'done' && (
                        <div className="mt-3 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          {status !== 'todo' && (
                            <button onClick={() => updateStatus(task.id, 'todo')} className="rounded px-2 py-1 text-xs font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors">To Do</button>
                          )}
                          {status !== 'in_progress' && (
                            <button onClick={() => updateStatus(task.id, 'in_progress')} className="rounded px-2 py-1 text-xs font-medium bg-primary/20 text-primary hover:bg-primary/30 transition-colors">In Progress</button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100 shrink-0">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="h-8 w-8"
                        title={task.status === 'done' ? 'Mark as incomplete' : 'Mark as complete'}
                        onClick={() => toggleDone(task)}
                      >
                        {task.status === 'done' ? (
                          <CheckCircle2 className="h-4 w-4 text-success" />
                        ) : (
                          <Circle className="h-4 w-4" />
                        )}
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8" onClick={() => handleEdit(task)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(task.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {groupedByStatus[status].length === 0 && (
                  <p className="py-6 text-center text-xs text-muted-foreground">No tasks</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={completeConfirm.open}
        onOpenChange={(open) => setCompleteConfirm({ ...completeConfirm, open })}
        title={tasks.find(t => t.id === completeConfirm.taskId)?.status === 'done' ? 'Mark as incomplete?' : 'Mark as complete?'}
        description={tasks.find(t => t.id === completeConfirm.taskId)?.status === 'done' ? 'This will move the task back to todo.' : 'This will mark the task as done.'}
        confirmText={tasks.find(t => t.id === completeConfirm.taskId)?.status === 'done' ? 'Mark incomplete' : 'Mark complete'}
        onConfirm={confirmToggleDone}
      />

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
