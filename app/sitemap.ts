import type { MetadataRoute } from "next";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { getSiteUrl } from "@/lib/metadata";

// Revalidate the sitemap hourly so newly-shared public content gets indexed
// without rebuilding, while keeping Convex load low.
export const revalidate = 3600;

type SitemapEntry = MetadataRoute.Sitemap[number];

function getConvexClient(): ConvexHttpClient | null {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (!convexUrl) {
    return null;
  }
  return new ConvexHttpClient(convexUrl);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const now = new Date();

  const staticEntries: SitemapEntry[] = [
    {
      url: `${siteUrl}/`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${siteUrl}/public`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${siteUrl}/communities`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.7,
    },
  ];

  const client = getConvexClient();
  if (!client) {
    return staticEntries;
  }

  const dynamicEntries: SitemapEntry[] = [];

  try {
    const publicBooks = await client.query(api.books.getPublicBooks, {});
    const seenProfiles = new Set<string>();

    for (const book of publicBooks ?? []) {
      const lastModified = book._creationTime
        ? new Date(book._creationTime)
        : now;

      dynamicEntries.push({
        url: `${siteUrl}/books/${book._id}`,
        lastModified,
        changeFrequency: "weekly",
        priority: 0.6,
      });

      if (book.userId && !seenProfiles.has(book.userId)) {
        seenProfiles.add(book.userId);
        dynamicEntries.push({
          url: `${siteUrl}/user/${book.userId}`,
          lastModified,
          changeFrequency: "weekly",
          priority: 0.5,
        });
      }
    }
  } catch {
    // Non-fatal: fall back to whatever entries we already have.
  }

  try {
    const communities = await client.query(api.communities.discoverCommunities, {});
    for (const community of communities ?? []) {
      if (community.visibility !== "public" || !community.slug) {
        continue;
      }
      dynamicEntries.push({
        url: `${siteUrl}/communities/${community.slug}`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.5,
      });
    }
  } catch {
    // Non-fatal.
  }

  return [...staticEntries, ...dynamicEntries];
}
