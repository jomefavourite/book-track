import type { Metadata } from "next";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export const SITE_NAME = "BookTrackr";
export const DEFAULT_DESCRIPTION =
  "Track your reading progress, plan your schedule, and share your reading journey.";
export const DEFAULT_OG_IMAGE = "/og-image.png";
export const DEFAULT_OG_IMAGE_WIDTH = 1200;
export const DEFAULT_OG_IMAGE_HEIGHT = 630;
export const DEFAULT_OG_IMAGE_ALT =
  "BookTrackr reading progress tracker preview";
// Canonical host. The production site is served on the www subdomain (the apex
// permanently redirects to it), so canonical tags, the sitemap, and JSON-LD must
// all point at www to avoid split ranking signals. Override with NEXT_PUBLIC_APP_URL.
const DEFAULT_SITE_URL = "https://www.booktrackr.app";

export function getSiteUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configuredUrl) {
    return configuredUrl.replace(/\/+$/, "");
  }
  return DEFAULT_SITE_URL;
}

export function getMetadataBase(): URL {
  return new URL(getSiteUrl());
}

export function absoluteUrl(path: string): string {
  return new URL(path, getMetadataBase()).toString();
}

type MetadataInput = {
  title: string;
  description: string;
  path: string;
  image?: string | null;
  noIndex?: boolean;
  openGraphType?: "website" | "article" | "book" | "profile";
  // When true, bypass the root layout's `%s | BookTrackr` template and use
  // `title` verbatim. Used for the homepage, whose title already carries the
  // brand ("BookTrackr — Track Your Reading Journey").
  absoluteTitle?: boolean;
};

export function createPageMetadata({
  title,
  description,
  path,
  image,
  noIndex = false,
  openGraphType = "website",
  absoluteTitle = false,
}: MetadataInput): Metadata {
  const resolvedImage = image ?? absoluteUrl(DEFAULT_OG_IMAGE);
  const resolvedImageMetadata = resolvedImage
    ? [
        {
          url: resolvedImage,
          width: DEFAULT_OG_IMAGE_WIDTH,
          height: DEFAULT_OG_IMAGE_HEIGHT,
          alt: DEFAULT_OG_IMAGE_ALT,
        },
      ]
    : undefined;

  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: {
      canonical: path,
    },
    robots: noIndex
      ? {
          index: false,
          follow: false,
        }
      : undefined,
    openGraph: {
      title,
      description,
      url: path,
      siteName: SITE_NAME,
      type: openGraphType,
      images: resolvedImageMetadata,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: resolvedImage
        ? [
            {
              url: resolvedImage,
              alt: DEFAULT_OG_IMAGE_ALT,
            },
          ]
        : undefined,
    },
  };
}

function getConvexClient(): ConvexHttpClient | null {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (!convexUrl) {
    return null;
  }
  return new ConvexHttpClient(convexUrl);
}

type ProfileBook = {
  totalPages?: number;
  progress?: number;
  startDate: string;
  progressStyle?: "pages" | "chapters";
  ignorePages?: boolean;
};

export async function getProfileMetadataBySlugOrId(slugOrId: string) {
  const client = getConvexClient();
  if (!client || !slugOrId) {
    return null;
  }

  try {
    const user = await client.query(api.users.getUserBySlugOrId, { slugOrId });
    if (!user) {
      return null;
    }

    const books = await client.query(api.books.getBooksForProfile, {
      profileUserId: user.clerkId,
    });

    const safeBooks = (books ?? []) as ProfileBook[];
    const totalBooks = safeBooks.length;
    const completed = safeBooks.filter((book) => (book.progress ?? 0) >= 100).length;
    const totalPagesRead = Math.round(
      safeBooks.reduce(
        (sum, book) =>
          book.progressStyle === "chapters" && book.ignorePages
            ? sum
            : sum + ((book.totalPages ?? 0) * (book.progress ?? 0)) / 100,
        0
      )
    );

    return {
      user,
      stats: {
        totalBooks,
        completed,
        totalPagesRead,
      },
    };
  } catch {
    return null;
  }
}

export async function getPublicBookMetadata(bookId: string) {
  const client = getConvexClient();
  if (!client || !bookId) {
    return null;
  }

  try {
    const book = await client.query(api.books.getPublicBook, {
      bookId: bookId as Id<"books">,
    });

    return book ?? null;
  } catch {
    return null;
  }
}

export async function getInviteMetadata(token: string) {
  const client = getConvexClient();
  if (!client || !token) {
    return null;
  }

  try {
    const invite = await client.query(api.communities.getInvitePreview, {
      token,
    });
    return invite ?? null;
  } catch {
    return null;
  }
}

export async function getPublicLibraryMetadata() {
  const client = getConvexClient();
  if (!client) {
    return null;
  }

  try {
    return await client.query(api.books.getPublicBooksStats, {});
  } catch {
    return null;
  }
}
