/**
 * Shared helpers for book tags (topics like "Finance", "Relationships").
 *
 * Pure TypeScript — no React or browser APIs — so it can be imported from both
 * client components and Convex functions.
 */

/** Curated topics offered as one-tap chips in the tag picker. */
export const PRESET_TAGS = [
  "Finance",
  "Business",
  "Self-help",
  "Productivity",
  "Relationships",
  "Psychology",
  "Health",
  "Spirituality",
  "Biography",
  "History",
  "Science",
  "Technology",
  "Fiction",
  "Parenting",
] as const;

/** Max characters kept per tag. */
export const MAX_TAG_LENGTH = 30;
/** Max number of tags stored on a single book. */
export const MAX_TAGS_PER_BOOK = 10;

/**
 * Normalizes a tag for grouping/counting so "finance" and "Finance" collapse
 * into a single group. Display uses the first-seen casing instead.
 */
export function normalizeTagKey(tag: string): string {
  return tag.trim().toLowerCase();
}

/**
 * Cleans a raw list of tags: trims each, drops empties, caps length,
 * de-dupes case-insensitively (keeping first-seen casing), and caps the count.
 * Applied on the client before submit and again server-side in the mutations.
 */
export function sanitizeTags(input: readonly string[] | undefined): string[] {
  if (!input) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim().slice(0, MAX_TAG_LENGTH);
    if (!trimmed) continue;
    const key = normalizeTagKey(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
    if (result.length >= MAX_TAGS_PER_BOOK) break;
  }
  return result;
}
