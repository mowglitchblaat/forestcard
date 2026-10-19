// Loading placeholders shaped like the views they stand for: the content then lands where the
// skeleton announced it, without a layout jump. A view already visited is in the query cache and
// shows no skeleton.

import { Skeleton } from '@/components/ui/skeleton';

const times = (n: number) => Array.from({ length: n }, (_, i) => i);

// The whole frame, while the session and the player load: sidebar, header, a page.
export function ShellSkeleton() {
  return (
    <div className="flex min-h-svh gap-4 p-2">
      <div className="hidden w-64 shrink-0 flex-col gap-3 p-2 md:flex">
        <Skeleton className="h-10 w-40" />
        {times(4).map((g) => (
          <div key={g} className="flex flex-col gap-2 pt-3">
            <Skeleton className="h-3 w-20" />
            {times(3).map((i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-4 rounded-xl p-4">
        <Skeleton className="h-8 w-48" />
        <PageSkeleton />
      </div>
    </div>
  );
}

// A generic page: a title and a few blocks.
export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        {times(3).map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

// The collection: title, stats band, toolbar, a grid of card-shaped tiles.
export function CollectionSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 md:grid-cols-3">
        {times(3).map((i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-56" />
        {times(4).map((i) => (
          <Skeleton key={i} className="h-9 w-32" />
        ))}
      </div>
      <div className="grid grid-tiles gap-3">
        {times(12).map((i) => (
          <Skeleton key={i} className="aspect-5/7 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

// A list of combats, with the form and the summary above.
export function CombatsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-20" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {times(4).map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
      <div className="flex flex-col gap-2 lg:w-1/2">
        {times(5).map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    </div>
  );
}

// A combat's story: lines grouped by turn.
export function ReplaySkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-6 w-56" />
      {times(4).map((t) => (
        <div key={t} className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-16" />
          {times(3).map((i) => (
            <Skeleton
              key={i}
              className="h-3.5 w-(--pct)"
              style={{ '--pct': `${60 + ((t + i) % 3) * 15}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// Cards in rows (opened boosters).
export function CardRowsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {times(2).map((r) => (
        <div key={r} className="flex flex-col gap-3">
          <Skeleton className="h-5 w-48" />
          <div className="grid grid-tiles-sm gap-3">
            {times(5).map((i) => (
              <Skeleton key={i} className="aspect-5/7 rounded-md" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Tables of results (history statistics).
export function StatsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {times(4).map((i) => (
        <Skeleton key={i} className="h-48" />
      ))}
    </div>
  );
}
