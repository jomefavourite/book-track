"use client";

import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";
import { SignInButton } from "@clerk/nextjs";
import {
  BookOpen,
  CheckCircle2,
  BookMarked,
  FileText,
  Library,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import PublicBookCard from "@/components/PublicBookCard";
import Navigation from "@/components/Navigation";

export default function PublicBooksPage() {
  const { data: books, isPending } = useQuery({
    ...convexQuery(api.books.getPublicBooks, {}),
    enabled: true,
  });

  const { data: stats, isPending: statsPending } = useQuery({
    ...convexQuery(api.books.getPublicBooksStats, {}),
    enabled: true,
  });

  const booksWithProgress = books || [];

  return (
    <>
      <Navigation />
      <div className="mx-auto max-w-6xl p-6">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground">
            Public Reading Tracker
          </h1>
          <p className="mt-2 text-muted-foreground">
            Discover how others are tracking their reading progress
          </p>
        </div>

        {stats && stats.totalBooks > 0 && (
          <div className="mb-8">
            <h2 className="mb-4 text-lg font-semibold text-foreground">
              Community stats
            </h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <Card className="flex flex-col items-center gap-2 p-4 text-center">
                <div className="rounded-full bg-primary/10 p-2">
                  <BookOpen className="h-5 w-5 text-primary" />
                </div>
                <span className="text-2xl font-bold tabular-nums text-foreground">
                  {statsPending ? "—" : stats.totalBooks}
                </span>
                <span className="text-xs text-muted-foreground">
                  {stats.totalBooks === 1 ? "Public book" : "Public books"}
                </span>
              </Card>
              <Card className="flex flex-col items-center gap-2 p-4 text-center">
                <div className="rounded-full bg-green-500/10 p-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <span className="text-2xl font-bold tabular-nums text-foreground">
                  {statsPending ? "—" : stats.completed}
                </span>
                <span className="text-xs text-muted-foreground">Completed</span>
              </Card>
              <Card className="flex flex-col items-center gap-2 p-4 text-center">
                <div className="rounded-full bg-amber-500/10 p-2">
                  <BookMarked className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <span className="text-2xl font-bold tabular-nums text-foreground">
                  {statsPending ? "—" : stats.inProgress}
                </span>
                <span className="text-xs text-muted-foreground">
                  In progress
                </span>
              </Card>
              <Card className="flex flex-col items-center gap-2 p-4 text-center">
                <div className="rounded-full bg-muted p-2">
                  <Library className="h-5 w-5 text-muted-foreground" />
                </div>
                <span className="text-2xl font-bold tabular-nums text-foreground">
                  {statsPending ? "—" : stats.notStarted}
                </span>
                <span className="text-xs text-muted-foreground">
                  Not started
                </span>
              </Card>
              {stats.totalPagesRead > 0 && (
                <Card className="flex flex-col items-center gap-2 p-4 text-center">
                  <div className="rounded-full bg-blue-500/10 p-2">
                    <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="text-2xl font-bold tabular-nums text-foreground">
                    {statsPending ? "—" : stats.totalPagesRead.toLocaleString()}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Pages read
                  </span>
                </Card>
              )}
            </div>
          </div>
        )}

        {isPending ? (
          <div className="flex min-h-[400px] items-center justify-center">
            <div className="text-lg text-muted-foreground">
              Loading public books...
            </div>
          </div>
        ) : booksWithProgress.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="mb-4 text-lg text-muted-foreground">
              No public books yet. Be the first to share your reading journey!
            </p>
            <SignInButton mode="modal">
              <Button variant="default">Sign In to Create a Book</Button>
            </SignInButton>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {booksWithProgress.map((book) => (
              <PublicBookCard
                key={book._id}
                book={book}
                progress={book.progress || 0}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
