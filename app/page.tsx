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

  const jsonLd = {
    "@context": "https://schema.org",
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
    author: {
      "@type": "Person",
      name: "Favourite Jome",
      url: "https://favouritejome.com",
    },
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
