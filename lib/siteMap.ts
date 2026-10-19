import type { MetadataRoute } from "next";

/**
 * Single source of truth for BookTrackr's top-level pages. Feeds both the
 * human-readable /sitemap page and sitemap.xml, so a new page only needs to be
 * added here. Keep it up to date whenever a route is added, renamed or removed.
 */

type ChangeFrequency = NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;

export type SiteMapPage = {
  path: string;
  title: string;
  description: string;
  /** Pages that need sign-in are listed on /sitemap but left out of sitemap.xml. */
  requiresSignIn?: boolean;
  changeFrequency?: ChangeFrequency;
  priority?: number;
};

export type SiteMapSection = {
  title: string;
  pages: SiteMapPage[];
};

export const SITE_MAP_SECTIONS: SiteMapSection[] = [
  {
    title: "Explore",
    pages: [
      {
        path: "/",
        title: "Home",
        description: "What BookTrackr is and how it works.",
        changeFrequency: "daily",
        priority: 1,
      },
      {
        path: "/public",
        title: "Public reading tracker",
        description: "Reading journeys other readers have shared.",
        changeFrequency: "daily",
        priority: 0.8,
      },
      {
        path: "/communities",
        title: "Communities",
        description: "Reading communities you can discover and join.",
        changeFrequency: "daily",
        priority: 0.7,
      },
      {
        path: "/live",
        title: "Live Room",
        description: "Recent activity on BookTrackr, by page and country.",
        changeFrequency: "hourly",
        priority: 0.4,
      },
    ],
  },
  {
    title: "Your reading",
    pages: [
      {
        path: "/dashboard",
        title: "Dashboard",
        description: "Your books, today's reading and progress.",
        requiresSignIn: true,
      },
      {
        path: "/books/new",
        title: "Add a book",
        description: "Plan a reading schedule for a new book.",
        requiresSignIn: true,
      },
      {
        path: "/communities/new",
        title: "Create a community",
        description: "Start a reading community.",
        requiresSignIn: true,
      },
      {
        path: "/dashboard/settings",
        title: "Settings",
        description: "Reminders, tags and deleting your account.",
        requiresSignIn: true,
      },
    ],
  },
  {
    title: "About",
    pages: [
      {
        path: "/privacy",
        title: "Privacy Policy",
        description: "What data we collect and how to delete it.",
        changeFrequency: "yearly",
        priority: 0.2,
      },
      {
        path: "/terms",
        title: "Terms of Service",
        description: "The rules for using BookTrackr.",
        changeFrequency: "yearly",
        priority: 0.2,
      },
      {
        path: "/sitemap",
        title: "Sitemap",
        description: "Every page on BookTrackr.",
        changeFrequency: "monthly",
        priority: 0.2,
      },
    ],
  },
];

/** Public pages for sitemap.xml. */
export function getIndexableSiteMapPages(): SiteMapPage[] {
  return SITE_MAP_SECTIONS.flatMap((section) => section.pages).filter(
    (page) => !page.requiresSignIn
  );
}
