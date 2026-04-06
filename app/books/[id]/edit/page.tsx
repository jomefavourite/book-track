"use client";

import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useUser } from "@clerk/nextjs";
import { useParams, useRouter } from "next/navigation";
import BookForm from "@/components/BookForm";
import Link from "next/link";

export default function EditBookPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const bookId = params.id as Id<"books">;
  
  const { data: book, isPending } = useQuery({
    ...convexQuery(api.books.getBook, { bookId, userId: user?.id }),
    enabled: isLoaded && !!user?.id,
  });

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 text-lg">Loading...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    router.push("/sign-in");
    return null;
  }

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 text-lg">Loading book...</div>
        </div>
      </div>
    );
  }

  if (!book || book === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 text-lg">Book not found</div>
          <Link
            href="/dashboard"
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            Go back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Check if user owns the book
  if (book.userId !== user.id) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 text-lg">You don't have permission to edit this book</div>
          <Link
            href="/dashboard"
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            Go back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return <BookForm book={book} />;
}

