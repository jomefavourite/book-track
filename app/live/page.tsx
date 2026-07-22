import type { Metadata } from "next";
import LiveRoomPageClient from "./LiveRoomPageClient";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Live Room",
  description: "Watch readers arrive on Book-Trackr in real time.",
  path: "/live",
});

export default function LiveRoomPage() {
  return <LiveRoomPageClient />;
}
