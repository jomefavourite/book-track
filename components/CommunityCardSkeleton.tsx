import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the compact community card: brand strip, logo + name + meta line, description, buttons. */
export default function CommunityCardSkeleton() {
  return (
    <Card className="flex h-full flex-col overflow-hidden" aria-hidden="true">
      <Skeleton className="h-1.5 w-full rounded-none" />
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-3/5" />
        </div>
        <div className="mt-auto flex gap-2 pt-4">
          <Skeleton className="h-9 flex-1 rounded-md" />
          <Skeleton className="h-9 flex-1 rounded-md" />
        </div>
      </div>
    </Card>
  );
}

export function CommunityCardSkeletonGrid({
  count = 2,
  className = "grid grid-cols-1 gap-4 md:grid-cols-2",
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, index) => (
        <CommunityCardSkeleton key={index} />
      ))}
    </div>
  );
}

/**
 * Form-page loading state matching the current form layout: back link and
 * title above, fields inside a card, full-width save button at the bottom.
 */
export function FormPageSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div aria-hidden="true">
      <Skeleton className="mb-4 h-4 w-28" />
      <div className="mb-5 space-y-2 sm:mb-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <Card className="space-y-6 p-4 sm:p-6">
        {Array.from({ length: fields }).map((_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
        ))}
        <Skeleton className="h-10 w-full rounded-md" />
      </Card>
    </div>
  );
}

/** Generic detail-page loading state: a header banner plus content blocks. */
export function DetailPageSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <Card className="space-y-4 p-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-16 w-16 shrink-0 rounded-lg" />
          <Skeleton className="h-6 w-24 rounded-md" />
        </div>
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-4 w-3/4" />
      </Card>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="space-y-4 p-6 lg:col-span-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-32 w-full rounded-md" />
        </Card>
        <Card className="space-y-3 p-6">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-3/5" />
        </Card>
      </div>
    </div>
  );
}

/** Generic block of stacked text lines for simple loading states. */
export function TextLinesSkeleton({
  lines = 3,
  className = "space-y-3",
}: {
  lines?: number;
  className?: string;
}) {
  const widths = ["w-3/4", "w-2/3", "w-5/6", "w-1/2", "w-4/5"];
  return (
    <div className={className} aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className={`h-4 ${widths[index % widths.length]}`}
        />
      ))}
    </div>
  );
}

/** Shared hero shape: banner, overlapping avatar/logo, name, chips, stats strip. */
function HeroSkeleton({
  avatarClassName,
  stats,
  actions,
}: {
  avatarClassName: string;
  stats: number;
  actions: number;
}) {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="h-20 w-full rounded-none sm:h-24" />
      <div className="px-4 pb-4 sm:px-6">
        <div className="-mt-10 flex items-end justify-between gap-3">
          <Skeleton className={`shrink-0 ring-4 ring-card ${avatarClassName}`} />
          <div className="flex gap-2 pb-1">
            {Array.from({ length: actions }).map((_, index) => (
              <Skeleton
                key={index}
                className={`h-9 rounded-full ${index === 0 ? "w-24" : "w-9"}`}
              />
            ))}
          </div>
        </div>
        <Skeleton className="mt-4 h-7 w-48" />
        <Skeleton className="mt-2 h-4 w-2/3 max-w-sm" />
        <div className="mt-3 flex flex-wrap gap-2">
          <Skeleton className="h-6 w-28 rounded-full" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
      </div>
      <div
        className="grid divide-x divide-border border-t border-border"
        style={{ gridTemplateColumns: `repeat(${stats}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: stats }).map((_, index) => (
          <div key={index} className="flex flex-col items-center gap-1.5 py-3">
            <Skeleton className="h-5 w-10" />
            <Skeleton className="h-3 w-14" />
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Day-card grid used by the schedule (DaysView) while sessions load. */
export function DayCardsSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
      aria-hidden="true"
    >
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="rounded-lg border border-border p-3">
          <div className="mb-3 flex items-start justify-between">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-14" />
              <Skeleton className="h-3 w-20" />
            </div>
            <div className="flex gap-1">
              <Skeleton className="h-7 w-7 rounded-md" />
              <Skeleton className="h-7 w-7 rounded-md" />
            </div>
          </div>
          <Skeleton className="mb-2 h-10 w-full rounded-md" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

/** Book page: back link, title, fact chips, progress stats, switcher, day cards. */
export function BookDetailSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-4 w-20" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-9 rounded-md" />
          <Skeleton className="h-9 w-9 rounded-md" />
        </div>
      </div>
      <Skeleton className="h-8 w-1/2 max-w-xs" />
      <Skeleton className="mt-2 h-4 w-32" />
      <div className="mt-3 flex flex-wrap gap-2">
        <Skeleton className="h-7 w-24 rounded-full" />
        <Skeleton className="h-7 w-28 rounded-full" />
        <Skeleton className="h-7 w-40 rounded-full" />
      </div>
      <Card className="mt-4 grid grid-cols-2 gap-4 p-4 sm:grid-cols-4 sm:p-5">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-20" />
          </div>
        ))}
      </Card>
      <Skeleton className="mb-3 mt-6 h-10 w-60 rounded-full" />
      <Card className="p-4 sm:p-5">
        <div className="mb-2 flex items-center justify-between">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="mb-4 h-2 w-full rounded-full" />
        <DayCardsSkeleton count={4} />
      </Card>
    </div>
  );
}

/** Profile: hero with stats, tab bar, activity heatmap, two overview cards. */
export function ProfileSkeleton() {
  return (
    <div aria-hidden="true">
      <HeroSkeleton avatarClassName="h-20 w-20 rounded-full sm:h-24 sm:w-24" stats={4} actions={2} />
      <div className="mt-4 flex gap-4 border-b border-border pb-3 sm:mt-6">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-12" />
      </div>
      <Skeleton className="mt-6 h-6 w-40" />
      <Skeleton className="mt-2 h-4 w-56" />
      <Card className="mt-3 p-4 sm:p-5">
        <Skeleton className="h-28 w-full rounded-md" />
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-32" />
        </div>
      </Card>
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <Card key={index} className="space-y-3 p-4 sm:p-5">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-10 w-full rounded-md" />
          </Card>
        ))}
      </div>
    </div>
  );
}

/** Community books area: featured current read + library grid. */
export function CommunityBooksSkeleton() {
  return (
    <div className="space-y-5 sm:space-y-6" aria-hidden="true">
      <div>
        <Skeleton className="mb-3 h-6 w-32" />
        <Card className="flex gap-4 p-4 sm:gap-5 sm:p-5">
          <Skeleton className="h-36 w-24 shrink-0 rounded-md sm:h-44 sm:w-[7.5rem]" />
          <div className="flex min-w-0 flex-1 flex-col">
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="mt-3 h-6 w-2/3" />
            <Skeleton className="mt-2 h-4 w-1/2" />
            <Skeleton className="mt-2 h-3 w-32" />
            <Skeleton className="mt-4 h-1.5 w-full max-w-sm rounded-full" />
            <div className="mt-auto flex gap-2 pt-3">
              <Skeleton className="h-9 w-24 rounded-md" />
              <Skeleton className="h-9 w-28 rounded-md" />
            </div>
          </div>
        </Card>
      </div>
      <div>
        <div className="mb-3 flex items-center justify-between">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-8 w-40 rounded-full" />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Card key={index} className="flex gap-3 p-3">
              <Skeleton className="h-20 w-14 shrink-0 rounded-md" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Community page: branded hero + books area. */
export function CommunityDetailSkeleton() {
  return (
    <div className="space-y-5 sm:space-y-6" aria-hidden="true">
      <HeroSkeleton avatarClassName="h-[72px] w-[72px] rounded-xl sm:h-20 sm:w-20" stats={3} actions={3} />
      <CommunityBooksSkeleton />
    </div>
  );
}
