"use client";

import type { ReadingProgressSummary } from "@/lib/readingProgressSummary";

type BannerProps = Pick<
  ReadingProgressSummary,
  "showStatusBanner" | "isAhead" | "isBehind" | "pagesDifference"
>;

/**
 * Renders at most one schedule status message (ahead / behind / on track).
 * Mutually exclusive branches prevent duplicate banners.
 */
export default function ReadingProgressStatusBanner({
  showStatusBanner,
  isAhead,
  isBehind,
  pagesDifference,
}: BannerProps) {
  if (!showStatusBanner) {
    return null;
  }

  if (isAhead && pagesDifference > 0) {
    return (
      <div className="mt-2 rounded-md bg-green-100 p-2 text-sm text-green-800 dark:bg-green-900 dark:text-green-200">
        🎉 You&apos;re {pagesDifference} page
        {pagesDifference !== 1 ? "s" : ""} ahead of schedule!
      </div>
    );
  }

  if (isBehind && pagesDifference > 0) {
    return (
      <div className="mt-2 rounded-md bg-amber-100 p-2 text-sm text-amber-800 dark:bg-amber-900 dark:text-amber-200">
        ⚠️ You&apos;re {pagesDifference} page
        {pagesDifference !== 1 ? "s" : ""} behind schedule. Keep going!
      </div>
    );
  }

  if (!isAhead && !isBehind) {
    return (
      <div className="mt-2 rounded-md bg-blue-100 p-2 text-sm text-blue-800 dark:bg-blue-900 dark:text-blue-200">
        ✓ You&apos;re right on track!
      </div>
    );
  }

  return null;
}
