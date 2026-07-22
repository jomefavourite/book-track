import type { Metadata } from "next";
import HomePageClient from "./HomePageClient";
import {
  createPageMetadata,
  getSiteUrl,
  SITE_NAME,
  DEFAULT_DESCRIPTION,
  absoluteUrl,
  DEFAULT_OG_IMAGE,
} from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Track Your Reading Journey",
  description: "Plan, track and share reading progress.",
  path: "/",
});

export default function Home() {
  const siteUrl = getSiteUrl();

  const author = {
    "@type": "Person",
    name: "Favourite Jome",
    url: "https://favouritejome.com",
  };

  // A single @graph groups the WebApplication with Organization + WebSite so
  // AI/search crawlers can resolve the brand behind the product. All values
  // are derived from real repo data (SITE_NAME, site URL, logo, author).
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name: SITE_NAME,
        url: siteUrl,
        logo: absoluteUrl("/icon-512.png"),
        description: DEFAULT_DESCRIPTION,
        founder: author,
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        name: SITE_NAME,
        url: siteUrl,
        description: DEFAULT_DESCRIPTION,
        publisher: { "@id": `${siteUrl}/#organization` },
      },
      {
        "@type": "WebApplication",
        name: SITE_NAME,
        url: siteUrl,
        description: DEFAULT_DESCRIPTION,
        applicationCategory: "LifestyleApplication",
        operatingSystem: "Web",
        image: absoluteUrl(DEFAULT_OG_IMAGE),
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
        author,
        publisher: { "@id": `${siteUrl}/#organization` },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HomePageClient />
    </>
  );
}
