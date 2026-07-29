import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckSquare, Plus, Link2, Calendar, AlertTriangle, TrendingUp, ChevronLeft, ChevronRight, ListChecks } from 'lucide-react';
import { format, startOfWeek, endOfWeek, addDays, addWeeks, subWeeks, isWithinInterval, isSameDay } from 'date-fns';
import { PageHeader } from '@/components/PageHeader';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts';
import { WeeklyReviewSkeleton } from '@/components/skeletons/pages';
import { Skeleton } from '@/components/ui/skeleton';

interface TaskRow { id: string; title: string; status: string; due_date: string | null; project_id: string | null; created_at: string; updated_at: string; }
interface LinkRow { id: string; created_at: string; }
interface MeetingRow { id: string; scheduled_at: string; }
interface ProjectRow { id: string; name: string; }

export default function WeeklyReview() {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id;
  // `initialLoad` gates the full-page skeleton (first mount only); `loading`
  // covers every refetch (e.g. clicking prev/next week) and only swaps the
  // numbers/lists for inline placeholders - the header and nav buttons stay
  // mounted so clicking "next week" doesn't blow away the controls you just
  // clicked.
  const [initialLoad, setInitialLoad] = useState(true);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [stats, setStats] = useState({
    completedTasks: 0,
    newTasks: 0,
    overdueCarried: 0,
    linksSaved: 0,
    meetingsHeld: 0,
    projectsTouched: [] as string[],
  });
  const [nextWeekTasks, setNextWeekTasks] = useState<{ title: string; project?: string; due_date: string }[]>([]);
  const [dailyBreakdown, setDailyBreakdown] = useState<{ day: string; completed: number }[]>([]);

  const currentWeekDate = weekOffset === 0 ? new Date() : (weekOffset > 0 ? addWeeks(new Date(), weekOffset) : subWeeks(new Date(), Math.abs(weekOffset)));
  const weekStart = startOfWeek(currentWeekDate);
  const weekEnd = endOfWeek(currentWeekDate);

  useEffect(() => {
    if (!user || !wsId) return;
    const load = async () => {
      setLoading(true);
      const nextStart = addDays(weekEnd, 1);
      const nextEnd = addDays(nextStart, 6);

      const [allTasks, allLinks, allMeetings, allProjects] = await Promise.all([
        api.select<TaskRow>('tasks', wsId),
        api.select<LinkRow>('links', wsId),
        api.select<MeetingRow>('meetings', wsId),
        api.select<ProjectRow>('projects', wsId),
      ]);

      const projectMap = Object.fromEntries(allProjects.map(p => [p.id, p.name]));

      const completedThisWeek = allTasks.filter(t =>
        t.status === 'done' && t.updated_at && isWithinInterval(new Date(t.updated_at), { start: weekStart, end: weekEnd })
      );
      const newThisWeek = allTasks.filter(t =>
        isWithinInterval(new Date(t.created_at), { start: weekStart, end: weekEnd })
      );
      const linksThisWeek = allLinks.filter(l =>
        isWithinInterval(new Date(l.created_at), { start: weekStart, end: weekEnd })
      );
      const meetingsThisWeek = allMeetings.filter(m =>
        isWithinInterval(new Date(m.scheduled_at), { start: weekStart, end: weekEnd })
      );

      const touched = new Set<string>();
      completedThisWeek.forEach(t => { if (t.project_id && projectMap[t.project_id]) touched.add(projectMap[t.project_id]); });

      const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
      setDailyBreakdown(days.map(day => ({
        day: format(day, 'EEE'),
        completed: completedThisWeek.filter(t => isSameDay(new Date(t.updated_at), day)).length,
      })));

      const nextWeek = allTasks
        .filter(t => t.due_date && t.status !== 'done' && isWithinInterval(new Date(t.due_date), { start: nextStart, end: nextEnd }))
        .map(t => ({ title: t.title, project: t.project_id ? projectMap[t.project_id] : undefined, due_date: t.due_date! }));

      setStats({
        completedTasks: completedThisWeek.length,
        newTasks: newThisWeek.length,
        overdueCarried: allTasks.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date) < weekStart).length,
        linksSaved: linksThisWeek.length,
        meetingsHeld: meetingsThisWeek.length,
        projectsTouched: Array.from(touched),
      });
      setNextWeekTasks(nextWeek);
      setLoading(false);
      setInitialLoad(false);
    };
    load();
  }, [user, wsId, weekOffset]);

  if (initialLoad) return <WeeklyReviewSkeleton />;

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title="Weekly Review" />

      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setWeekOffset(o => o - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[200px] text-center text-foreground">
            {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
          </span>
          <Button variant="ghost" size="icon" onClick={() => setWeekOffset(o => o + 1)} disabled={weekOffset >= 0}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={() => setWeekOffset(0)} disabled={weekOffset === 0}>
          This Week
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: 'Completed', value: stats.completedTasks, icon: CheckSquare, color: 'text-success', bg: 'bg-success/10' },
          { label: 'New Tasks', value: stats.newTasks, icon: Plus, color: 'text-primary', bg: 'bg-primary/10' },
          { label: 'Overdue', value: stats.overdueCarried, icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive/10' },
          { label: 'Links Saved', value: stats.linksSaved, icon: Link2, color: 'text-accent', bg: 'bg-accent/10' },
          { label: 'Meetings', value: stats.meetingsHeld, icon: Calendar, color: 'text-blue-500', bg: 'bg-blue-500/10' },
        ].map(({ label, value, icon: Icon, color, bg }, index) => (
          <Card key={label} className="animate-scale-in hover-lift" style={{ animationDelay: `${Math.min(index * 40, 480)}ms` }}>
            <CardContent className="flex flex-col items-center gap-2 p-4 text-center">
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${bg}`}><Icon className={`h-4.5 w-4.5 ${color}`} /></div>
              {loading ? <Skeleton className="h-7 w-8" /> : <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>}
              <p className="text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Daily completion chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm"><ListChecks className="h-4 w-4 text-primary" />Tasks Completed This Week</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-52">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyBreakdown} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} axisLine={false} tickLine={false} width={24} />
                  <Tooltip
                    cursor={{ fill: 'hsl(var(--muted))' }}
                    contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12, color: 'hsl(var(--popover-foreground))' }}
                  />
                  <Bar dataKey="completed" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Projects touched */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm"><TrendingUp className="h-4 w-4 text-primary" />Projects Touched</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {loading ? (
              <><Skeleton className="h-5 w-20 rounded-full" /><Skeleton className="h-5 w-16 rounded-full" /></>
            ) : stats.projectsTouched.length === 0 ? (
              <p className="text-sm text-muted-foreground">No project activity this week</p>
            ) : stats.projectsTouched.map(p => <Badge key={p} variant="secondary">{p}</Badge>)}
          </CardContent>
        </Card>

        {/* Next week */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Next Week</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></div>
            ) : nextWeekTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tasks due next week</p>
            ) : (
              <div className="space-y-2">
                {nextWeekTasks.map((t, i) => (
                  <div key={i} className="animate-fade-in flex items-center gap-3 text-sm" style={{ animationDelay: `${Math.min(i * 40, 480)}ms` }}>
                    <span className="text-xs text-muted-foreground w-16 shrink-0">{format(new Date(t.due_date), 'EEE d')}</span>
                    <span className="text-foreground">{t.title}</span>
                    {t.project && <Badge variant="outline" className="text-xs">{t.project}</Badge>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
