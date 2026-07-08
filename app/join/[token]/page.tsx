import type { Metadata } from "next";
import {
  SITE_NAME,
  createPageMetadata,
  getInviteMetadata,
} from "@/lib/metadata";
import JoinCommunityPageClient from "./JoinCommunityPageClient";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ token: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { token } = await params;
  const invite = await getInviteMetadata(token);
  const community = invite?.community;

  if (!community) {
    return createPageMetadata({
      title: "Join Community",
      description: "Accept a Book-Trackr community invite.",
      path: `/join/${token}`,
      noIndex: true,
    });
  }

  const memberLabel = `${community.memberCount.toLocaleString()} member${
    community.memberCount === 1 ? "" : "s"
  }`;

  return createPageMetadata({
    title: `Join ${community.name}`,
    description:
      community.description ||
      `Join ${community.name} — a ${memberLabel} reading community on ${SITE_NAME}.`,
    path: `/join/${token}`,
    image: community.logoUrl ?? undefined,
    noIndex: true,
  });
}

export default function JoinCommunityPage() {
  return <JoinCommunityPageClient />;
}
