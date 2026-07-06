import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/metadata";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Public marketing + shared reading pages (/, /public, /books/[id],
      // /user/[slugOrId], /communities/[slug]) stay crawlable. Only block
      // authenticated app surfaces and create/edit flows.
      disallow: [
        "/dashboard",
        "/api",
        "/join",
        "/books/new",
        "/communities/new",
        "/*/edit",
        "/*/settings",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
