import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function CommunityCardSkeleton() {
  return (
    <Card className="flex h-full flex-col p-4" aria-hidden="true">
      <div className="flex items-center gap-3">
        <Skeleton className="h-14 w-14 shrink-0 rounded-lg" />
        <Skeleton className="h-6 w-1/2" />
      </div>
      <Skeleton className="mt-3 h-4 w-3/4" />

      <div className="mt-3 space-y-2">
        <Skeleton className="h-6 w-20 rounded-md" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-32" />
      </div>

      <div className="mt-auto pt-4">
        <Skeleton className="h-9 w-full rounded-md" />
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

/** Generic form-page loading state: header + a stack of labeled fields. */
export function FormPageSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <Card className="space-y-6 p-6" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <div className="space-y-5">
        {Array.from({ length: fields }).map((_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
        ))}
      </div>
      <Skeleton className="h-10 w-36 rounded-md" />
    </Card>
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
