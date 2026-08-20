import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { StatTileGridSkeleton, CardGridSkeleton, ListSkeleton, PanelSkeleton } from './primitives';

// One skeleton per page, each roughly mirroring that page's real layout so
// the loading state doesn't feel like a different, jarring screen. These
// replace the old "spinner in the middle of an empty page" loading states.

export function DashboardSkeleton() {
  return (
    <div className="animate-fade-in space-y-4 sm:space-y-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-11 w-full rounded-md" />
      <StatTileGridSkeleton count={5} />
      <div>
        <Skeleton className="mb-4 h-5 w-24" />
        <CardGridSkeleton count={4} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
        <PanelSkeleton lines={4} />
        <PanelSkeleton lines={4} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
        <PanelSkeleton lines={3} />
        <PanelSkeleton lines={3} />
      </div>
    </div>
  );
}

export function ProjectsSkeleton() {
  return (
    <div className="animate-fade-in space-y-6">
      <Skeleton className="h-8 w-32" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-9 flex-1 rounded-md" />
        <Skeleton className="h-9 w-32 rounded-md" />
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
      <CardGridSkeleton count={6} />
    </div>
  );
}

export function ProjectDetailSkeleton() {
  return (
    <div className="animate-fade-in space-y-4 sm:space-y-6">
      <div className="overflow-hidden rounded-xl border border-border">
        <Skeleton className="h-1.5 w-full rounded-none" />
        <div className="space-y-3 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-md" />
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="ml-11 h-4 w-2/3" />
        </div>
      </div>
      <div className="flex gap-1 border-b border-border pb-2">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-7 w-20 rounded-md" />)}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <PanelSkeleton lines={2} />
          <PanelSkeleton lines={1} />
          <PanelSkeleton lines={3} />
        </div>
        <div className="space-y-4">
          <StatTileGridSkeleton count={4} className="!grid-cols-2 md:!grid-cols-2 lg:!grid-cols-2" />
          <PanelSkeleton lines={2} />
        </div>
      </div>
    </div>
  );
}

export function TasksSkeleton() {
  return (
    <div className="animate-fade-in space-y-4">
      <Skeleton className="h-8 w-24" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-28 rounded-md" />)}
      </div>
      <Skeleton className="h-4 w-16" />
      <ListSkeleton count={6} />
    </div>
  );
}

export function NotesSkeleton() {
  return (
    <div className="animate-fade-in space-y-6">
      <Skeleton className="h-8 w-24" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>
      <CardGridSkeleton count={8} />
    </div>
  );
}

export function ResourcesSkeleton() {
  return (
    <div className="animate-fade-in space-y-6">
      <Skeleton className="h-8 w-32" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>
      <Skeleton className="h-10 w-full rounded-md" />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-8 w-20 rounded-md" />)}
      </div>
      <CardGridSkeleton count={6} />
    </div>
  );
}





/** A handful of avatar+name rows - for the Members card only, TeamPage's stats/invite form already render. */
export function MemberListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border border-border p-3">
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-20" /></div>
          <Skeleton className="h-5 w-14 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}



export function TeamSkeleton() {
  return (
    <div className="animate-fade-in space-y-6">
      <Skeleton className="h-8 w-20" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}><CardContent className="flex items-center gap-3 p-4">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <div className="space-y-1.5"><Skeleton className="h-5 w-8" /><Skeleton className="h-3 w-16" /></div>
          </CardContent></Card>
        ))}
      </div>
      <PanelSkeleton lines={1} />
      <Card>
        <CardContent className="space-y-3 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              <div className="flex-1 space-y-1.5"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-20" /></div>
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export function CalendarSkeleton() {
  return (
    <div className="animate-fade-in space-y-6">
      <Skeleton className="h-8 w-28" />
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 rounded-md" />
          <Skeleton className="h-9 w-24 rounded-md" />
          <Skeleton className="h-9 w-20 rounded-md" />
        </div>
        <Skeleton className="h-9 w-40 rounded-md" />
      </div>
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 35 }).map((_, i) => <Skeleton key={i} className="aspect-square w-full rounded-md" />)}
      </div>
    </div>
  );
}

export function TagManagerSkeleton() {
  return (
    <div className="animate-fade-in space-y-6">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-4 w-40" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="flex items-center gap-4 p-4">
              <Skeleton className="h-4 w-4 rounded-sm" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-5 w-14 rounded-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function FocusModeSkeleton() {
  return (
    <div className="animate-fade-in space-y-6">
      <Skeleton className="h-8 w-32" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="flex flex-col items-center gap-8 py-12">
            <Skeleton className="h-10 w-full max-w-md rounded-md" />
            <Skeleton className="h-60 w-60 rounded-full" />
            <Skeleton className="h-14 w-14 rounded-full" />
          </CardContent>
        </Card>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-24 rounded-lg" />
            <Skeleton className="h-24 rounded-lg" />
          </div>
          <PanelSkeleton lines={4} />
        </div>
      </div>
    </div>
  );
}

export function AuthSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-5 rounded-xl border border-border p-6 sm:p-8">
        <Skeleton className="mx-auto h-14 w-14 rounded-xl" />
        <Skeleton className="mx-auto h-6 w-32" />
        <Skeleton className="mx-auto h-4 w-40" />
        <div className="space-y-2 pt-2"><Skeleton className="h-4 w-16" /><Skeleton className="h-10 w-full rounded-md" /></div>
        <div className="space-y-2"><Skeleton className="h-4 w-16" /><Skeleton className="h-10 w-full rounded-md" /></div>
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
    </div>
  );
}

export function SettingsSkeleton() {
  return (
    <div className="animate-fade-in space-y-8">
      <Skeleton className="h-8 w-24" />
      <div className="space-y-4">
        <Skeleton className="h-3 w-16" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <PanelSkeleton lines={2} />
          <PanelSkeleton lines={2} />
        </div>
      </div>
      <div className="space-y-4">
        <Skeleton className="h-3 w-20" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <PanelSkeleton lines={2} />
          <PanelSkeleton lines={2} />
        </div>
      </div>
    </div>
  );
}
