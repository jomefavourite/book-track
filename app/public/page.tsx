"use client";

import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";
import { SignInButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import PublicBookCard from "@/components/PublicBookCard";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import AuthButton from "@/components/AuthButton";

export default function PublicBooksPage() {
  const { data: books, isPending } = useQuery({
    ...convexQuery(api.books.getPublicBooks, {}),
    enabled: true,
  });

  const booksWithProgress = books || [];

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-bold text-foreground">
            Public Reading Tracker
          </h1>
          <p className="mt-2 text-muted-foreground">
            Discover how others are tracking their reading progress
          </p>
        </div>
        <div className="flex items-center gap-4">
          <AuthButton />
          <ThemeSwitcher />
        </div>
      </div>

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
          {booksWithProgress.map((book: any) => (
            <PublicBookCard
              key={book._id}
              book={book}
              progress={book.progress || 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}
