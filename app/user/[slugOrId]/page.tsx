import UserProfilePageClient from "./UserProfilePageClient";
import { createPageMetadata } from "@/lib/metadata";
import type { Metadata } from "next";

export const metadata: Metadata = createPageMetadata({
  title: "Reader Profile",
  description: "Explore shared reading journeys on Book-Trackr.",
  path: "/user",
  noIndex: true,
});

export function generateStaticParams() {
  return [];
}

export default function UserProfilePage() {
  return <UserProfilePageClient />;
}
