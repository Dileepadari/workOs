import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, workspaces as workspacesApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, CheckSquare, FileText, Flag, LinkIcon, MessageSquare, Calendar, Users, Plus, Trash2, ExternalLink, Clock, Edit2, ArrowRight, CheckCircle2, Circle, GitBranch, CalendarClock, Paperclip } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { TASK_STATUSES, TASK_STATUS_LABELS, PRIORITY_COLORS, PROJECT_STATUS_COLORS, getNextStatus, type TaskStatus, type TaskPriority } from '@/lib/taskMeta';
import { BlockEditor } from '@/components/editor/BlockEditor';
import { legacyTextToBlocks } from '@/lib/blockContent';
import { CommentsPanel } from '@/components/CommentsPanel';
import { ActivityFeed } from '@/components/ActivityFeed';
import { AttachmentsPanel } from '@/components/AttachmentsPanel';
import { UploadUrlButton } from '@/components/UploadUrlButton';
import { fileKind } from '@/lib/fileMeta';
import { preventAccidentalDialogClose } from '@/lib/utils';
import { ProjectDetailSkeleton } from '@/components/skeletons/pages';
import type { Member } from '@/components/tasks/types';

interface Project { id: string; name: string; description: string | null; status: string; color: string; slug: string | null; type: string; tags: string[]; start_date: string | null; target_end_date: string | null; repo_url: string | null; status_note: string | null; created_at: string; updated_at: string; }
interface Task { id: string; title: string; status: TaskStatus; priority: TaskPriority; due_date: string | null; due_time: string | null; time_estimate_min: number | null; description: string | null; sort_order: number; created_at: string; }
interface Milestone { id: string; title: string; date: string; is_completed: boolean; }
interface Resource { id: string; title: string; url: string | null; type: string; tags: string[]; }
interface Meeting { id: string; title: string; scheduled_at: string; attendees: string | null; agenda_html: string | null; agenda_json: unknown; agenda_text: string | null; notes_html: string | null; notes_text: string | null; action_items: string | null; }

const RESOURCE_TYPES = ['link', 'pdf', 'image', 'doc', 'code', 'video', 'note'];

// Picks the closest resource type for an uploaded file, so the badge matches
// what was actually attached instead of defaulting to "link".
const RESOURCE_TYPE_FOR_KIND: Partial<Record<ReturnType<typeof fileKind>, string>> = {
  image: 'image', pdf: 'pdf', doc: 'doc', sheet: 'doc', code: 'code', video: 'video',
};

const priorityColors = PRIORITY_COLORS;
const statusColors = PROJECT_STATUS_COLORS;
const taskStatusLabels = TASK_STATUS_LABELS;
const taskStatusOrder = TASK_STATUSES;

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const { toast } = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  // Forms
  const [taskDialog, setTaskDialog] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: '', priority: 'medium', due_date: '', due_time: '', time_estimate_min: '', status: 'todo' });
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deleteTaskConfirm, setDeleteTaskConfirm] = useState<{ open: boolean; taskId: string | null }>({ open: false, taskId: null });

  const [milestoneDialog, setMilestoneDialog] = useState(false);
  const [msForm, setMsForm] = useState({ title: '', date: '' });
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
  const [deleteMilestoneConfirm, setDeleteMilestoneConfirm] = useState<{ open: boolean; msId: string | null }>({ open: false, msId: null });

  const [resourceDialog, setResourceDialog] = useState(false);
  const [resForm, setResForm] = useState({ title: '', url: '', type: 'link' });
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [deleteResourceConfirm, setDeleteResourceConfirm] = useState<{ open: boolean; resId: string | null }>({ open: false, resId: null });

  const [meetingDialog, setMeetingDialog] = useState(false);
  const [meetForm, setMeetForm] = useState({ title: '', scheduled_at: '', attendees: '' });
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [deleteMeetingConfirm, setDeleteMeetingConfirm] = useState<{ open: boolean; meetId: string | null }>({ open: false, meetId: null });
  const [meetingDraftId, setMeetingDraftId] = useState('');
  const [pendingAgenda, setPendingAgenda] = useState<{ blocks: unknown[]; text: string } | null>(null);

  const [statusNote, setStatusNote] = useState('');

  const wsId = currentWorkspace?.id;

  useEffect(() => {
    if (!user || !id || !wsId) return;
    const load = async () => {
      let rows = await api.select<Project>('projects', wsId, { slug: id });
      if (rows.length === 0) rows = await api.select<Project>('projects', wsId, { id });
      if (rows.length === 0) { setLoading(false); return; }
      setProject(rows[0]);
      setStatusNote(rows[0].status_note ?? '');
      await reload(rows[0].id);
      setLoading(false);
    };
    load();
    workspacesApi.members(wsId).then(setMembers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, id, wsId]);

  const reload = async (pid?: string) => {
    const projectId = pid || project?.id;
    if (!projectId || !wsId) return;
    const [t, m, r, mt] = await Promise.all([
      api.select<Task>('tasks', wsId, { project_id: projectId }),
      api.select<Milestone>('milestones', wsId, { project_id: projectId }),
      api.select<Resource>('resources', wsId, { project_id: projectId }),
      api.select<Meeting>('meetings', wsId, { project_id: projectId }),
    ]);
    setTasks([...t].sort((a, b) => a.sort_order - b.sort_order || +new Date(b.created_at) - +new Date(a.created_at)));
    setMilestones([...m].sort((a, b) => +new Date(a.date) - +new Date(b.date)));
    setResources(r);
    setMeetings([...mt].sort((a, b) => +new Date(b.scheduled_at) - +new Date(a.scheduled_at)));
  };

  const moveTaskStatus = async (task: Task, newStatus: string) => {
    if (!wsId) return;
    await api.update('tasks', wsId, task.id, { status: newStatus });
    reload();
  };

  const toggleTask = async (task: Task) => {
    if (!wsId) return;
    await api.update('tasks', wsId, task.id, { status: task.status === 'done' ? 'todo' : 'done' });
    reload();
  };

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wsId || !project) return;
    const payload = { title: taskForm.title, priority: taskForm.priority, due_date: taskForm.due_date || null, due_time: taskForm.due_time || null, time_estimate_min: taskForm.time_estimate_min ? parseInt(taskForm.time_estimate_min) : null, status: taskForm.status };
    if (editingTask) {
      await api.update('tasks', wsId, editingTask.id, payload);
      toast({ title: 'Task updated' });
    } else {
      await api.insert('tasks', wsId, { ...payload, project_id: project.id, status: taskForm.status || 'todo' });
      toast({ title: 'Task added' });
    }
    setTaskDialog(false);
    setTaskForm({ title: '', priority: 'medium', due_date: '', due_time: '', time_estimate_min: '', status: 'todo' });
    setEditingTask(null);
    reload();
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setTaskForm({ title: task.title, priority: task.priority, due_date: task.due_date || '', due_time: task.due_time || '', time_estimate_min: task.time_estimate_min?.toString() || '', status: task.status });
    setTaskDialog(true);
  };

  const handleDeleteTask = (id: string) => setDeleteTaskConfirm({ open: true, taskId: id });
  const confirmDeleteTask = async () => {
    if (!deleteTaskConfirm.taskId || !wsId) return;
    await api.remove('tasks', wsId, deleteTaskConfirm.taskId);
    setDeleteTaskConfirm({ open: false, taskId: null });
    toast({ title: 'Task deleted' }); reload();
  };

  const addMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wsId || !project) return;
    if (editingMilestone) {
      await api.update('milestones', wsId, editingMilestone.id, { title: msForm.title, date: msForm.date });
    } else {
      await api.insert('milestones', wsId, { title: msForm.title, date: msForm.date, project_id: project.id });
    }
    setMilestoneDialog(false); setMsForm({ title: '', date: '' }); setEditingMilestone(null); reload();
  };

  const handleEditMilestone = (ms: Milestone) => { setEditingMilestone(ms); setMsForm({ title: ms.title, date: ms.date }); setMilestoneDialog(true); };
  const handleDeleteMilestone = (id: string) => setDeleteMilestoneConfirm({ open: true, msId: id });
  const confirmDeleteMilestone = async () => { if (!deleteMilestoneConfirm.msId || !wsId) return; await api.remove('milestones', wsId, deleteMilestoneConfirm.msId); setDeleteMilestoneConfirm({ open: false, msId: null }); reload(); };
  const toggleMilestone = async (ms: Milestone) => { if (!wsId) return; await api.update('milestones', wsId, ms.id, { is_completed: !ms.is_completed }); reload(); };

  const addResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wsId || !project) return;
    if (editingResource) { await api.update('resources', wsId, editingResource.id, { title: resForm.title, url: resForm.url || null, type: resForm.type }); }
    else { await api.insert('resources', wsId, { title: resForm.title, url: resForm.url || null, type: resForm.type, project_id: project.id }); }
    setResourceDialog(false); setResForm({ title: '', url: '', type: 'link' }); setEditingResource(null); reload();
  };
  const handleEditResource = (res: Resource) => { setEditingResource(res); setResForm({ title: res.title, url: res.url || '', type: res.type }); setResourceDialog(true); };
  const handleDeleteResource = (id: string) => setDeleteResourceConfirm({ open: true, resId: id });
  const confirmDeleteResource = async () => { if (!deleteResourceConfirm.resId || !wsId) return; await api.remove('resources', wsId, deleteResourceConfirm.resId); setDeleteResourceConfirm({ open: false, resId: null }); reload(); };

  const openNewMeeting = () => {
    setEditingMeeting(null);
    setMeetForm({ title: '', scheduled_at: '', attendees: '' });
    setMeetingDraftId(crypto.randomUUID());
    setPendingAgenda(null);
    setMeetingDialog(true);
  };

  const addMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wsId || !project) return;
    const agenda_json = pendingAgenda?.blocks ?? (editingMeeting?.agenda_json ?? legacyTextToBlocks(editingMeeting?.agenda_html));
    const agenda_text = pendingAgenda?.text ?? editingMeeting?.agenda_text ?? '';
    if (editingMeeting) { await api.update('meetings', wsId, editingMeeting.id, { title: meetForm.title, scheduled_at: meetForm.scheduled_at, attendees: meetForm.attendees || null, agenda_json, agenda_text }); }
    else { await api.insert('meetings', wsId, { id: meetingDraftId, title: meetForm.title, scheduled_at: meetForm.scheduled_at, attendees: meetForm.attendees || null, agenda_json, agenda_text, project_id: project.id }); }
    setMeetingDialog(false); setMeetForm({ title: '', scheduled_at: '', attendees: '' }); setEditingMeeting(null); setPendingAgenda(null); reload();
  };
  const handleEditMeeting = (meet: Meeting) => { setEditingMeeting(meet); setMeetForm({ title: meet.title, scheduled_at: meet.scheduled_at, attendees: meet.attendees || '' }); setMeetingDraftId(meet.id); setPendingAgenda(null); setMeetingDialog(true); };
  const handleDeleteMeeting = (id: string) => setDeleteMeetingConfirm({ open: true, meetId: id });
  const confirmDeleteMeeting = async () => { if (!deleteMeetingConfirm.meetId || !wsId) return; await api.remove('meetings', wsId, deleteMeetingConfirm.meetId); setDeleteMeetingConfirm({ open: false, meetId: null }); reload(); };

  const updateStatusNote = async () => { if (!project || !wsId) return; await api.update('projects', wsId, project.id, { status_note: statusNote || null }); toast({ title: 'Status note updated' }); };

  if (loading) return <ProjectDetailSkeleton />;
  if (!project) return <div className="animate-fade-in space-y-4"><p className="text-muted-foreground">Project not found.</p><Button variant="outline" asChild><Link to="/projects">Back</Link></Button></div>;

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === 'done').length;
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const nextMeeting = meetings.find(m => new Date(m.scheduled_at) > new Date());

  return (
    <div className="animate-fade-in space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="overflow-hidden rounded-xl border border-border">
        <div className="h-1.5 w-full" style={{ backgroundColor: project.color }} />
        <div className="space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Button variant="ghost" size="icon" className="shrink-0" asChild><Link to="/projects"><ArrowLeft className="h-4 w-4" /></Link></Button>
            <h1 className="text-lg sm:text-2xl font-semibold text-foreground">{project.name}</h1>
            <Badge className={`capitalize ${statusColors[project.status] || 'bg-muted text-muted-foreground'}`}>{project.status.replace('_', ' ')}</Badge>
            {project.type && <Badge variant="outline" className="capitalize text-xs">{project.type.replace('_', ' ')}</Badge>}
            {project.tags?.length > 0 && project.tags.map(t => <Badge key={t} variant="secondary" className="text-[10px] sm:text-xs">{t}</Badge>)}
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pl-0 sm:pl-12 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="shrink-0">{doneTasks}/{totalTasks} tasks</span>
              <div className="h-1.5 w-24 sm:w-32 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
              <span>{pct}%</span>
            </div>
            <span className="flex items-center gap-1.5"><LinkIcon className="h-3 w-3" />{resources.length} {resources.length === 1 ? 'resource' : 'resources'}</span>
            {project.repo_url && (
              <a href={project.repo_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-primary">
                <GitBranch className="h-3 w-3" />Repository <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {project.start_date && (
              <span className="flex items-center gap-1.5">
                <CalendarClock className="h-3 w-3" />
                {format(new Date(project.start_date), 'MMM d')}
                {project.target_end_date && ` – ${format(new Date(project.target_end_date), 'MMM d, yyyy')}`}
              </span>
            )}
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto flex-wrap h-auto gap-1">
          <TabsTrigger value="overview" className="text-xs sm:text-sm">Overview</TabsTrigger>
          <TabsTrigger value="tasks" className="text-xs sm:text-sm"><CheckSquare className="mr-1 h-3 w-3" />Tasks ({totalTasks})</TabsTrigger>
          <TabsTrigger value="milestones" className="text-xs sm:text-sm"><Flag className="mr-1 h-3 w-3" />Milestones</TabsTrigger>
          <TabsTrigger value="resources" className="text-xs sm:text-sm"><LinkIcon className="mr-1 h-3 w-3" />Resources</TabsTrigger>
          <TabsTrigger value="files" className="text-xs sm:text-sm"><Paperclip className="mr-1 h-3 w-3" />Files</TabsTrigger>
          <TabsTrigger value="discussions" className="text-xs sm:text-sm"><MessageSquare className="mr-1 h-3 w-3" />Discussions</TabsTrigger>
          <TabsTrigger value="meetings" className="text-xs sm:text-sm"><Calendar className="mr-1 h-3 w-3" />Meetings</TabsTrigger>
          <TabsTrigger value="collaborators" className="text-xs sm:text-sm"><Users className="mr-1 h-3 w-3" />Access</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="animate-fade-in">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Main column */}
            <div className="space-y-4 lg:col-span-2">
              {project.description && <Card><CardContent className="p-4 sm:p-5"><p className="text-sm text-foreground whitespace-pre-wrap">{project.description}</p></CardContent></Card>}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Current Status Note</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  <Textarea value={statusNote} onChange={e => setStatusNote(e.target.value)} placeholder="What are you working on right now?" rows={2} />
                  <Button size="sm" onClick={updateStatusNote}>Save</Button>
                </CardContent>
              </Card>
              {wsId && <ActivityFeed workspaceId={wsId} projectId={project.id} members={members} />}
            </div>

            {/* Side column */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Completed', value: doneTasks, icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10' },
                  { label: 'Remaining', value: totalTasks - doneTasks, icon: Circle, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                  { label: 'Milestones', value: milestones.filter(m => !m.is_completed).length, icon: Flag, color: 'text-accent', bg: 'bg-accent/10' },
                  { label: 'Resources', value: resources.length, icon: LinkIcon, color: 'text-primary', bg: 'bg-primary/10' },
                ].map(({ label, value, icon: Icon, color, bg }, index) => (
                  <Card key={label} className="animate-scale-in overflow-hidden" style={{ animationDelay: `${index * 40}ms` }}>
                    <CardContent className="flex flex-col items-center gap-2 p-3 sm:p-4 text-center">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${bg}`}><Icon className={`h-4 w-4 ${color}`} /></div>
                      <p className="text-xl sm:text-2xl font-bold text-foreground tabular-nums">{value}</p>
                      <p className="text-[10px] sm:text-xs text-muted-foreground">{label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {(milestones.find(m => !m.is_completed && new Date(m.date) >= new Date()) || nextMeeting) && (
                <Card>
                  <CardContent className="space-y-3 p-4">
                    {(() => {
                      const nextMs = milestones.find(m => !m.is_completed && new Date(m.date) >= new Date());
                      return nextMs && (
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10"><Flag className="h-4 w-4 text-accent" /></div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] text-muted-foreground">Next Milestone</p>
                            <p className="truncate text-sm font-medium text-foreground">{nextMs.title}</p>
                          </div>
                          <span className="shrink-0 text-xs text-muted-foreground">{format(new Date(nextMs.date), 'MMM d')}</span>
                        </div>
                      );
                    })()}
                    {nextMeeting && (
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10"><Calendar className="h-4 w-4 text-primary" /></div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] text-muted-foreground">Next Meeting</p>
                          <p className="truncate text-sm font-medium text-foreground">{nextMeeting.title}</p>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">{format(new Date(nextMeeting.scheduled_at), 'MMM d, h:mm a')}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Tasks */}
        <TabsContent value="tasks" className="space-y-4 animate-fade-in">
          <div className="flex justify-end">
            <Dialog open={taskDialog} onOpenChange={v => { setTaskDialog(v); if (!v) { setEditingTask(null); setTaskForm({ title: '', priority: 'medium', due_date: '', due_time: '', time_estimate_min: '', status: 'todo' }); } }}>
              <DialogTrigger asChild><Button size="sm"><Plus className="mr-1 h-3.5 w-3.5" />Add Task</Button></DialogTrigger>
              <DialogContent {...preventAccidentalDialogClose}>
                <DialogHeader><DialogTitle>{editingTask ? 'Edit Task' : 'Add Task'}</DialogTitle></DialogHeader>
                <form onSubmit={addTask} className="space-y-4">
                  <div className="space-y-2"><Label>Title</Label><Input value={taskForm.title} onChange={e => setTaskForm({ ...taskForm, title: e.target.value })} required /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Priority</Label>
                      <Select value={taskForm.priority} onValueChange={v => setTaskForm({ ...taskForm, priority: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {['low', 'medium', 'high', 'urgent'].map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={taskForm.status} onValueChange={v => setTaskForm({ ...taskForm, status: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {taskStatusOrder.map(s => <SelectItem key={s} value={s}>{taskStatusLabels[s]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2"><Label>Due Date</Label><Input type="date" value={taskForm.due_date} onChange={e => setTaskForm({ ...taskForm, due_date: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Due Time</Label><Input type="time" value={taskForm.due_time} onChange={e => setTaskForm({ ...taskForm, due_time: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Est. (min)</Label><Input type="number" value={taskForm.time_estimate_min} onChange={e => setTaskForm({ ...taskForm, time_estimate_min: e.target.value })} /></div>
                  </div>
                  <Button type="submit" className="w-full">{editingTask ? 'Update Task' : 'Add Task'}</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          {taskStatusOrder.map(status => {
            const statusTasks = tasks.filter(t => t.status === status);
            if (statusTasks.length === 0) return null;
            const isCollapsible = status === 'done' || status === 'dropped' || status === 'blocked';
            const statusStyle = status === 'blocked' ? 'text-warning' : status === 'dropped' ? 'text-muted-foreground italic' : '';
            const content = (
              <div className="space-y-1">
                {statusTasks.map(task => (
                  <div key={task.id} className="flex items-center gap-2 sm:gap-3 rounded-md border border-border px-2 sm:px-3 py-2.5 transition-colors hover:bg-muted/30 group">
                    <Checkbox checked={task.status === 'done'} onCheckedChange={() => toggleTask(task)} />
                    <span className={`flex-1 text-xs sm:text-sm ${task.status === 'done' ? 'text-muted-foreground line-through' : task.status === 'dropped' ? 'text-muted-foreground line-through italic' : 'text-foreground'}`}>{task.title}</span>
                    <Badge className={`text-[10px] sm:text-xs ${priorityColors[task.priority]}`}>{task.priority}</Badge>
                    {task.time_estimate_min && <span className="text-[10px] sm:text-xs text-muted-foreground hidden sm:inline">{task.time_estimate_min}m</span>}
                    {task.due_date && (
                      <span className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />{format(new Date(task.due_date), 'MMM d')}
                        {task.due_time && <span>· {task.due_time}</span>}
                      </span>
                    )}
                    {/* Revealed on hover to keep the resting row uncluttered */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {getNextStatus(task.status) && (
                        <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[10px] whitespace-nowrap" onClick={() => moveTaskStatus(task, getNextStatus(task.status)!)}>
                          <ArrowRight className="h-3 w-3 mr-1" />
                          {taskStatusLabels[getNextStatus(task.status)!]}
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEditTask(task)}><Edit2 className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDeleteTask(task.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            );
            if (isCollapsible) {
              return (
                <details key={status}>
                  <summary className={`mb-2 cursor-pointer text-xs font-medium uppercase text-muted-foreground ${statusStyle}`}>{taskStatusLabels[status]} ({statusTasks.length})</summary>
                  {content}
                </details>
              );
            }
            return <div key={status}><h3 className="mb-2 text-xs font-medium uppercase text-muted-foreground">{taskStatusLabels[status]} ({statusTasks.length})</h3>{content}</div>;
          })}
          {tasks.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No tasks yet</p>}
        </TabsContent>

        {/* Milestones */}
        <TabsContent value="milestones" className="space-y-4 animate-fade-in">
          <div className="flex justify-end">
            <Dialog open={milestoneDialog} onOpenChange={setMilestoneDialog}>
              <DialogTrigger asChild><Button size="sm"><Plus className="mr-1 h-3.5 w-3.5" />Add Milestone</Button></DialogTrigger>
              <DialogContent {...preventAccidentalDialogClose}>
                <DialogHeader><DialogTitle>{editingMilestone ? 'Edit Milestone' : 'Add Milestone'}</DialogTitle></DialogHeader>
                <form onSubmit={addMilestone} className="space-y-4">
                  <div className="space-y-2"><Label>Title</Label><Input value={msForm.title} onChange={e => setMsForm({ ...msForm, title: e.target.value })} required /></div>
                  <div className="space-y-2"><Label>Date</Label><Input type="date" value={msForm.date} onChange={e => setMsForm({ ...msForm, date: e.target.value })} required /></div>
                  <Button type="submit" className="w-full">{editingMilestone ? 'Update' : 'Add'}</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          {milestones.filter(m => !m.is_completed && new Date(m.date) >= new Date()).length > 0 && (
            <Card className="border-primary/30">
              <CardContent className="flex items-center gap-3 p-4">
                <Flag className="h-4 w-4 text-primary" />
                <div><p className="text-xs text-muted-foreground">Next Milestone</p><p className="text-sm font-medium text-foreground">{milestones.filter(m => !m.is_completed && new Date(m.date) >= new Date())[0]?.title}</p></div>
                <span className="ml-auto text-xs text-muted-foreground">{format(new Date(milestones.filter(m => !m.is_completed && new Date(m.date) >= new Date())[0]?.date), 'MMM d, yyyy')}</span>
              </CardContent>
            </Card>
          )}
          {milestones.map(ms => (
            <div key={ms.id} className="flex items-center gap-2 sm:gap-3 rounded-md border border-border px-3 sm:px-4 py-3 hover:bg-muted/30 group">
              <Checkbox checked={ms.is_completed} onCheckedChange={() => toggleMilestone(ms)} />
              <Flag className={`h-4 w-4 ${ms.is_completed ? 'text-success' : 'text-primary'}`} />
              <span className={`flex-1 text-xs sm:text-sm ${ms.is_completed ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{ms.title}</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">{format(new Date(ms.date), 'MMM d, yyyy')}</span>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEditMilestone(ms)}><Edit2 className="h-3 w-3" /></Button>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDeleteMilestone(ms.id)}><Trash2 className="h-3 w-3" /></Button>
              </div>
            </div>
          ))}
          {milestones.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No milestones yet</p>}
        </TabsContent>

        {/* Resources */}
        <TabsContent value="resources" className="space-y-4 animate-fade-in">
          <div className="flex justify-end">
            <Dialog open={resourceDialog} onOpenChange={setResourceDialog}>
              <DialogTrigger asChild><Button size="sm"><Plus className="mr-1 h-3.5 w-3.5" />Add Resource</Button></DialogTrigger>
              <DialogContent {...preventAccidentalDialogClose}>
                <DialogHeader><DialogTitle>{editingResource ? 'Edit Resource' : 'Add Resource'}</DialogTitle></DialogHeader>
                <form onSubmit={addResource} className="space-y-4">
                  <div className="space-y-2"><Label>Title</Label><Input value={resForm.title} onChange={e => setResForm({ ...resForm, title: e.target.value })} required /></div>
                  <div className="space-y-2">
                    <Label>URL</Label>
                    <div className="flex gap-2">
                      <Input value={resForm.url} onChange={e => setResForm({ ...resForm, url: e.target.value })} placeholder="https://" className="flex-1" />
                      {wsId && (
                        <UploadUrlButton
                          workspaceId={wsId}
                          entityType="resources"
                          entityId={project.id}
                          label="Upload"
                          onUploaded={(file) => setResForm(prev => ({
                            ...prev,
                            url: file.url,
                            title: prev.title || file.file_name,
                            type: RESOURCE_TYPE_FOR_KIND[fileKind(file.mime_type, file.file_name)] ?? prev.type,
                          }))}
                        />
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground">Paste a link, or upload a file to store it here.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={resForm.type} onValueChange={v => setResForm({ ...resForm, type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {RESOURCE_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" className="w-full">{editingResource ? 'Update' : 'Add'}</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {resources.map((r, index) => (
              <Card key={r.id} className="group animate-scale-in hover-lift" style={{ animationDelay: `${Math.min(index * 30, 480)}ms` }}>
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10"><LinkIcon className="h-3.5 w-3.5 text-primary" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{r.title}</p>
                    <Badge variant="outline" className="mt-0.5 text-[10px] capitalize">{r.type}</Badge>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {r.url && <Button variant="ghost" size="icon" className="h-7 w-7" asChild><a href={r.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a></Button>}
                    <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100" onClick={() => handleEditResource(r)}><Edit2 className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive opacity-0 transition-opacity group-hover:opacity-100" onClick={() => handleDeleteResource(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {resources.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No resources yet</p>}
        </TabsContent>

        {/* Files - documents, specs, designs and anything else relevant to
            the project as a whole (per-task/note files live on those items). */}
        <TabsContent value="files" className="space-y-4 animate-fade-in">
          <Card>
            <CardContent className="p-4 sm:p-5">
              {wsId && (
                <AttachmentsPanel
                  workspaceId={wsId}
                  entityType="project"
                  entityId={project.id}
                  label="Project files"
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Discussions */}
        <TabsContent value="discussions" className="space-y-4 animate-fade-in">
          {wsId && user && (
            <CommentsPanel
              workspaceId={wsId}
              entityType="project"
              entityId={project.id}
              projectId={project.id}
              currentUserId={user.id}
              members={members}
            />
          )}
        </TabsContent>

        {/* Meetings */}
        <TabsContent value="meetings" className="space-y-4 animate-fade-in">
          <div className="flex justify-end">
            <Dialog open={meetingDialog} onOpenChange={(o) => { setMeetingDialog(o); if (!o) { setEditingMeeting(null); setPendingAgenda(null); } }}>
              <DialogTrigger asChild><Button size="sm" onClick={openNewMeeting}><Plus className="mr-1 h-3.5 w-3.5" />Add Meeting</Button></DialogTrigger>
              <DialogContent {...preventAccidentalDialogClose}>
                <DialogHeader><DialogTitle>{editingMeeting ? 'Edit Meeting' : 'Add Meeting'}</DialogTitle></DialogHeader>
                <form onSubmit={addMeeting} className="space-y-4">
                  <div className="space-y-2"><Label>Title</Label><Input value={meetForm.title} onChange={e => setMeetForm({ ...meetForm, title: e.target.value })} required /></div>
                  <div className="space-y-2"><Label>Date & Time</Label><Input type="datetime-local" value={meetForm.scheduled_at} onChange={e => setMeetForm({ ...meetForm, scheduled_at: e.target.value })} required /></div>
                  <div className="space-y-2"><Label>Attendees</Label><Input value={meetForm.attendees} onChange={e => setMeetForm({ ...meetForm, attendees: e.target.value })} /></div>
                  <div className="space-y-2">
                    <Label>Agenda</Label>
                    {wsId && meetingDraftId && (
                      <BlockEditor
                        key={meetingDraftId}
                        content={editingMeeting?.agenda_json ?? legacyTextToBlocks(editingMeeting?.agenda_html)}
                        onChange={(blocks, text) => setPendingAgenda({ blocks, text })}
                        workspaceId={wsId}
                        entityType="meetings"
                        entityId={meetingDraftId}
                        className="min-h-[140px] rounded-md border border-border"
                      />
                    )}
                  </div>
                  {wsId && meetingDraftId && (
                    <AttachmentsPanel workspaceId={wsId} entityType="meetings" entityId={meetingDraftId} label="Files" compact />
                  )}
                  <Button type="submit" className="w-full">{editingMeeting ? 'Update' : 'Add'}</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          {nextMeeting && (
            <Card className="border-primary/30">
              <CardContent className="p-4 space-y-1">
                <p className="text-xs text-primary font-medium">Next Meeting</p>
                <h4 className="text-sm font-medium text-foreground">{nextMeeting.title}</h4>
                <p className="text-xs text-muted-foreground">{format(new Date(nextMeeting.scheduled_at), 'EEEE, MMM d · h:mm a')}</p>
                {nextMeeting.attendees && <p className="text-xs text-muted-foreground">With: {nextMeeting.attendees}</p>}
              </CardContent>
            </Card>
          )}
          {meetings.map(m => (
            <Card key={m.id} className={`${new Date(m.scheduled_at) < new Date() ? 'opacity-70' : ''} group`}>
              <CardContent className="p-3 sm:p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs sm:text-sm font-medium text-foreground">{m.title}</h4>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] sm:text-xs text-muted-foreground">{format(new Date(m.scheduled_at), 'MMM d, h:mm a')}</span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEditMeeting(m)}><Edit2 className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDeleteMeeting(m.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                </div>
                {m.attendees && <p className="text-[10px] sm:text-xs text-muted-foreground">With: {m.attendees}</p>}
                {wsId && (m.agenda_json || m.agenda_html) && (
                  <BlockEditor
                    key={m.id}
                    content={m.agenda_json ?? legacyTextToBlocks(m.agenda_html)}
                    onChange={() => {}}
                    editable={false}
                    workspaceId={wsId}
                    entityType="meetings"
                    entityId={m.id}
                    className="text-[10px] sm:text-xs text-muted-foreground"
                  />
                )}
                {m.notes_text && <div className="mt-2 rounded bg-muted/50 p-2 sm:p-3 text-[10px] sm:text-xs text-foreground whitespace-pre-wrap">{m.notes_text}</div>}
                {m.action_items && <p className="text-[10px] sm:text-xs text-primary">Action: {m.action_items}</p>}
              </CardContent>
            </Card>
          ))}
          {meetings.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No meetings yet</p>}
        </TabsContent>

        {/* Access - per-project guest scoping is being rebuilt (Stage 5); for
            now this points to workspace-level Team management. */}
        <TabsContent value="collaborators" className="space-y-4 animate-fade-in">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" />Workspace Team</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Everyone in this workspace already has access to this project. Invite teammates or manage roles from the{' '}
                <Link to="/team" className="text-primary underline underline-offset-2">Team page</Link>.
              </p>
              <p className="text-xs text-muted-foreground">Per-project guest access (view-only or comment-only collaborators scoped to just this project) is coming soon.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Confirm Dialogs */}
      <ConfirmDialog open={deleteTaskConfirm.open} onOpenChange={(o) => setDeleteTaskConfirm({ ...deleteTaskConfirm, open: o })} title="Delete Task" description="Delete this task permanently?" onConfirm={confirmDeleteTask} variant="destructive" />
      <ConfirmDialog open={deleteMilestoneConfirm.open} onOpenChange={(o) => setDeleteMilestoneConfirm({ ...deleteMilestoneConfirm, open: o })} title="Delete Milestone" description="Delete this milestone?" onConfirm={confirmDeleteMilestone} variant="destructive" />
      <ConfirmDialog open={deleteResourceConfirm.open} onOpenChange={(o) => setDeleteResourceConfirm({ ...deleteResourceConfirm, open: o })} title="Delete Resource" description="Delete this resource?" onConfirm={confirmDeleteResource} variant="destructive" />
      <ConfirmDialog open={deleteMeetingConfirm.open} onOpenChange={(o) => setDeleteMeetingConfirm({ ...deleteMeetingConfirm, open: o })} title="Delete Meeting" description="Delete this meeting?" onConfirm={confirmDeleteMeeting} variant="destructive" />
    </div>
  );
}
