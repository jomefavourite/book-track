import Link from "next/link";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { createPageMetadata } from "@/lib/metadata";
import { SITE_MAP_SECTIONS } from "@/lib/siteMap";

// Public communities change rarely; refresh the list hourly like sitemap.xml.
export const revalidate = 3600;

export const metadata = createPageMetadata({
  title: "Sitemap",
  description: "Every page on BookTrackr, from your dashboard to public reading communities.",
  path: "/sitemap",
});

async function getPublicCommunities() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (!convexUrl) return [];
  try {
    const communities = await new ConvexHttpClient(convexUrl).query(
      api.communities.discoverCommunities,
      {}
    );
    return (communities ?? [])
      .filter((community) => community.visibility === "public" && community.slug)
      .map((community) => ({ name: community.name, slug: community.slug }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export default async function SitemapPage() {
  const communities = await getPublicCommunities();

  return (
    <>
      <Navigation />
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <header className="mb-10 border-b border-border pb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Sitemap
          </h1>
          <p className="mt-3 text-muted-foreground">
            Every page on BookTrackr in one place.
          </p>
        </header>

        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          {SITE_MAP_SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {section.title}
              </h2>
              <ul className="mt-4 space-y-4">
                {section.pages.map((page) => (
                  <li key={page.path}>
                    <Link
                      href={page.path}
                      className="font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      {page.title}
                    </Link>
                    {page.requiresSignIn && (
                      <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                        Sign in
                      </span>
                    )}
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {page.description}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        {communities.length > 0 && (
          <section className="mt-12 border-t border-border pt-10">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Public communities
            </h2>
            <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
              {communities.map((community) => (
                <li key={community.slug}>
                  <Link
                    href={`/communities/${community.slug}`}
                    className="text-foreground underline-offset-4 hover:underline"
                  >
                    {community.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}
