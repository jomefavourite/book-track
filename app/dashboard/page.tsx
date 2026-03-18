import type { Metadata } from "next";
import DashboardPageClient from "./DashboardPageClient";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "My Books",
  description: "Manage your reading plans, active books, and archived books.",
  path: "/dashboard",
  noIndex: true,
});

export default function Dashboard() {
  return <DashboardPageClient />;
}
