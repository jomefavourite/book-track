import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors BookCard / ArchivedBookCard / PublicBookCard: badge + ⋯ row, title, meta line, progress. */
export default function BookCardSkeleton() {
  return (
    <Card className="flex flex-col p-4" aria-hidden="true">
      {/* Badge + actions menu */}
      <div className="mb-3 flex items-center justify-between">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-6 w-6 rounded-md" />
      </div>

      {/* Title, author, meta line */}
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="mt-2 h-4 w-1/3" />
      <Skeleton className="mb-4 mt-3 h-3 w-2/3" />

      {/* Progress */}
      <div className="mt-auto">
        <div className="mb-1.5 flex items-center justify-between">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-3 w-8" />
        </div>
        <Skeleton className="h-2 w-full rounded-full" />
      </div>
    </Card>
  );
}
