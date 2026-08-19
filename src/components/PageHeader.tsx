import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  /** One line saying what this screen is for, or what is on it right now. */
  subtitle?: string;
  /** The screen's primary action, and at most one or two secondary ones. */
  actions?: ReactNode;
}

/**
 * Every page starts the same way: the name of the thing, a line of context,
 * and the action you came here to take.
 *
 * The search box that used to live here is gone. It was a read-only decoy that
 * opened the ⌘K palette on click - the same palette reachable from anywhere,
 * including this page - so it occupied the most valuable strip of every screen
 * to duplicate a shortcut. Removing it is most of what made these pages feel
 * crowded before you had read a single word of content.
 */
export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
