import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckSquare, Plus, Link2, Calendar, AlertTriangle, TrendingUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, startOfWeek, endOfWeek, addDays, addWeeks, subWeeks, isWithinInterval } from 'date-fns';
import { PageHeader } from '@/components/PageHeader';

export default function WeeklyReview() {
  const { user } = useAuth();
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

  const currentWeekDate = weekOffset === 0 ? new Date() : (weekOffset > 0 ? addWeeks(new Date(), weekOffset) : subWeeks(new Date(), Math.abs(weekOffset)));
  const weekStart = startOfWeek(currentWeekDate);
  const weekEnd = endOfWeek(currentWeekDate);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      const nextStart = addDays(weekEnd, 1);
      const nextEnd = addDays(nextStart, 6);

      const [tasks, links, meetings, projects] = await Promise.all([
        supabase.from('tasks').select('id, title, status, due_date, project_id, created_at, updated_at'),
        supabase.from('links').select('id, created_at'),
        supabase.from('meetings').select('id, scheduled_at'),
        supabase.from('projects').select('id, name'),
      ]);

      const allTasks = tasks.data ?? [];
      const allLinks = links.data ?? [];
      const allMeetings = meetings.data ?? [];
      const projectMap = Object.fromEntries((projects.data ?? []).map(p => [p.id, p.name]));

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
    };
    load();
  }, [user, weekOffset]);

  if (loading) return <div className="flex h-64 items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;

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
          { label: 'Completed', value: stats.completedTasks, icon: CheckSquare, color: 'text-success' },
          { label: 'New Tasks', value: stats.newTasks, icon: Plus, color: 'text-primary' },
          { label: 'Overdue', value: stats.overdueCarried, icon: AlertTriangle, color: 'text-destructive' },
          { label: 'Links Saved', value: stats.linksSaved, icon: Link2, color: 'text-warning' },
          { label: 'Meetings', value: stats.meetingsHeld, icon: Calendar, color: 'text-primary' },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="p-4 text-center">
              <Icon className={`h-5 w-5 mx-auto mb-1 ${color}`} />
              <p className="text-2xl font-semibold text-foreground">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Projects touched */}
      {stats.projectsTouched.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm"><TrendingUp className="h-4 w-4 text-primary" />Projects Touched</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2 flex-wrap">
            {stats.projectsTouched.map(p => <Badge key={p} variant="secondary">{p}</Badge>)}
          </CardContent>
        </Card>
      )}

      {/* Next week */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Next Week</CardTitle>
        </CardHeader>
        <CardContent>
          {nextWeekTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tasks due next week</p>
          ) : (
            <div className="space-y-2">
              {nextWeekTasks.map((t, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
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
  );
}
