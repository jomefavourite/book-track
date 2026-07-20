"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import PublicBookCard from "@/components/PublicBookCard";

/** Fades content up once it scrolls into view. Pure CSS transition, IO-driven. */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      el.classList.add("is-visible");
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("is-visible");
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

/** Infinite horizontal scroller. Content is rendered twice for a seamless loop. */
export function Marquee({
  children,
  duration = 40,
  className = "",
}: {
  children: ReactNode;
  duration?: number;
  className?: string;
}) {
  const style = { "--marquee-duration": `${duration}s` } as CSSProperties;
  return (
    <div
      className={`overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)] ${className}`}
    >
      <div className="landing-marquee-track flex w-max" style={style}>
        <div className="flex shrink-0 items-center">{children}</div>
        <div className="flex shrink-0 items-center" aria-hidden="true">
          {children}
        </div>
      </div>
    </div>
  );
}

const AVATAR_SHADES = [
  "bg-foreground text-background",
  "bg-muted-foreground text-background",
  "bg-muted text-foreground",
  "bg-secondary text-secondary-foreground border border-border",
  "bg-foreground/80 text-background",
];

/** Overlapping initials avatars in grayscale shades. */
export function AvatarStack({
  people,
  size = "md",
  className = "",
}: {
  people: string[];
  size?: "sm" | "md";
  className?: string;
}) {
  const dims = size === "sm" ? "h-6 w-6 text-[9px]" : "h-8 w-8 text-[11px]";
  return (
    <div className={`flex -space-x-2 ${className}`}>
      {people.map((initials, i) => (
        <span
          key={`${initials}-${i}`}
          className={`${dims} ${AVATAR_SHADES[i % AVATAR_SHADES.length]} flex items-center justify-center rounded-full font-semibold ring-2 ring-background`}
        >
          {initials}
        </span>
      ))}
    </div>
  );
}

/** Real public books from Convex — shared social proof section. */
export function PublicBooksGrid({ limit = 6 }: { limit?: number }) {
  const { data: publicBooks, isPending } = useQuery({
    ...convexQuery(api.books.getPublicBooks, {}),
  });

  if (isPending) {
    return (
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-48 animate-pulse rounded-xl border border-border bg-muted/60"
          />
        ))}
      </div>
    );
  }

  if (!publicBooks || publicBooks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-12 text-center">
        <p className="text-lg text-muted-foreground">
          No public books yet. Be the first to share your reading journey!
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {publicBooks.slice(0, limit).map((book) => (
          <PublicBookCard
            key={book._id}
            book={book}
            progress={book.progress || 0}
          />
        ))}
      </div>
      <div className="mt-8 flex justify-center">
        <Button variant="outline" size="lg" asChild>
          <Link href="/public">View All Reading Journeys</Link>
        </Button>
      </div>
    </>
  );
}
