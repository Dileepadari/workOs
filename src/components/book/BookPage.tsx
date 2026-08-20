import { motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, ArrowRight, CalendarRange, Lock, Quote, TrendingUp } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { DayPageRow, WeekPageRow } from '@/hooks/useWorkData';

/** A leaf is either a day or the week's analysis bound in after it. */
export type BookLeaf =
  | ({ kind: 'day' } & DayPageRow)
  | ({ kind: 'week' } & WeekPageRow);

const duration = (mins: number) => {
  if (!mins) return '0m';
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
};

const METRIC_LABELS: Record<string, string> = {
  tasks_completed: 'Closed',
  tasks_created: 'Added',
  focus_minutes: 'Focused',
  focus_sessions: 'Blocks',
  meetings: 'Meetings',
  notes_written: 'Notes',
  milestones_hit: 'Milestones',
  projects_touched: 'Projects',
  interruptions: 'Interruptions',
  days_logged: 'Active days',
  overdue_carried: 'Carried over',
};

/**
 * One page of the book.
 *
 * Shared by the reader, the single-page route and the print view, so what you
 * read on screen is what gets printed - `variant` only changes the measure and
 * the chrome, never the content.
 */
export function BookPage({
  leaf, variant = 'full', printMode,
}: {
  leaf: BookLeaf;
  variant?: 'full' | 'book';
  printMode?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const book = variant === 'book';
  const still = reduceMotion || printMode || book;

  const isWeek = leaf.kind === 'week';
  const dateLabel = isWeek
    ? `Week of ${format(parseISO(leaf.week_start), 'd MMMM yyyy')}`
    : format(parseISO(leaf.date), 'EEEE, d MMMM yyyy');

  const metrics = Object.entries(leaf.metrics ?? {})
    .filter(([, v]) => v !== null && v !== undefined && v !== 0)
    .map(([k, v]) => ({
      label: METRIC_LABELS[k] ?? k.replace(/_/g, ' '),
      value: k === 'focus_minutes' ? duration(Number(v)) : String(v),
    }));

  const lists: { icon: typeof TrendingUp; title: string; items: string[] }[] = isWeek
    ? [
        { icon: TrendingUp, title: 'What went well', items: leaf.wins ?? [] },
        { icon: AlertCircle, title: 'What to watch', items: leaf.concerns ?? [] },
      ]
    : [
        { icon: TrendingUp, title: 'Highlights', items: leaf.highlights ?? [] },
        { icon: AlertCircle, title: 'Friction', items: leaf.friction ?? [] },
      ];

  return (
    <motion.article
      initial={still ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={cn(
        'page-surface mx-auto w-full max-w-3xl rounded-xl p-8 sm:p-12',
        // Inside the reader the leaf is already the paper, so the page drops
        // its own border and shadow rather than drawing a card on a card.
        book && 'max-w-none rounded-none border-0 bg-transparent p-7 shadow-none sm:p-9',
        printMode && 'print-page max-w-none rounded-none p-0',
      )}
    >
      <header className="page-rule pb-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs uppercase tracking-[0.2em] text-paper-foreground/50">{dateLabel}</p>
          {!printMode && (
            <div className="flex items-center gap-1.5">
              {isWeek && (
                <Badge variant="outline" className="gap-1 border-paper-edge text-[0.6rem] text-paper-foreground/60">
                  <CalendarRange className="h-2.5 w-2.5" /> Week
                </Badge>
              )}
              {leaf.sealed_at && (
                <Badge variant="outline" className="gap-1 border-paper-edge text-[0.6rem] text-paper-foreground/60">
                  <Lock className="h-2.5 w-2.5" /> Sealed
                </Badge>
              )}
            </div>
          )}
        </div>
        {leaf.title && (
          <h2 className={cn('font-display mt-2 font-semibold leading-tight', book ? 'text-2xl' : 'text-3xl sm:text-4xl')}>
            {leaf.title}
          </h2>
        )}
      </header>

      {leaf.summary && (
        <p className={cn('font-display mt-6 leading-relaxed text-paper-foreground/90', book ? 'text-base' : 'text-lg')}>
          {leaf.summary}
        </p>
      )}

      {metrics.length > 0 && (
        <dl className={cn('mt-8 grid grid-cols-2 gap-x-6 gap-y-4', book ? 'sm:grid-cols-2' : 'sm:grid-cols-4')}>
          {metrics.map((m) => (
            <div key={m.label}>
              <dt className="text-[0.65rem] uppercase tracking-wider text-paper-foreground/50">{m.label}</dt>
              <dd className={cn('font-display mt-0.5 font-semibold tabular-nums', book ? 'text-lg' : 'text-xl')}>
                {m.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <div className={cn('mt-8 grid gap-8', !book && 'sm:grid-cols-2')}>
        {lists.map((l) => l.items.length > 0 && (
          <Section key={l.title} icon={l.icon} title={l.title} items={l.items} />
        ))}
      </div>

      {isWeek && leaf.focus_next?.length > 0 && (
        <div className="mt-8 rounded-lg border border-paper-edge bg-paper-foreground/[0.035] p-5">
          <p className="text-[0.65rem] uppercase tracking-wider text-paper-foreground/50">Next week</p>
          <ul className="mt-2 space-y-1.5">
            {leaf.focus_next.map((f, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed">
                <ArrowRight className="mt-1 h-3 w-3 shrink-0 text-paper-foreground/40" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!isWeek && leaf.reflection && (
        <blockquote className="page-rule mt-8 border-l-2 border-paper-edge py-1 pl-5">
          <Quote className="mb-2 h-4 w-4 text-paper-foreground/35" />
          <p className="font-display whitespace-pre-wrap text-base italic leading-relaxed text-paper-foreground/80">
            {leaf.reflection}
          </p>
          <footer className="mt-2 text-xs text-paper-foreground/50">What you wrote that day</footer>
        </blockquote>
      )}
    </motion.article>
  );
}

function Section({ icon: Icon, title, items }: { icon: typeof TrendingUp; title: string; items: string[] }) {
  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-wider text-paper-foreground/60">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </h3>
      <ul className="space-y-2.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-paper-foreground/85">
            <span className="mt-[0.4rem] h-1 w-1 shrink-0 rounded-full bg-paper-foreground/40" />
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
