"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useUser, SignInButton } from "@clerk/nextjs";
import { useMutation } from "@tanstack/react-query";
import { useConvexMutation } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function CommunityBookDetailPageClient() {
  const params = useParams<{ slug: string; bookId: string }>();
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const slug = params.slug;
  const communityBookId = params.bookId as Id<"communityBooks">;
  const [error, setError] = useState<string | null>(null);
  const hasStarted = useRef(false);

  const trackCommunityBookMutFn = useConvexMutation(
    api.communities.trackCommunityBook
  );
  const { mutateAsync: trackBook } = useMutation({
    mutationFn: trackCommunityBookMutFn,
  });

  useEffect(() => {
    if (!isLoaded || !user || hasStarted.current) return;
    hasStarted.current = true;

    trackBook({ communityBookId })
      .then((bookId) => {
        router.replace(`/books/${bookId}`);
      })
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : "Something went wrong";
        setError(message);
      });
  }, [isLoaded, user, communityBookId, router, trackBook]);

  if (!isLoaded) {
    return (
      <>
        <Navigation />
        <main className="mx-auto max-w-3xl p-3 sm:p-6">
          <Spinner />
        </main>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <Navigation />
        <main className="mx-auto max-w-3xl p-3 sm:p-6">
          <BackLink slug={slug} />
          <Card className="p-6 text-center sm:p-10">
            <p className="text-sm text-muted-foreground">
              Sign in to track your reading for this community book.
            </p>
            <SignInButton mode="modal">
              <Button className="mt-4">Sign in</Button>
            </SignInButton>
          </Card>
        </main>
      </>
    );
  }

  if (error) {
    const isMemberError = error.toLowerCase().includes("member");
    return (
      <>
        <Navigation />
        <main className="mx-auto max-w-3xl p-3 sm:p-6">
          <BackLink slug={slug} />
          <Card className="p-6 text-center sm:p-10">
            <p className="text-sm text-muted-foreground">
              {isMemberError
                ? "You need to be a member of this community to track this book."
                : "This book could not be opened. It may have been removed."}
            </p>
            <Button asChild variant="outline" className="mt-4">
              <Link href={`/communities/${slug}`}>Back to community</Link>
            </Button>
          </Card>
        </main>
      </>
    );
  }

  return (
    <>
      <Navigation />
      <main className="mx-auto max-w-3xl p-3 sm:p-6">
        <Spinner />
      </main>
    </>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function BackLink({ slug }: { slug: string }) {
  return (
    <Button variant="ghost" asChild className="mb-4 px-0">
      <Link href={`/communities/${slug}`}>
        <ArrowLeft className="h-4 w-4" />
        Community
      </Link>
    </Button>
  );
}
