import type { Metadata } from "next";
import HomePageClient from "./HomePageClient";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Track Your Reading Journey",
  description: "Plan, track and share reading progress.",
  path: "/",
});

export default function Home() {
  return <HomePageClient />;
}
