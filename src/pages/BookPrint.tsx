import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { parseISO } from 'date-fns';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BookPage, type BookLeaf } from '@/components/book/BookPage';
import { useDayPages, useWeekPages } from '@/hooks/useWorkData';
import { isoDate, weekStartOf } from '@/lib/bookEngine';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';

/**
 * The whole book, laid out for paper.
 *
 * Deliberately outside the app shell: no sidebar, no chrome, nothing that
 * would either print or have to be hidden. The browser's own PDF export is the
 * print engine; the stylesheet in index.css is the binding.
 */
export default function BookPrint() {
  const { data: dayPages = [], isLoading } = useDayPages();
  const { data: weekPages = [] } = useWeekPages();
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();

  const leaves: BookLeaf[] = useMemo(() => {
    const days = [...dayPages].sort((a, b) => a.date.localeCompare(b.date));
    const weeks = [...weekPages].sort((a, b) => a.week_start.localeCompare(b.week_start));
    const out: BookLeaf[] = [];
    for (const d of days) {
      out.push({ kind: 'day', ...d });
      const wk = isoDate(weekStartOf(parseISO(d.date)));
      if (parseISO(d.date).getDay() === 0) {
        const week = weeks.find((w) => w.week_start === wk);
        if (week) out.push({ kind: 'week', ...week });
      }
    }
    for (const w of weeks) {
      if (!out.some((l) => l.kind === 'week' && l.id === w.id)) out.push({ kind: 'week', ...w });
    }
    return out;
  }, [dayPages, weekPages]);

  const range = leaves.length
    ? `${dayPages[dayPages.length - 1]?.date ?? ''} to ${dayPages[0]?.date ?? ''}`
    : '';

  if (isLoading) return <div className="p-10 text-center text-muted-foreground">Setting the pages...</div>;

  return (
    <div className="min-h-screen bg-background">
      <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/95 px-5 py-3 backdrop-blur">
        <Button asChild variant="ghost" size="sm" className="gap-2">
          <Link to="/book"><ArrowLeft className="h-4 w-4" /> Back to the book</Link>
        </Button>
        <p className="text-sm text-muted-foreground">
          {leaves.length} {leaves.length === 1 ? 'page' : 'pages'}
        </p>
        <Button size="sm" className="gap-2" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print or save as PDF
        </Button>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-10">
        {/* Title page. A printed book that opens straight into Monday looks
            like a report; this is what makes it read as a volume. */}
        <section className="print-page flex min-h-[60vh] flex-col items-center justify-center text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Work journal</p>
          <h1 className="font-display mt-4 text-5xl font-semibold">{currentWorkspace?.name ?? 'WorkOS'}</h1>
          <p className="mt-3 text-muted-foreground">{user?.username}</p>
          {range && <p className="mt-1 text-sm text-muted-foreground">{range}</p>}
        </section>

        {leaves.length === 0 ? (
          <p className="py-20 text-center text-muted-foreground">
            There is nothing to print yet. Close a day first.
          </p>
        ) : (
          <div className="space-y-10">
            {leaves.map((leaf) => (
              <BookPage key={`${leaf.kind}-${leaf.id}`} leaf={leaf} printMode />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
