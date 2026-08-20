import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { addDays, format, parseISO, subDays } from 'date-fns';
import { BookOpen, Loader2, Printer, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/components/ui/sonner';
import { BookReader } from '@/components/book/BookReader';
import type { BookLeaf } from '@/components/book/BookPage';
import {
  useCreate, useDayPages, useFocusSessions, useLinks, useMeetings, useMilestones,
  useNotes, useProjects, useTasks, useUpdate, useWeekPages,
  type DayPageRow, type WeekPageRow,
} from '@/hooks/useWorkData';
import {
  buildDaySnapshot, buildWeekSnapshot, isoDate, weekStartOf, writeDayPage, writeWeekPage,
} from '@/lib/bookEngine';

/**
 * The book.
 *
 * Pages are generated from real rows on demand rather than written by hand,
 * and sealed once you have read them - a sealed page is what gets printed, so
 * it is not silently rewritten when the underlying tasks change later.
 */
export default function Book() {
  const { data: dayPages = [], isLoading } = useDayPages();
  const { data: weekPages = [] } = useWeekPages();
  const { data: tasks = [] } = useTasks();
  const { data: projects = [] } = useProjects();
  const { data: sessions = [] } = useFocusSessions();
  const { data: notes = [] } = useNotes();
  const { data: meetings = [] } = useMeetings();
  const { data: milestones = [] } = useMilestones();
  const { data: links = [] } = useLinks();

  const createDay = useCreate<DayPageRow>('day_pages');
  const updateDay = useUpdate<DayPageRow>('day_pages');
  const createWeek = useCreate<WeekPageRow>('week_pages');
  const updateWeek = useUpdate<WeekPageRow>('week_pages');

  const [index, setIndex] = useState(0);
  const [generating, setGenerating] = useState(false);

  const sourced = useMemo(() => ({
    tasks, projects, sessions,
    notes: notes as { id: string; created_at: string }[],
    meetings: meetings as { id: string; scheduled_at: string }[],
    milestones: milestones as { id: string; date: string; is_completed?: boolean }[],
    links: links as { id: string; created_at: string }[],
  }), [tasks, projects, sessions, notes, meetings, milestones, links]);

  // Days and weeks interleaved: Mon-Sun, then that week's analysis, so turning
  // through the book passes the review at the point it was written.
  const leaves: BookLeaf[] = useMemo(() => {
    const days: BookLeaf[] = [...dayPages]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({ kind: 'day' as const, ...d }));
    const weeks = [...weekPages].sort((a, b) => a.week_start.localeCompare(b.week_start));

    const out: BookLeaf[] = [];
    for (const d of days) {
      out.push(d);
      const wk = isoDate(weekStartOf(parseISO((d as DayPageRow & { kind: 'day' }).date)));
      const isSunday = parseISO((d as DayPageRow & { kind: 'day' }).date).getDay() === 0;
      const week = weeks.find((w) => w.week_start === wk);
      if (isSunday && week) out.push({ kind: 'week', ...week });
    }
    // Any week page whose Sunday has no day page still belongs in the book.
    for (const w of weeks) {
      if (!out.some((l) => l.kind === 'week' && l.id === w.id)) out.push({ kind: 'week', ...w });
    }
    return out;
  }, [dayPages, weekPages]);

  const generate = async (target: Date) => {
    setGenerating(true);
    try {
      const date = isoDate(target);
      const snap = buildDaySnapshot(target, sourced);
      const written = writeDayPage(snap);
      const existing = dayPages.find((p) => p.date === date);

      if (existing?.sealed_at) {
        toast.info('That page is sealed', { description: 'Sealed pages are part of the book and are not rewritten.' });
        return;
      }
      const payload = { ...written, date, metrics: snap.metrics, generated_by: 'builtin' };
      if (existing) await updateDay.mutateAsync({ id: existing.id, payload });
      else await createDay.mutateAsync(payload);
      toast.success(`Page written for ${format(target, 'd MMM')}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not write that page.');
    } finally {
      setGenerating(false);
    }
  };

  const generateWeek = async (anyDayInWeek: Date) => {
    setGenerating(true);
    try {
      const start = weekStartOf(anyDayInWeek);
      const snap = buildWeekSnapshot(start, sourced);
      const written = writeWeekPage(snap);
      const existing = weekPages.find((p) => p.week_start === snap.week_start);
      if (existing?.sealed_at) {
        toast.info('That review is sealed.');
        return;
      }
      const payload = { ...written, week_start: snap.week_start, metrics: snap.metrics, generated_by: 'builtin' };
      if (existing) await updateWeek.mutateAsync({ id: existing.id, payload });
      else await createWeek.mutateAsync(payload);
      toast.success(`Week of ${format(start, 'd MMM')} reviewed`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not write that review.');
    } finally {
      setGenerating(false);
    }
  };

  if (isLoading) {
    return <div className="py-20 text-center text-muted-foreground">Opening the book...</div>;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Your Book</h1>
          <p className="mt-1 text-muted-foreground">
            {leaves.length
              ? `${dayPages.length} ${dayPages.length === 1 ? 'day' : 'days'}, ${weekPages.length} weekly ${weekPages.length === 1 ? 'review' : 'reviews'}.`
              : 'One page a day, written from what you actually did.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => generate(subDays(new Date(), 1))} disabled={generating} className="gap-2">
            Yesterday
          </Button>
          <Button variant="outline" onClick={() => generateWeek(subDays(new Date(), 7))} disabled={generating} className="gap-2">
            Last week
          </Button>
          <Button onClick={() => generate(new Date())} disabled={generating} className="gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Close today
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <Link to="/book/print"><Printer className="h-4 w-4" /> Print</Link>
          </Button>
        </div>
      </header>

      {leaves.length === 0 ? (
        <Card className="book-wash">
          <CardContent className="flex flex-col items-center py-20 text-center">
            <BookOpen className="mb-4 h-10 w-10 text-muted-foreground" />
            <p className="font-display text-xl font-semibold">The book is empty</p>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Do some work, then close the day. Whatever you completed, focused on or wrote gets
              read back to you as a page.
            </p>
            <Button className="mt-6" onClick={() => generate(new Date())} disabled={generating}>
              Write today's page
            </Button>
          </CardContent>
        </Card>
      ) : (
        <BookReader pages={leaves} index={index} onIndexChange={setIndex} />
      )}
    </div>
  );
}

export { addDays };
