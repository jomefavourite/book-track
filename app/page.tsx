import type { Metadata } from "next";
import HomePageClient from "./HomePageClient";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Track Your Reading Journey",
  description:
    "Plan, track, and share your reading progress with calendar and fixed-days reading modes.",
  path: "/",
});

export default function Home() {
  return <HomePageClient />;
}
