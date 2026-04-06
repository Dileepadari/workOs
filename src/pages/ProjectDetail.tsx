import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ArrowLeft, CheckSquare, FileText, Flag, LinkIcon, MessageSquare, Calendar, Users, Plus, Trash2, ExternalLink, Clock, Pin, Copy, Edit2 } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface Project { id: string; name: string; description: string | null; status: string; color: string; slug: string | null; type: string; tags: string[]; start_date: string | null; target_end_date: string | null; repo_url: string | null; status_note: string | null; collab_password_hash: string | null; created_at: string; updated_at: string; }
interface Task { id: string; title: string; status: string; priority: string; due_date: string | null; time_estimate_min: number | null; description: string | null; }
interface Milestone { id: string; title: string; date: string; is_completed: boolean; }
interface Resource { id: string; title: string; url: string | null; type: string; tags: string[]; }
interface Discussion { id: string; body_html: string; author: string; author_type: string; is_pinned: boolean; created_at: string; }
interface Meeting { id: string; title: string; scheduled_at: string; attendees: string | null; agenda_html: string | null; notes_html: string | null; action_items: string | null; }
interface Note { id: string; title: string; content: string | null; updated_at: string; }
interface CollabSession { id: string; email: string; last_access_at: string; expires_at: string; }

const priorityColors: Record<string, string> = { urgent: 'bg-destructive/20 text-destructive', high: 'bg-warning/20 text-warning', medium: 'bg-primary/20 text-primary', low: 'bg-muted text-muted-foreground' };
const statusColors: Record<string, string> = { active: 'bg-success/20 text-success', on_hold: 'bg-warning/20 text-warning', archived: 'bg-muted text-muted-foreground' };

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [collabSessions, setCollabSessions] = useState<CollabSession[]>([]);
  const [loading, setLoading] = useState(true);

  const [taskDialog, setTaskDialog] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: '', priority: 'medium', due_date: '', time_estimate_min: '' });
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
  const [meetForm, setMeetForm] = useState({ title: '', scheduled_at: '', attendees: '', agenda: '' });
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [deleteMeetingConfirm, setDeleteMeetingConfirm] = useState<{ open: boolean; meetId: string | null }>({ open: false, meetId: null });
  
  const [deleteDiscussionConfirm, setDeleteDiscussionConfirm] = useState<{ open: boolean; discId: string | null }>({ open: false, discId: null });
  const [discussionText, setDiscussionText] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    if (!user || !id) return;
    const load = async () => {
      let projRes = await supabase.from('projects').select('*').eq('slug', id).maybeSingle();
      if (!projRes.data) projRes = await supabase.from('projects').select('*').eq('id', id).maybeSingle();
      if (!projRes.data) { setLoading(false); return; }
      setProject(projRes.data);
      setStatusNote(projRes.data.status_note ?? '');
      const pid = projRes.data.id;
      const [t, m, r, d, mt, n, cs] = await Promise.all([
        supabase.from('tasks').select('*').eq('project_id', pid).order('sort_order').order('created_at', { ascending: false }),
        supabase.from('milestones').select('*').eq('project_id', pid).order('date'),
        supabase.from('resources').select('*').eq('project_id', pid).order('created_at', { ascending: false }),
        supabase.from('discussions').select('*').eq('project_id', pid).order('is_pinned', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('meetings').select('*').eq('project_id', pid).order('scheduled_at', { ascending: false }),
        supabase.from('notes').select('*').eq('project_id', pid).order('updated_at', { ascending: false }),
        supabase.from('collaborator_sessions').select('*').eq('project_id', pid).order('last_access_at', { ascending: false }),
      ]);
      setTasks(t.data ?? []); setMilestones(m.data ?? []); setResources(r.data ?? []);
      setDiscussions(d.data ?? []); setMeetings(mt.data ?? []); setNotes(n.data ?? []);
      setCollabSessions(cs.data ?? []);
      setLoading(false);
    };
    load();
  }, [user, id]);

  const reload = async () => {
    if (!project) return;
    const pid = project.id;
    const [t, m, r, d, mt, n, cs] = await Promise.all([
      supabase.from('tasks').select('*').eq('project_id', pid).order('sort_order').order('created_at', { ascending: false }),
      supabase.from('milestones').select('*').eq('project_id', pid).order('date'),
      supabase.from('resources').select('*').eq('project_id', pid).order('created_at', { ascending: false }),
      supabase.from('discussions').select('*').eq('project_id', pid).order('is_pinned', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('meetings').select('*').eq('project_id', pid).order('scheduled_at', { ascending: false }),
      supabase.from('notes').select('*').eq('project_id', pid).order('updated_at', { ascending: false }),
      supabase.from('collaborator_sessions').select('*').eq('project_id', pid).order('last_access_at', { ascending: false }),
    ]);
    setTasks(t.data ?? []); setMilestones(m.data ?? []); setResources(r.data ?? []);
    setDiscussions(d.data ?? []); setMeetings(mt.data ?? []); setNotes(n.data ?? []);
    setCollabSessions(cs.data ?? []);
  };

  const toggleTask = async (task: Task) => {
    await supabase.from('tasks').update({ status: task.status === 'done' ? 'todo' : 'done' }).eq('id', task.id);
    reload();
  };

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingTask) {
      await supabase.from('tasks').update({ title: taskForm.title, priority: taskForm.priority, due_date: taskForm.due_date || null, time_estimate_min: taskForm.time_estimate_min ? parseInt(taskForm.time_estimate_min) : null }).eq('id', editingTask.id);
      toast({ title: 'Task updated' });
    } else {
      await supabase.from('tasks').insert({ title: taskForm.title, priority: taskForm.priority, due_date: taskForm.due_date || null, time_estimate_min: taskForm.time_estimate_min ? parseInt(taskForm.time_estimate_min) : null, project_id: project!.id, user_id: user!.id, status: 'todo' });
      toast({ title: 'Task added' });
    }
    setTaskDialog(false); 
    setTaskForm({ title: '', priority: 'medium', due_date: '', time_estimate_min: '' }); 
    setEditingTask(null);
    reload();
  };

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
    setTaskForm({ title: task.title, priority: task.priority, due_date: task.due_date || '', time_estimate_min: task.time_estimate_min?.toString() || '' });
    setTaskDialog(true);
  };

  const handleDeleteTask = (id: string) => {
    setDeleteTaskConfirm({ open: true, taskId: id });
  };

  const confirmDeleteTask = async () => {
    if (!deleteTaskConfirm.taskId) return;
    await supabase.from('tasks').delete().eq('id', deleteTaskConfirm.taskId);
    setDeleteTaskConfirm({ open: false, taskId: null });
    toast({ title: 'Task deleted' });
    reload();
  };

  const addMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingMilestone) {
      await supabase.from('milestones').update({ title: msForm.title, date: msForm.date }).eq('id', editingMilestone.id);
      toast({ title: 'Milestone updated' });
    } else {
      await supabase.from('milestones').insert({ title: msForm.title, date: msForm.date, project_id: project!.id, user_id: user!.id });
      toast({ title: 'Milestone added' });
    }
    setMilestoneDialog(false); 
    setMsForm({ title: '', date: '' }); 
    setEditingMilestone(null);
    reload();
  };

  const handleEditMilestone = (ms: Milestone) => {
    setEditingMilestone(ms);
    setMsForm({ title: ms.title, date: ms.date });
    setMilestoneDialog(true);
  };

  const handleDeleteMilestone = (id: string) => {
    setDeleteMilestoneConfirm({ open: true, msId: id });
  };

  const confirmDeleteMilestone = async () => {
    if (!deleteMilestoneConfirm.msId) return;
    await supabase.from('milestones').delete().eq('id', deleteMilestoneConfirm.msId);
    setDeleteMilestoneConfirm({ open: false, msId: null });
    toast({ title: 'Milestone deleted' });
    reload();
  };

  const toggleMilestone = async (ms: Milestone) => {
    await supabase.from('milestones').update({ is_completed: !ms.is_completed }).eq('id', ms.id);
    reload();
  };

  const addResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingResource) {
      await supabase.from('resources').update({ title: resForm.title, url: resForm.url || null, type: resForm.type }).eq('id', editingResource.id);
      toast({ title: 'Resource updated' });
    } else {
      await supabase.from('resources').insert({ title: resForm.title, url: resForm.url || null, type: resForm.type, project_id: project!.id, user_id: user!.id });
      toast({ title: 'Resource added' });
    }
    setResourceDialog(false); 
    setResForm({ title: '', url: '', type: 'link' }); 
    setEditingResource(null);
    reload();
  };

  const handleEditResource = (res: Resource) => {
    setEditingResource(res);
    setResForm({ title: res.title, url: res.url || '', type: res.type });
    setResourceDialog(true);
  };

  const handleDeleteResource = (id: string) => {
    setDeleteResourceConfirm({ open: true, resId: id });
  };

  const confirmDeleteResource = async () => {
    if (!deleteResourceConfirm.resId) return;
    await supabase.from('resources').delete().eq('id', deleteResourceConfirm.resId);
    setDeleteResourceConfirm({ open: false, resId: null });
    toast({ title: 'Resource deleted' });
    reload();
  };

  const addMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingMeeting) {
      await supabase.from('meetings').update({ title: meetForm.title, scheduled_at: meetForm.scheduled_at, attendees: meetForm.attendees || null, agenda_html: meetForm.agenda ? `<p>${meetForm.agenda}</p>` : null }).eq('id', editingMeeting.id);
      toast({ title: 'Meeting updated' });
    } else {
      await supabase.from('meetings').insert({ title: meetForm.title, scheduled_at: meetForm.scheduled_at, attendees: meetForm.attendees || null, agenda_html: meetForm.agenda ? `<p>${meetForm.agenda}</p>` : null, project_id: project!.id, user_id: user!.id });
      toast({ title: 'Meeting added' });
    }
    setMeetingDialog(false); 
    setMeetForm({ title: '', scheduled_at: '', attendees: '', agenda: '' }); 
    setEditingMeeting(null);
    reload();
  };

  const handleEditMeeting = (meet: Meeting) => {
    setEditingMeeting(meet);
    setMeetForm({ title: meet.title, scheduled_at: meet.scheduled_at, attendees: meet.attendees || '', agenda: meet.agenda_html?.replace(/<[^>]*>/g, '') || '' });
    setMeetingDialog(true);
  };

  const handleDeleteMeeting = (id: string) => {
    setDeleteMeetingConfirm({ open: true, meetId: id });
  };

  const confirmDeleteMeeting = async () => {
    if (!deleteMeetingConfirm.meetId) return;
    await supabase.from('meetings').delete().eq('id', deleteMeetingConfirm.meetId);
    setDeleteMeetingConfirm({ open: false, meetId: null });
    toast({ title: 'Meeting deleted' });
    reload();
  };

  const addDiscussion = async () => {
    if (!discussionText.trim()) return;
    await supabase.from('discussions').insert({ body_html: `<p>${discussionText}</p>`, author: user!.email!, author_type: 'owner', project_id: project!.id, user_id: user!.id });
    setDiscussionText(''); reload();
  };

  const togglePin = async (d: Discussion) => {
    await supabase.from('discussions').update({ is_pinned: !d.is_pinned }).eq('id', d.id);
    reload();
  };

  const handleDeleteDiscussion = (id: string) => {
    setDeleteDiscussionConfirm({ open: true, discId: id });
  };

  const confirmDeleteDiscussion = async () => {
    if (!deleteDiscussionConfirm.discId) return;
    await supabase.from('discussions').delete().eq('id', deleteDiscussionConfirm.discId);
    setDeleteDiscussionConfirm({ open: false, discId: null });
    toast({ title: 'Discussion deleted' });
    reload();
  };

  const updateStatusNote = async () => {
    if (!project) return;
    await supabase.from('projects').update({ status_note: statusNote || null }).eq('id', project.id);
    toast({ title: 'Status note updated' });
  };

  const updateCollabPassword = async () => {
    if (!project) return;
    await supabase.from('projects').update({ collab_password_hash: newPassword || null }).eq('id', project.id);
    setNewPassword('');
    toast({ title: newPassword ? 'Collaborator password updated' : 'Collaborator access removed' });
  };

  const copyCollabLink = () => {
    if (!project?.slug) return;
    navigator.clipboard.writeText(`${window.location.origin}/collab/${project.slug}`);
    toast({ title: 'Collaborator link copied!' });
  };

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  if (!project) return <div className="animate-fade-in space-y-4"><p className="text-muted-foreground">Project not found.</p><Button variant="outline" asChild><Link to="/projects">Back</Link></Button></div>;

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === 'done').length;
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const nextMeeting = meetings.find(m => new Date(m.scheduled_at) > new Date());

  return (
    <div className="animate-fade-in space-y-4 sm:space-y-6 max-w-[1200px]">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Button variant="ghost" size="icon" asChild><Link to="/projects"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <div className="h-4 w-1 rounded" style={{ backgroundColor: project.color }} />
          <h1 className="text-lg sm:text-2xl font-semibold text-foreground">{project.name}</h1>
          <Badge className={`capitalize ${statusColors[project.status] || 'bg-muted text-muted-foreground'}`}>{project.status.replace('_', ' ')}</Badge>
          {project.type && <Badge variant="outline" className="capitalize text-xs">{project.type.replace('_', ' ')}</Badge>}
        </div>
        {project.tags?.length > 0 && (
          <div className="flex gap-1 flex-wrap pl-0 sm:pl-12">{project.tags.map(t => <Badge key={t} variant="secondary" className="text-[10px] sm:text-xs">{t}</Badge>)}</div>
        )}
        <div className="flex flex-wrap items-center gap-3 sm:gap-6 pl-0 sm:pl-12 text-xs text-muted-foreground">
          <span>{doneTasks}/{totalTasks} tasks</span>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-24 sm:w-32 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
            <span>{pct}%</span>
          </div>
          {project.repo_url && <a href={project.repo_url} target="_blank" rel="noopener noreferrer" className="hover:text-primary">Repository ↗</a>}
          <span>{collabSessions.length} collaborator{collabSessions.length !== 1 ? 's' : ''}</span>
          <span>{resources.length} resources</span>
        </div>
        {project.start_date && (
          <div className="flex gap-4 pl-0 sm:pl-12 text-xs text-muted-foreground">
            <span>Started: {format(new Date(project.start_date), 'MMM d, yyyy')}</span>
            {project.target_end_date && <span>Target: {format(new Date(project.target_end_date), 'MMM d, yyyy')}</span>}
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto flex-wrap h-auto gap-1">
          <TabsTrigger value="overview" className="text-xs sm:text-sm">Overview</TabsTrigger>
          <TabsTrigger value="tasks" className="text-xs sm:text-sm"><CheckSquare className="mr-1 h-3 w-3 sm:h-3.5 sm:w-3.5" />Tasks ({totalTasks})</TabsTrigger>
          <TabsTrigger value="milestones" className="text-xs sm:text-sm"><Flag className="mr-1 h-3 w-3 sm:h-3.5 sm:w-3.5" />Milestones</TabsTrigger>
          <TabsTrigger value="resources" className="text-xs sm:text-sm"><LinkIcon className="mr-1 h-3 w-3 sm:h-3.5 sm:w-3.5" />Resources</TabsTrigger>
          <TabsTrigger value="discussions" className="text-xs sm:text-sm"><MessageSquare className="mr-1 h-3 w-3 sm:h-3.5 sm:w-3.5" />Discussions</TabsTrigger>
          <TabsTrigger value="meetings" className="text-xs sm:text-sm"><Calendar className="mr-1 h-3 w-3 sm:h-3.5 sm:w-3.5" />Meetings</TabsTrigger>
          <TabsTrigger value="collaborators" className="text-xs sm:text-sm"><Users className="mr-1 h-3 w-3 sm:h-3.5 sm:w-3.5" />Collaborators</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-4">
          {project.description && <Card><CardContent className="p-4 sm:p-5"><p className="text-sm text-foreground whitespace-pre-wrap">{project.description}</p></CardContent></Card>}

          {/* Status Note */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Current Status Note</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Textarea value={statusNote} onChange={e => setStatusNote(e.target.value)} placeholder="What are you working on right now?" rows={2} />
              <Button size="sm" onClick={updateStatusNote}>Save</Button>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-4">
            <Card><CardContent className="p-3 sm:p-4 text-center"><p className="text-xl sm:text-2xl font-semibold text-foreground">{doneTasks}</p><p className="text-[10px] sm:text-xs text-muted-foreground">Completed</p></CardContent></Card>
            <Card><CardContent className="p-3 sm:p-4 text-center"><p className="text-xl sm:text-2xl font-semibold text-foreground">{totalTasks - doneTasks}</p><p className="text-[10px] sm:text-xs text-muted-foreground">Remaining</p></CardContent></Card>
            <Card><CardContent className="p-3 sm:p-4 text-center"><p className="text-xl sm:text-2xl font-semibold text-foreground">{milestones.filter(m => !m.is_completed).length}</p><p className="text-[10px] sm:text-xs text-muted-foreground">Milestones</p></CardContent></Card>
            <Card><CardContent className="p-3 sm:p-4 text-center"><p className="text-xl sm:text-2xl font-semibold text-foreground">{resources.length}</p><p className="text-[10px] sm:text-xs text-muted-foreground">Resources</p></CardContent></Card>
          </div>
        </TabsContent>

        {/* Tasks */}
        <TabsContent value="tasks" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={taskDialog} onOpenChange={setTaskDialog}>
              <DialogTrigger asChild><Button size="sm"><Plus className="mr-1 h-3.5 w-3.5" />Add Task</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editingTask ? 'Edit Task' : 'Add Task'}</DialogTitle></DialogHeader>
                <form onSubmit={addTask} className="space-y-4">
                  <div className="space-y-2"><Label>Title</Label><Input value={taskForm.title} onChange={e => setTaskForm({ ...taskForm, title: e.target.value })} required /></div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2"><Label>Priority</Label><Input value={taskForm.priority} onChange={e => setTaskForm({ ...taskForm, priority: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Due Date</Label><Input type="date" value={taskForm.due_date} onChange={e => setTaskForm({ ...taskForm, due_date: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Est. (min)</Label><Input type="number" value={taskForm.time_estimate_min} onChange={e => setTaskForm({ ...taskForm, time_estimate_min: e.target.value })} /></div>
                  </div>
                  <Button type="submit" className="w-full">{editingTask ? 'Update Task' : 'Add Task'}</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          {['todo', 'in_progress', 'done'].map(status => {
            const statusTasks = tasks.filter(t => t.status === status);
            if (status === 'done' && statusTasks.length > 0) {
              return (
                <details key={status}>
                  <summary className="mb-2 cursor-pointer text-xs font-medium uppercase text-muted-foreground">Done ({statusTasks.length})</summary>
                  <div className="space-y-1">
                    {statusTasks.map(task => (
                      <div key={task.id} className="flex items-center gap-2 sm:gap-3 rounded-md border border-border px-2 sm:px-3 py-2 transition-colors hover:bg-muted/30 group">
                        <Checkbox checked onCheckedChange={() => toggleTask(task)} />
                        <span className="flex-1 text-xs sm:text-sm text-muted-foreground line-through">{task.title}</span>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEditTask(task)}><Edit2 className="h-3 w-3" /></Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDeleteTask(task.id)}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              );
            }
            if (statusTasks.length === 0) return null;
            return (
              <div key={status}>
                <h3 className="mb-2 text-xs font-medium uppercase text-muted-foreground">{status === 'todo' ? 'To Do' : 'In Progress'} ({statusTasks.length})</h3>
                <div className="space-y-1">
                  {statusTasks.map(task => (
                    <div key={task.id} className="flex items-center gap-2 sm:gap-3 rounded-md border border-border px-2 sm:px-3 py-2.5 transition-colors hover:bg-muted/30 group">
                      <Checkbox checked={false} onCheckedChange={() => toggleTask(task)} />
                      <span className="flex-1 text-xs sm:text-sm text-foreground">{task.title}</span>
                      <Badge className={`text-[10px] sm:text-xs ${priorityColors[task.priority]}`}>{task.priority}</Badge>
                      {task.time_estimate_min && <span className="text-[10px] sm:text-xs text-muted-foreground hidden sm:inline">{task.time_estimate_min}m</span>}
                      {task.due_date && <span className="flex items-center gap-1 text-[10px] sm:text-xs text-muted-foreground"><Clock className="h-3 w-3" />{format(new Date(task.due_date), 'MMM d')}</span>}
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEditTask(task)}><Edit2 className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDeleteTask(task.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </TabsContent>

        {/* Milestones */}
        <TabsContent value="milestones" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={milestoneDialog} onOpenChange={setMilestoneDialog}>
              <DialogTrigger asChild><Button size="sm"><Plus className="mr-1 h-3.5 w-3.5" />Add Milestone</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editingMilestone ? 'Edit Milestone' : 'Add Milestone'}</DialogTitle></DialogHeader>
                <form onSubmit={addMilestone} className="space-y-4">
                  <div className="space-y-2"><Label>Title</Label><Input value={msForm.title} onChange={e => setMsForm({ ...msForm, title: e.target.value })} required /></div>
                  <div className="space-y-2"><Label>Date</Label><Input type="date" value={msForm.date} onChange={e => setMsForm({ ...msForm, date: e.target.value })} required /></div>
                  <Button type="submit" className="w-full">{editingMilestone ? 'Update Milestone' : 'Add Milestone'}</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          {/* Next upcoming */}
          {milestones.filter(m => !m.is_completed && new Date(m.date) >= new Date()).length > 0 && (
            <Card className="border-primary/30">
              <CardContent className="flex items-center gap-3 p-4">
                <Flag className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Next Milestone</p>
                  <p className="text-sm font-medium text-foreground">{milestones.filter(m => !m.is_completed && new Date(m.date) >= new Date())[0]?.title}</p>
                </div>
                <span className="ml-auto text-xs text-muted-foreground">{format(new Date(milestones.filter(m => !m.is_completed && new Date(m.date) >= new Date())[0]?.date), 'MMM d, yyyy')}</span>
              </CardContent>
            </Card>
          )}
          {milestones.map(ms => (
            <div key={ms.id} className="flex items-center gap-2 sm:gap-3 rounded-md border border-border px-3 sm:px-4 py-3 transition-colors hover:bg-muted/30 group">
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
        <TabsContent value="resources" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={resourceDialog} onOpenChange={setResourceDialog}>
              <DialogTrigger asChild><Button size="sm"><Plus className="mr-1 h-3.5 w-3.5" />Add Resource</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editingResource ? 'Edit Resource' : 'Add Resource'}</DialogTitle></DialogHeader>
                <form onSubmit={addResource} className="space-y-4">
                  <div className="space-y-2"><Label>Title</Label><Input value={resForm.title} onChange={e => setResForm({ ...resForm, title: e.target.value })} required /></div>
                  <div className="space-y-2"><Label>URL</Label><Input value={resForm.url} onChange={e => setResForm({ ...resForm, url: e.target.value })} placeholder="https://" /></div>
                  <div className="space-y-2"><Label>Type</Label><Input value={resForm.type} onChange={e => setResForm({ ...resForm, type: e.target.value })} placeholder="link, pdf, doc, image, video, code, note" /></div>
                  <Button type="submit" className="w-full">{editingResource ? 'Update Resource' : 'Add Resource'}</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          {resources.map(r => (
            <Card key={r.id} className="group">
              <CardContent className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4">
                <Badge variant="outline" className="text-[10px] sm:text-xs capitalize">{r.type}</Badge>
                <span className="flex-1 text-xs sm:text-sm text-foreground truncate">{r.title}</span>
                {r.tags?.length > 0 && r.tags.map(tag => <Badge key={tag} variant="secondary" className="text-[10px] hidden sm:inline-flex">{tag}</Badge>)}
                {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4 text-muted-foreground hover:text-primary" /></a>}
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleEditResource(r)}><Edit2 className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDeleteResource(r.id)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {resources.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No resources yet</p>}
        </TabsContent>

        {/* Discussions */}
        <TabsContent value="discussions" className="space-y-4">
          <div className="flex gap-2">
            <Textarea value={discussionText} onChange={e => setDiscussionText(e.target.value)} placeholder="Write a discussion entry..." rows={2} className="flex-1" />
            <Button onClick={addDiscussion} disabled={!discussionText.trim()} className="shrink-0">Post</Button>
          </div>
          {discussions.map(d => (
            <Card key={d.id} className={`${d.is_pinned ? 'border-primary/30' : ''} group`}>
              <CardContent className="p-3 sm:p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  {d.is_pinned && <Pin className="h-3.5 w-3.5 text-primary" />}
                  <span className="text-xs font-medium text-foreground">{d.author}</span>
                  <Badge variant="outline" className="text-[10px] capitalize">{d.author_type}</Badge>
                  <span className="text-[10px] text-muted-foreground">{format(new Date(d.created_at), 'MMM d, h:mm a')}</span>
                  <div className="flex gap-1 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="sm" className="h-6 px-1.5" onClick={() => togglePin(d)}>
                      <Pin className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDeleteDiscussion(d.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </div>
                <div className="text-xs sm:text-sm text-foreground" dangerouslySetInnerHTML={{ __html: d.body_html }} />
              </CardContent>
            </Card>
          ))}
          {discussions.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No discussions yet</p>}
        </TabsContent>

        {/* Meetings */}
        <TabsContent value="meetings" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={meetingDialog} onOpenChange={setMeetingDialog}>
              <DialogTrigger asChild><Button size="sm"><Plus className="mr-1 h-3.5 w-3.5" />Add Meeting</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editingMeeting ? 'Edit Meeting' : 'Add Meeting'}</DialogTitle></DialogHeader>
                <form onSubmit={addMeeting} className="space-y-4">
                  <div className="space-y-2"><Label>Title</Label><Input value={meetForm.title} onChange={e => setMeetForm({ ...meetForm, title: e.target.value })} required /></div>
                  <div className="space-y-2"><Label>Date & Time</Label><Input type="datetime-local" value={meetForm.scheduled_at} onChange={e => setMeetForm({ ...meetForm, scheduled_at: e.target.value })} required /></div>
                  <div className="space-y-2"><Label>Attendees</Label><Input value={meetForm.attendees} onChange={e => setMeetForm({ ...meetForm, attendees: e.target.value })} placeholder="Names or emails" /></div>
                  <div className="space-y-2"><Label>Agenda</Label><Textarea value={meetForm.agenda} onChange={e => setMeetForm({ ...meetForm, agenda: e.target.value })} rows={3} /></div>
                  <Button type="submit" className="w-full">{editingMeeting ? 'Update Meeting' : 'Add Meeting'}</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          {/* Next Meeting */}
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
          {meetings.map(m => {
            const isPast = new Date(m.scheduled_at) < new Date();
            return (
              <Card key={m.id} className={`${isPast ? 'opacity-70' : ''} group`}>
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
                  {m.agenda_html && <div className="text-[10px] sm:text-xs text-muted-foreground" dangerouslySetInnerHTML={{ __html: m.agenda_html }} />}
                  {m.notes_html && <div className="mt-2 rounded bg-muted/50 p-2 sm:p-3 text-[10px] sm:text-xs text-foreground" dangerouslySetInnerHTML={{ __html: m.notes_html }} />}
                  {m.action_items && <p className="text-[10px] sm:text-xs text-primary">Action: {m.action_items}</p>}
                </CardContent>
              </Card>
            );
          })}
          {meetings.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No meetings yet</p>}
        </TabsContent>

        {/* Collaborators */}
        <TabsContent value="collaborators" className="space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Collaborator Access</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {project.slug && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <code className="flex-1 rounded bg-muted px-3 py-2 text-xs font-mono text-foreground break-all">{window.location.origin}/collab/{project.slug}</code>
                  <Button variant="outline" size="sm" onClick={copyCollabLink}><Copy className="mr-1 h-3.5 w-3.5" />Copy</Button>
                </div>
              )}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-2">
                  <Label className="text-xs">Change/Set Password</Label>
                  <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder={project.collab_password_hash ? 'Enter new password...' : 'Set a password to enable access'} />
                </div>
                <Button size="sm" onClick={updateCollabPassword}>{project.collab_password_hash ? 'Update' : 'Set Password'}</Button>
              </div>
              {project.collab_password_hash && <p className="text-xs text-success">✓ Collaborator access enabled</p>}
              {!project.collab_password_hash && <p className="text-xs text-muted-foreground">No collaborator password set — project is private</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Active Collaborators ({collabSessions.length})</CardTitle></CardHeader>
            <CardContent>
              {collabSessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No collaborators have accessed this project yet.</p>
              ) : (
                <div className="space-y-2">
                  {collabSessions.map(cs => (
                    <div key={cs.id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between rounded-md border border-border p-3">
                      <span className="text-sm text-foreground">{cs.email}</span>
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        <span>Last access: {format(new Date(cs.last_access_at), 'MMM d, h:mm a')}</span>
                        <Badge variant={new Date(cs.expires_at) > new Date() ? 'secondary' : 'destructive'} className="text-[10px]">
                          {new Date(cs.expires_at) > new Date() ? 'Active' : 'Expired'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Confirm Dialogs */}
      <ConfirmDialog
        open={deleteTaskConfirm.open}
        onOpenChange={(open) => setDeleteTaskConfirm({ ...deleteTaskConfirm, open })}
        title="Delete Task"
        description="Are you sure you want to delete this task? This action cannot be undone."
        onConfirm={confirmDeleteTask}
        variant="destructive"
      />

      <ConfirmDialog
        open={deleteMilestoneConfirm.open}
        onOpenChange={(open) => setDeleteMilestoneConfirm({ ...deleteMilestoneConfirm, open })}
        title="Delete Milestone"
        description="Are you sure you want to delete this milestone? This action cannot be undone."
        onConfirm={confirmDeleteMilestone}
        variant="destructive"
      />

      <ConfirmDialog
        open={deleteResourceConfirm.open}
        onOpenChange={(open) => setDeleteResourceConfirm({ ...deleteResourceConfirm, open })}
        title="Delete Resource"
        description="Are you sure you want to delete this resource? This action cannot be undone."
        onConfirm={confirmDeleteResource}
        variant="destructive"
      />

      <ConfirmDialog
        open={deleteDiscussionConfirm.open}
        onOpenChange={(open) => setDeleteDiscussionConfirm({ ...deleteDiscussionConfirm, open })}
        title="Delete Discussion"
        description="Are you sure you want to delete this discussion? This action cannot be undone."
        onConfirm={confirmDeleteDiscussion}
        variant="destructive"
      />

      <ConfirmDialog
        open={deleteMeetingConfirm.open}
        onOpenChange={(open) => setDeleteMeetingConfirm({ ...deleteMeetingConfirm, open })}
        title="Delete Meeting"
        description="Are you sure you want to delete this meeting? This action cannot be undone."
        onConfirm={confirmDeleteMeeting}
        variant="destructive"
      />
    </div>
  );
}
