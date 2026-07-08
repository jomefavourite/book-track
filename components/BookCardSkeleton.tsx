import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function BookCardSkeleton() {
  return (
    <Card className="relative p-3 sm:p-4" aria-hidden="true">
      {/* Badge + action icons (top-right of the real card) */}
      <div className="absolute right-1.5 top-1.5 flex items-center gap-1 sm:right-2 sm:top-2 sm:gap-2">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-8 w-8 rounded-md" />
      </div>

      <div className="flex h-full flex-col justify-between pt-5">
        <div>
          {/* Title */}
          <Skeleton className="mb-3 h-6 w-3/4" />
          {/* Author / pages / dates */}
          <div className="mb-3 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>

        {/* Progress */}
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-8" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
      </div>
    </Card>
  );
}
