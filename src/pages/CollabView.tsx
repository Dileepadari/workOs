import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { CheckSquare, Flag, LinkIcon, MessageSquare, Lock, Pin, ExternalLink, Clock, Calendar } from 'lucide-react';
import { format } from 'date-fns';

interface Project { id: string; name: string; description: string | null; status: string; color: string; slug: string; type: string; tags: string[]; start_date: string | null; target_end_date: string | null; status_note: string | null; }
interface Task { id: string; title: string; status: string; priority: string; due_date: string | null; due_time: string | null; time_estimate_min: number | null; }
interface Milestone { id: string; title: string; date: string; is_completed: boolean; }
interface Resource { id: string; title: string; url: string | null; type: string; tags: string[]; }
interface Discussion { id: string; body_html: string; author: string; author_type: string; is_pinned: boolean; created_at: string; }
interface Meeting { id: string; title: string; scheduled_at: string; attendees: string | null; agenda_html: string | null; }
interface CollabProject { id: string; name: string; slug: string; status: string; color: string; type: string; description: string | null; role: string; open_tasks: number; total_tasks: number; }

const priorityColors: Record<string, string> = { urgent: 'bg-destructive/20 text-destructive', high: 'bg-warning/20 text-warning', medium: 'bg-primary/20 text-primary', low: 'bg-muted text-muted-foreground' };
const statusColors: Record<string, string> = { active: 'bg-success/20 text-success', on_hold: 'bg-warning/20 text-warning', archived: 'bg-muted text-muted-foreground' };

export default function CollabView() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'detail'>('login');
  const [authMethod, setAuthMethod] = useState<'password' | 'account'>('account');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState('viewer');

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [discussionText, setDiscussionText] = useState('');

  // Auto-login if user is authenticated and slug is provided
  useEffect(() => {
    if (slug) {
      if (user) {
        handleAccountLogin(user.email!);
      } else {
        setMode('login');
      }
    }
  }, [user, slug]);

  const handleAccountLogin = async (userEmail: string) => {
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase.rpc('verify_collab_by_email', {
      p_project_slug: slug,
      p_email: userEmail,
    });
    if (err || !data?.success) {
      setAuthMethod('password');
      setEmail(userEmail);
      setLoading(false);
      return;
    }
    setSessionId(data.session_id);
    setRole(data.role || 'viewer');
    await loadProjectData(data.session_id);
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase.rpc('verify_collab_password', {
      p_project_slug: slug,
      p_email: email,
      p_password: password,
    });
    if (err || !data?.success) {
      setError(data?.error || err?.message || 'Authentication failed');
      setLoading(false);
      return;
    }
    setSessionId(data.session_id);
    setRole('viewer');
    await loadProjectData(data.session_id);
  };

  const loadProjectData = async (sid: string) => {
    const { data: projData, error: projErr } = await supabase.rpc('get_collab_project_data', { p_session_id: sid });
    if (projErr || !projData?.success) {
      setError('Failed to load project data');
      setLoading(false);
      return;
    }
    setProject(projData.project);
    setTasks(projData.tasks || []);
    setMilestones(projData.milestones || []);
    setResources(projData.resources || []);
    setDiscussions(projData.discussions || []);
    setMeetings(projData.meetings || []);
    setMode('detail');
    setLoading(false);
  };

  const addCollabDiscussion = async () => {
    if (!discussionText.trim() || !project || !sessionId) return;
    if (user) {
      await supabase.from('discussions').insert({
        body_html: `<p>${discussionText}</p>`,
        author: user.email!,
        author_type: 'collaborator',
        project_id: project.id,
        user_id: user.id,
      });
      setDiscussionText('');
      await loadProjectData(sessionId);
    }
  };

  // Login form
  if (mode === 'login') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-3">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Lock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-xl">Access Collaboration Project</CardTitle>
              <p className="text-xs sm:text-sm text-muted-foreground mt-2">
                {authMethod === 'account'
                  ? 'Sign in with your account to access this project'
                  : 'Enter your credentials to access this project'}
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {authMethod === 'account' ? (
              <div className="space-y-3">
                <Button className="w-full text-sm h-9" asChild>
                  <Link to={`/auth?redirect=/collab/${slug}`}>Sign in with account</Link>
                </Button>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">or continue as guest</span>
                  </div>
                </div>
                <Button variant="outline" className="w-full text-sm h-9" onClick={() => setAuthMethod('password')}>
                  Use guest password
                </Button>
              </div>
            ) : (
              <form onSubmit={handlePasswordLogin} className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-xs sm:text-sm font-medium">Email</Label>
                  <Input 
                    type="email" 
                    value={email} 
                    onChange={e => setEmail(e.target.value)} 
                    required 
                    placeholder="your@email.com" 
                    className="text-sm h-9"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs sm:text-sm font-medium">Password</Label>
                  <Input 
                    type="password" 
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    required 
                    placeholder="••••••••"
                    className="text-sm h-9"
                  />
                </div>
                {error && <p className="text-xs text-destructive bg-destructive/10 p-2.5 rounded">{error}</p>}
                <Button type="submit" className="w-full text-sm h-9" disabled={loading}>
                  {loading ? 'Verifying...' : 'Access Project'}
                </Button>
                <Button 
                  type="button"
                  variant="ghost" 
                  className="w-full text-xs h-8" 
                  onClick={() => {
                    setAuthMethod('account');
                    setError('');
                  }}
                >
                  Sign in with account instead
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!project) return null;

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === 'done').length;
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const canComment = ['commenter', 'editor', 'admin'].includes(role);

  const taskStatuses = ['todo', 'in_progress', 'blocked', 'done', 'dropped'];
  const statusLabels: Record<string, string> = { todo: 'To Do', in_progress: 'In Progress', blocked: 'Blocked', done: 'Done', dropped: 'Dropped' };

  return (
    <div className="space-y-6 px-4 py-4 sm:px-6 sm:py-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:gap-6 sm:items-center sm:justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="h-3 w-1 rounded" style={{ backgroundColor: project.color }} />
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{project.name}</h1>
            <Badge className={`capitalize text-xs ${statusColors[project.status] || 'bg-muted text-muted-foreground'}`}>
              {project.status.replace('_', ' ')}
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground flex flex-wrap gap-2">
            <Badge variant="secondary" className="text-xs capitalize">🔑 {role}</Badge>
            <Badge variant="secondary" className="text-xs">{email || user?.email}</Badge>
          </p>
        </div>
        {user && (
          <Button variant="outline" size="sm" onClick={() => navigate('/collab')} className="w-full sm:w-auto h-9">
            ← Back to Collaborations
          </Button>
        )}
      </div>

      {/* Progress */}
      <Card className="bg-gradient-to-r from-primary/5 to-accent/5">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">{doneTasks}/{totalTasks} tasks completed</p>
              <p className="text-xs text-muted-foreground mt-1">Overall progress</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 sm:w-32 h-2 rounded-full bg-muted/50">
                <div 
                  className="h-full rounded-full bg-primary transition-all" 
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-sm font-medium text-foreground w-12 text-right">{pct}%</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto flex-wrap h-auto gap-1 bg-muted/30 p-1">
          <TabsTrigger value="overview" className="text-xs sm:text-sm">Overview</TabsTrigger>
          <TabsTrigger value="tasks" className="text-xs sm:text-sm"><CheckSquare className="mr-1 h-3 w-3" />Tasks</TabsTrigger>
          <TabsTrigger value="milestones" className="text-xs sm:text-sm"><Flag className="mr-1 h-3 w-3" />Milestones</TabsTrigger>
          <TabsTrigger value="resources" className="text-xs sm:text-sm"><LinkIcon className="mr-1 h-3 w-3" />Resources</TabsTrigger>
          <TabsTrigger value="discussions" className="text-xs sm:text-sm"><MessageSquare className="mr-1 h-3 w-3" />Discussions</TabsTrigger>
          <TabsTrigger value="meetings" className="text-xs sm:text-sm"><Calendar className="mr-1 h-3 w-3" />Meetings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-6">
          {project.description && <Card><CardContent className="p-4 sm:p-6"><p className="text-sm text-foreground whitespace-pre-wrap">{project.description}</p></CardContent></Card>}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <Card><CardContent className="p-4 sm:p-6 text-center"><p className="text-xl font-semibold text-foreground">{doneTasks}</p><p className="text-xs sm:text-sm text-muted-foreground">Done</p></CardContent></Card>
            <Card><CardContent className="p-4 sm:p-6 text-center"><p className="text-xl font-semibold text-foreground">{totalTasks - doneTasks}</p><p className="text-xs sm:text-sm text-muted-foreground">Remaining</p></CardContent></Card>
            <Card><CardContent className="p-4 sm:p-6 text-center"><p className="text-xl font-semibold text-foreground">{milestones.filter(m => !m.is_completed).length}</p><p className="text-xs sm:text-sm text-muted-foreground">Milestones</p></CardContent></Card>
            <Card><CardContent className="p-4 sm:p-6 text-center"><p className="text-xl font-semibold text-foreground">{resources.length}</p><p className="text-xs sm:text-sm text-muted-foreground">Resources</p></CardContent></Card>
          </div>
          {project.status_note && <p className="text-xs text-primary italic">{project.status_note}</p>}
        </TabsContent>

        <TabsContent value="tasks" className="space-y-4 mt-6">
          {taskStatuses.map(status => {
            const statusTasks = tasks.filter(t => t.status === status);
            if (statusTasks.length === 0) return null;
            const isCollapsible = status === 'done' || status === 'dropped';
            const content = (
              <div className="space-y-2">
                {statusTasks.map(t => (
                  <div key={t.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs">
                    <span className={`flex-1 ${t.status === 'done' ? 'text-muted-foreground line-through' : t.status === 'dropped' ? 'text-muted-foreground line-through italic' : 'text-foreground'}`}>{t.title}</span>
                    <Badge className={`text-xs ${priorityColors[t.priority]}`}>{t.priority}</Badge>
                    {t.due_date && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />{format(new Date(t.due_date), 'MMM d')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            );
            if (isCollapsible) {
              return (
                <details key={status} className="space-y-2">
                  <summary className="mb-2 cursor-pointer text-xs font-medium uppercase text-muted-foreground hover:text-foreground">{statusLabels[status]} ({statusTasks.length})</summary>
                  {content}
                </details>
              );
            }
            return (
              <div key={status}>
                <h3 className="mb-2 text-xs font-medium uppercase text-muted-foreground">{statusLabels[status]} ({statusTasks.length})</h3>
                {content}
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="milestones" className="space-y-2 mt-6">
          {milestones.map(ms => (
            <div key={ms.id} className="flex items-center gap-3 rounded-md border border-border px-3 py-2">
              <Flag className={`h-3 w-3 ${ms.is_completed ? 'text-success' : 'text-primary'}`} />
              <span className={`flex-1 text-xs ${ms.is_completed ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{ms.title}</span>
              <span className="text-xs text-muted-foreground">{format(new Date(ms.date), 'MMM d')}</span>
            </div>
          ))}
          {milestones.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">No milestones</p>}
        </TabsContent>

        <TabsContent value="resources" className="space-y-2 mt-6">
          {resources.map(r => (
            <Card key={r.id}>
              <CardContent className="flex items-center gap-3 p-3 sm:p-4">
                <Badge variant="outline" className="text-xs capitalize shrink-0">{r.type}</Badge>
                <span className="flex-1 text-xs sm:text-sm text-foreground">{r.title}</span>
                {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4 text-muted-foreground hover:text-primary transition-colors" /></a>}
              </CardContent>
            </Card>
          ))}
          {resources.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">No resources</p>}
        </TabsContent>

        <TabsContent value="discussions" className="space-y-3 mt-6">
          {canComment && (
            <div className="flex gap-2">
              <Textarea value={discussionText} onChange={e => setDiscussionText(e.target.value)} placeholder="Add a comment..." rows={2} className="flex-1 text-sm resize-none" />
              <Button onClick={addCollabDiscussion} disabled={!discussionText.trim()} size="sm">Post</Button>
            </div>
          )}
          {discussions.map(d => (
            <Card key={d.id} className={d.is_pinned ? 'border-primary/30 bg-primary/5' : ''}>
              <CardContent className="p-4 sm:p-6">
                <div className="mb-2 flex items-center gap-2 flex-wrap">
                  {d.is_pinned && <Pin className="h-3 w-3 text-primary shrink-0" />}
                  <span className="text-xs sm:text-sm font-medium text-foreground">{d.author}</span>
                  <Badge variant="outline" className="text-xs capitalize">{d.author_type}</Badge>
                  <span className="text-xs text-muted-foreground">{format(new Date(d.created_at), 'MMM d, h:mm a')}</span>
                </div>
                <div className="text-xs sm:text-sm text-foreground" dangerouslySetInnerHTML={{ __html: d.body_html }} />
              </CardContent>
            </Card>
          ))}
          {discussions.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">No discussions</p>}
        </TabsContent>

        <TabsContent value="meetings" className="space-y-3 mt-6">
          {meetings.map(m => (
            <Card key={m.id}>
              <CardContent className="p-4 sm:p-6 space-y-1">
                <h4 className="text-sm font-semibold text-foreground">{m.title}</h4>
                <p className="text-xs sm:text-sm text-muted-foreground">{format(new Date(m.scheduled_at), 'EEEE, MMM d · h:mm a')}</p>
                {m.attendees && <p className="text-xs sm:text-sm text-muted-foreground">With: {m.attendees}</p>}
              </CardContent>
            </Card>
          ))}
          {meetings.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">No meetings</p>}
        </TabsContent>
      </Tabs>
    </div>
  );
}
