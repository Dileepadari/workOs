import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

// Building blocks reused by the per-page skeletons in this folder. Keep
// these generic (no page-specific spacing/columns) - page skeletons compose
// them inside their own grid so the loading state roughly matches the real
// layout instead of a single centered spinner.

export function StatTileSkeleton() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:p-5">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-10" />
          <Skeleton className="h-3 w-16" />
        </div>
      </CardContent>
    </Card>
  );
}

export function StatTileGridSkeleton({ count = 5, className = '' }: { count?: number; className?: string }) {
  return (
    <div className={`grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 ${className}`}>
      {Array.from({ length: count }).map((_, i) => <StatTileSkeleton key={i} />)}
    </div>
  );
}

export function CardTileSkeleton() {
  return (
    <Card className="overflow-hidden">
      <div className="h-1 w-full bg-muted" />
      <CardContent className="space-y-3 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-12 rounded-full" />
        </div>
        <Skeleton className="h-1.5 w-full rounded-full" />
        <Skeleton className="h-3 w-1/3" />
      </CardContent>
    </Card>
  );
}

export function CardGridSkeleton({ count = 6, className = '' }: { count?: number; className?: string }) {
  return (
    <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${className}`}>
      {Array.from({ length: count }).map((_, i) => <CardTileSkeleton key={i} />)}
    </div>
  );
}

export function ListRowSkeleton({ withBadge = true }: { withBadge?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5">
      <Skeleton className="h-4 w-4 shrink-0 rounded-sm" />
      <Skeleton className="h-4 flex-1 max-w-xs" />
      {withBadge && <Skeleton className="ml-auto h-4 w-14 shrink-0 rounded-full" />}
    </div>
  );
}

export function ListSkeleton({ count = 5, withBadge = true, className = '' }: { count?: number; withBadge?: boolean; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: count }).map((_, i) => <ListRowSkeleton key={i} withBadge={withBadge} />)}
    </div>
  );
}

export function PanelSkeleton({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <Card className={className}>
      <CardContent className="space-y-3 p-4 sm:p-6">
        <Skeleton className="h-4 w-1/3" />
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className="h-3" style={{ width: `${85 - i * 12}%` }} />
        ))}
      </CardContent>
    </Card>
  );
}
