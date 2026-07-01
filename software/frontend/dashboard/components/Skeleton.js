const shimmer =
  "bg-gradient-to-r from-border-muted/40 via-surface-muted to-border-muted/40 bg-[length:200%_100%] animate-shimmer";

function Skeleton({ className }) {
  return <div className={`${shimmer} rounded ${className}`} />;
}

export function MetricCardSkeleton() {
  return (
    <article className="rounded-xl bg-surface-card p-5 shadow-sm ring-1 ring-border-default">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-[18px] w-[18px] rounded" />
      </div>
      <Skeleton className="mt-2 h-9 w-20 md:h-10 md:w-24" />
    </article>
  );
}

export function ListCardSkeleton() {
  return (
    <div className="rounded-lg border border-border-default p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
          <div className="grid gap-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
        <Skeleton className="mt-0.5 h-5 w-14 shrink-0 rounded-full" />
      </div>
      <div className="mt-3 grid gap-1.5">
        <Skeleton className="h-3 w-56" />
        <Skeleton className="h-3 w-40" />
      </div>
    </div>
  );
}

export function StatBoxSkeleton() {
  return (
    <div className="rounded-lg bg-brand-50 p-4">
      <Skeleton className="mx-auto h-3 w-20" />
      <Skeleton className="mx-auto mt-2 h-7 w-12" />
    </div>
  );
}

export function InfoPanelSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 text-sm max-sm:grid-cols-1">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i}>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-1.5 h-4 w-32" />
        </div>
      ))}
    </div>
  );
}

export function MapSkeleton() {
  return (
    <div className="flex h-[500px] items-center justify-center overflow-hidden rounded-xl bg-surface-card ring-1 ring-border-default max-sm:h-[300px]">
      <div className="flex flex-col items-center gap-3">
        <div className={`${shimmer} h-16 w-16 rounded-full`} />
        <div className={`${shimmer} h-3 w-28 rounded`} />
        <div className={`${shimmer} h-2 w-20 rounded`} />
      </div>
    </div>
  );
}
