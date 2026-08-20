import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderKanban, CheckSquare, FileText, Link2, Plus, Clock, AlertTriangle, Calendar, CalendarClock, Flag, Video, TrendingUp, CheckCircle2, PartyPopper } from 'lucide-react';
import { api } from '@/lib/api';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { format, isToday, isBefore, startOfToday, addDays, isWithinInterval } from 'date-fns';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/PageHeader';
import { PRIORITY_COLORS, PROJECT_STATUS_COLORS } from '@/lib/taskMeta';
import { DashboardSkeleton } from '@/components/skeletons/pages';

/**
 * The date, as a line of context rather than a hero.
 *
 * This used to be a gradient card with a clock ticking once a second - the
 * largest, loudest element on the page, re-rendering 3,600 times an hour to
 * tell you something the operating system already puts in the corner of the
 * screen. The date belongs here, in the subtitle, and the seconds belong
 * nowhere.
 */
function greetingLine(): string {
  const now = new Date();
  const h = now.getHours();
  const greeting = h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return `${greeting} - ${now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}`;
}

interface Task { id: string; title: string; status: string; priority: string; due_date: string | null; due_time: string | null; time_estimate_min: number | null; project_id: string | null; }
interface Project { id: string; name: string; status: string; color: string; slug: string | null; updated_at: string; }
interface Milestone { id: string; title: string; date: string; project_id: string; is_completed: boolean; }
interface Meeting { id: string; title: string; scheduled_at: string; project_id: string; }
interface CalendarEvent { id: string; title: string; scheduled_at: string; project_id: string; location?: string; }

const priorityColors = PRIORITY_COLORS;
const projectStatusColors = PROJECT_STATUS_COLORS;

export default function Dashboard() {
  const { currentWorkspace } = useWorkspace();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ projects: 0, links: 0, notes: 0, meetings: 0 });

  const fetchData = async () => {
    if (!currentWorkspace) return;
    const wsId = currentWorkspace.id;
    const [tasksRes, projRes, msRes, linksRes, notesRes, meetingsRes, eventsRes] = await Promise.all([
      api.select<Task>('tasks', wsId),
      api.select<Project>('projects', wsId),
      api.select<Milestone>('milestones', wsId, { is_completed: false }),
      api.select<{ id: string }>('links', wsId),
      api.select<{ id: string }>('notes', wsId),
      api.select<Meeting>('meetings', wsId),
      api.select<CalendarEvent>('events', wsId),
    ]);

    const tasksSorted = [...tasksRes].sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return +new Date(a.due_date) - +new Date(b.due_date);
    });
    const projSorted = [...projRes].sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at));
    const msSorted = [...msRes].sort((a, b) => +new Date(a.date) - +new Date(b.date));
    const now = new Date();
    const meetingsSorted = [...meetingsRes]
      .filter(m => new Date(m.scheduled_at) >= now)
      .sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at))
      .slice(0, 10);
    const eventsSorted = [...eventsRes]
      .filter(e => new Date(e.scheduled_at) >= now)
      .sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at))
      .slice(0, 10);

    setTasks(tasksSorted);
    setProjects(projSorted);
    setMilestones(msSorted);
    setMeetings(meetingsSorted);
    setCalendarEvents(eventsSorted);
    setStats({ projects: projSorted.length, links: linksRes.length, notes: notesRes.length, meetings: meetingsSorted.length + eventsSorted.length });
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [currentWorkspace?.id]);

  const today = startOfToday();
  const activeTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'dropped');
  const todayTasks = activeTasks.filter(t => t.due_date && isToday(new Date(t.due_date)));
  const overdueTasks = activeTasks.filter(t => t.due_date && isBefore(new Date(t.due_date), today));
  const upcomingTasks = activeTasks.filter(t => t.due_date && isWithinInterval(new Date(t.due_date), { start: addDays(today, 1), end: addDays(today, 7) }));
  const doneTodayTasks = tasks.filter(t => t.status === 'done');
  const blockedTasks = tasks.filter(t => t.status === 'blocked');
  const projectMap = Object.fromEntries(projects.map(p => [p.id, p]));

  const totalEstimateToday = todayTasks.reduce((sum, t) => sum + (t.time_estimate_min ?? 0), 0);
  const totalEstimateWeek = activeTasks.filter(t => t.due_date && isWithinInterval(new Date(t.due_date), { start: today, end: addDays(today, 7) })).reduce((sum, t) => sum + (t.time_estimate_min ?? 0), 0);
  const availableHours = 7 * 8;
  const workloadWarning = totalEstimateWeek / 60 > availableHours;

  // Combine upcoming events: only events and meetings
  const upcomingEvents = [
    ...meetings.map(m => ({ id: m.id, title: m.title, date: new Date(m.scheduled_at), type: 'meeting' as const, projectId: m.project_id })),
    ...calendarEvents.map(e => ({ id: e.id, title: e.title, date: new Date(e.scheduled_at), type: 'event' as const, projectId: e.project_id })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 8);

  const eventTypeIcon = (type: string) => {
    if (type === 'meeting') return <Video className="h-3.5 w-3.5 text-success shrink-0" />;
    return <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />;
  };

  const toggleTask = async (taskId: string, currentStatus: string) => {
    if (!currentWorkspace) return;
    const newStatus = currentStatus === 'done' ? 'todo' : 'done';
    await api.update('tasks', currentWorkspace.id, taskId, { status: newStatus });
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
  };

  const snoozeTask = async (taskId: string, newDate: Date) => {
    if (!currentWorkspace) return;
    const dateStr = format(newDate, 'yyyy-MM-dd');
    await api.update('tasks', currentWorkspace.id, taskId, { due_date: dateStr });
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, due_date: dateStr } : t));
  };

  const TaskRow = ({ task, showSnooze, index = 0 }: { task: Task; showSnooze?: boolean; index?: number }) => (
    <div className="animate-fade-in space-y-2 rounded-md px-2 sm:px-3 py-2 transition-colors hover:bg-muted/50" style={{ animationDelay: `${Math.min(index * 40, 480)}ms` }}>
      <div className="flex items-center gap-2 sm:gap-3">
        <Checkbox checked={task.status === 'done'} onCheckedChange={() => toggleTask(task.id, task.status)} />
        <div className="flex-1 min-w-0">
          <span className={`text-xs sm:text-sm ${task.status === 'done' ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{task.title}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 items-center ml-6 sm:ml-7">
        {task.project_id && projectMap[task.project_id] && (
          <Badge variant="outline" className="text-xs sm:text-xs">
            <span className="mr-1 h-1.5 w-1.5 rounded-full inline-block" style={{ backgroundColor: projectMap[task.project_id].color }} />
            {projectMap[task.project_id].name.substring(0, 12)}
          </Badge>
        )}
        <Badge className={`text-xs sm:text-xs ${priorityColors[task.priority]}`}>{task.priority}</Badge>
        {task.time_estimate_min && <span className="text-xs sm:text-xs text-muted-foreground">{task.time_estimate_min}m</span>}
        {task.due_time && <span className="text-xs text-muted-foreground">{task.due_time}</span>}
        {showSnooze && (
          <div className="flex gap-1 ml-auto">
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => snoozeTask(task.id, addDays(new Date(), 1))}>Tomorrow</Button>
            <Popover>
              <PopoverTrigger asChild><Button variant="ghost" size="sm" className="h-6 px-1.5"><CalendarClock className="h-3 w-3" /></Button></PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <CalendarPicker mode="single" onSelect={(d) => d && snoozeTask(task.id, d)} className={cn("p-3 pointer-events-auto")} />
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>
    </div>
  );

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="animate-fade-in px-4 py-4 sm:px-6 sm:py-6 space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle={greetingLine()}
        actions={
          <>
            <Button variant="outline" size="sm" asChild><Link to="/tasks"><CheckSquare className="mr-1 h-3.5 w-3.5" />Tasks</Link></Button>
            <Button size="sm" asChild><Link to="/projects"><Plus className="mr-1 h-3.5 w-3.5" />Project</Link></Button>
          </>
        }
      />

      <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {todayTasks.length} tasks today · {totalEstimateToday > 0 ? `${Math.floor(totalEstimateToday / 60)}h ${totalEstimateToday % 60}m estimated` : 'no estimates'}
          {overdueTasks.length > 0 && <span className="text-destructive ml-2">· {overdueTasks.length} overdue</span>}
        </p>
      </div>


      {workloadWarning && (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="flex items-center gap-3 p-4 sm:p-6">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
            <p className="text-sm text-warning">Workload warning: {Math.round(totalEstimateWeek / 60)}h estimated exceeds {availableHours}h available this week.</p>
          </CardContent>
        </Card>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5">
        {/* Two of these used to be hardcoded Tailwind blues, which meant the
            row mixed five unrelated hues and ignored whichever palette the
            workspace had chosen. Everything here is a token now, so the tiles
            stay one family in all ten palettes. */}
        {[
          { label: 'Projects', value: stats.projects, icon: FolderKanban, to: '/projects', color: 'text-primary', bg: 'bg-primary/10' },
          { label: 'Open Tasks', value: activeTasks.length, icon: CheckSquare, to: '/tasks', color: 'text-foreground', bg: 'bg-muted' },
          { label: 'Links', value: stats.links, icon: Link2, to: '/resources', color: 'text-muted-foreground', bg: 'bg-muted' },
          { label: 'Notes', value: stats.notes, icon: FileText, to: '/notes', color: 'text-accent', bg: 'bg-accent/10' },
          { label: 'Events', value: upcomingEvents.length, icon: Calendar, to: '/calendar', color: 'text-success', bg: 'bg-success/10' },
        ].map(({ label, value, icon: Icon, to, color, bg }, index) => (
          <Link key={label} to={to} className="animate-scale-in" style={{ animationDelay: `${Math.min(index * 40, 480)}ms` }}>
            <Card className="group relative overflow-hidden transition-all hover-lift">
              <CardContent className="relative flex flex-col gap-3 p-4 sm:p-5">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${bg}`}>
                  <Icon className={`h-4.5 w-4.5 ${color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Project Status Grid */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Projects</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {projects.map((p, index) => {
            const projTasks = tasks.filter(t => t.project_id === p.id);
            const done = projTasks.filter(t => t.status === 'done').length;
            const total = projTasks.length;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            return (
              <Link key={p.id} to={`/projects/${p.slug || p.id}`} className="animate-scale-in" style={{ animationDelay: `${Math.min(index * 40, 480)}ms` }}>
                <Card className="h-full overflow-hidden transition-colors hover:bg-muted/50 hover-lift">
                  <div className="h-1 w-full" style={{ backgroundColor: p.color }} />
                  <CardContent className="p-4 sm:p-6">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground truncate">{p.name}</span>
                      <Badge className={`shrink-0 text-xs capitalize ${projectStatusColors[p.status] || 'bg-muted text-muted-foreground'}`}>{p.status.replace('_', ' ')}</Badge>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-1.5 flex-1 rounded-full bg-muted"><div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: p.color }} /></div>
                      <span className="text-xs font-medium text-muted-foreground tabular-nums">{pct}%</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <span>{done}/{total} tasks</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Time + Upcoming Events Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-3 sm:mb-4">
              <Clock className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Week Workload</span>
              <span className="ml-auto text-xs text-muted-foreground">{Math.round(totalEstimateWeek / 60)}h · {doneTodayTasks.length} done · {activeTasks.length} open</span>
            </div>
            <div className="space-y-2">
              {projects.slice(0, 5).map((p, index) => {
                const projTasks = activeTasks.filter(t => t.project_id === p.id);
                const est = projTasks.reduce((s, t) => s + (t.time_estimate_min ?? 0), 0);
                if (est === 0) return null;
                return (
                  <div key={p.id} className="animate-fade-in flex items-center gap-2" style={{ animationDelay: `${Math.min(index * 40, 480)}ms` }}>
                    <span className="text-xs text-muted-foreground w-24 sm:w-32 truncate">{p.name}</span>
                    <div className="flex-1 h-2 rounded-full bg-muted"><div className="h-full rounded-full transition-all" style={{ width: `${Math.min((est / totalEstimateWeek) * 100, 100)}%`, backgroundColor: p.color }} /></div>
                    <span className="text-xs text-muted-foreground w-10 text-right">{Math.round(est / 60)}h</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming events - combined from calendar */}
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center gap-2 mb-3 sm:mb-4">
              <Calendar className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Upcoming Events</span>
              <Link to="/calendar" className="ml-auto text-xs text-primary hover:underline">View all</Link>
            </div>
            {upcomingEvents.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">No upcoming events</p>
            ) : (
              <div className="space-y-2">
                {upcomingEvents.map((ev, index) => (
                  <div key={`${ev.type}-${ev.id}`} className="animate-fade-in flex items-center gap-2 text-xs" style={{ animationDelay: `${Math.min(index * 40, 480)}ms` }}>
                    {eventTypeIcon(ev.type)}
                    <span className="text-muted-foreground w-14 shrink-0">{isToday(ev.date) ? 'Today' : format(ev.date, 'MMM d')}</span>
                    <span className="text-foreground flex-1 truncate">{ev.title}</span>
                    {ev.type === 'meeting' && <span className="text-muted-foreground">{format(ev.date, 'h:mm a')}</span>}
                    <Badge variant="outline" className="text-xs capitalize">{ev.type}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className={`grid grid-cols-1 gap-4 sm:gap-6 ${overdueTasks.length > 0 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
        {overdueTasks.length > 0 && (
          <Card className="border-destructive/30">
            <CardHeader className="pb-3 sm:pb-4">
              <CardTitle className="flex items-center gap-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" />Overdue
                <Badge variant="destructive" className="text-xs">{overdueTasks.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 p-4 sm:p-6">{overdueTasks.map((t, i) => <TaskRow key={t.id} task={t} showSnooze index={i} />)}</CardContent>
          </Card>
        )}
        {blockedTasks.length > 0 && (
          <Card className="border-warning/30">
            <CardHeader className="pb-3 sm:pb-4">
              <CardTitle className="flex items-center gap-2 text-sm text-warning">
                <AlertTriangle className="h-4 w-4" />Blocked
                <Badge className="text-xs bg-warning/10 text-warning">{blockedTasks.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 p-4 sm:p-6">{blockedTasks.map((t, i) => <TaskRow key={t.id} task={t} index={i} />)}</CardContent>
          </Card>
        )}
        <Card>
          <CardHeader className="pb-3 sm:pb-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-primary" />Today
              <Badge variant="secondary" className="text-xs">{todayTasks.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 p-4 sm:p-6">
            {todayTasks.length === 0 ? (
              <p className="flex items-center justify-center gap-1.5 py-3 text-center text-xs text-muted-foreground"><PartyPopper className="h-3.5 w-3.5" />No tasks due today</p>
            ) : todayTasks.map((t, i) => <TaskRow key={t.id} task={t} index={i} />)}
            {doneTodayTasks.length > 0 && (
              <details className="pt-2">
                <summary className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5 text-success" />{doneTodayTasks.length} completed</summary>
                <div className="mt-2 space-y-1">{doneTodayTasks.slice(0, 5).map((t, i) => <TaskRow key={t.id} task={t} index={i} />)}</div>
              </details>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3 sm:pb-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-primary" />Next 7 Days
              <Badge variant="secondary" className="text-xs">{upcomingTasks.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 p-4 sm:p-6">
            {upcomingTasks.length === 0 ? (
              <p className="py-3 text-center text-xs text-muted-foreground">No upcoming tasks</p>
            ) : upcomingTasks.map((t, i) => (
              <div key={t.id} className="animate-fade-in space-y-1.5 rounded-md px-2 sm:px-3 py-2 transition-colors hover:bg-muted/50" style={{ animationDelay: `${Math.min(i * 40, 480)}ms` }}>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs sm:text-sm text-foreground flex-1">{t.title}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{format(new Date(t.due_date!), 'MMM d')}</span>
                </div>
                <div className="flex gap-1">
                  <Badge className={`text-xs ${priorityColors[t.priority]}`}>{t.priority}</Badge>
                </div>
              </div>
            ))}
            {milestones.filter(m => isWithinInterval(new Date(m.date), { start: today, end: addDays(today, 7) })).map((m, i) => (
              <div key={m.id} className="animate-fade-in flex items-center gap-2 rounded-md px-2 sm:px-3 py-2 bg-primary/5" style={{ animationDelay: `${Math.min(i * 40, 480)}ms` }}>
                <span className="text-xs text-primary w-12 sm:w-14 shrink-0">{format(new Date(m.date), 'MMM d')}</span>
                <span className="flex items-center gap-1.5 text-xs sm:text-sm text-primary flex-1 truncate"><Flag className="h-3 w-3 shrink-0" />{m.title}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
