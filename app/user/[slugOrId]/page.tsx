import UserProfilePageClient from "./UserProfilePageClient";
import {
  createPageMetadata,
  getProfileMetadataBySlugOrId,
} from "@/lib/metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slugOrId: string }>;
}) {
  const { slugOrId } = await params;
  const profile = await getProfileMetadataBySlugOrId(slugOrId);

  if (!profile) {
    return createPageMetadata({
      title: "Reader Profile",
      description: "Explore shared reading journeys on Book-Track.",
      path: `/user/${slugOrId}`,
      noIndex: true,
    });
  }

  const displayName =
    profile.user.name || profile.user.email?.split("@")[0] || "Reader";
  const description =
    profile.stats.totalBooks > 0
      ? profile.stats.totalPagesRead > 0
        ? `${displayName} is sharing ${profile.stats.totalBooks} book${profile.stats.totalBooks === 1 ? "" : "s"}, ${profile.stats.completed} completed, and ${profile.stats.totalPagesRead.toLocaleString()} pages read on Book-Track.`
        : `${displayName} is sharing ${profile.stats.totalBooks} book${profile.stats.totalBooks === 1 ? "" : "s"} and ${profile.stats.completed} completed reads on Book-Track.`
      : `${displayName} is sharing a reading profile on Book-Track.`;

  return createPageMetadata({
    title: `${displayName}'s Reading Profile`,
    description,
    path: `/user/${profile.user.slug ?? slugOrId}`,
    image: profile.user.imageUrl,
    openGraphType: "profile",
  });
}

export default function UserProfilePage() {
  return <UserProfilePageClient />;
}
