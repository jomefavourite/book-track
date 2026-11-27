"use client";

import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/nextjs";
import { ConvexQueryClient } from "@convex-dev/react-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useState } from "react";

/**
 * Build the Convex client, the Convex↔TanStack bridge and the QueryClient as
 * one set, and connect them immediately — before any child renders.
 *
 * Connecting in an effect (after the first render) missed the "added" events
 * of every query a page requested on first load: those queries never got a
 * live Convex subscription, and when the cache later garbage-collected them
 * the bridge threw "Cannot read properties of undefined (reading
 * 'unsubscribe')". Creating all three together also keeps React's dev-mode
 * double initialisation from connecting the same bridge twice.
 */
function createClients() {
  // Read at runtime so the env var is picked up per environment.
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || "";
  if (!convexUrl) {
    console.warn(
      "NEXT_PUBLIC_CONVEX_URL is not set. Please run 'npx convex dev' to get your URL."
    );
  }
  // Placeholder URL keeps the build from failing when the env var is missing.
  const convex = new ConvexReactClient(
    convexUrl || "https://placeholder.convex.cloud"
  );
  const convexQueryClient = new ConvexQueryClient(convex);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        queryKeyHashFn: convexQueryClient.hashFn(),
        queryFn: convexQueryClient.queryFn(),
        staleTime: 1000 * 60 * 5, // 5 minutes
        refetchOnWindowFocus: true,
        placeholderData: (previousData: unknown) => previousData, // Keep previous data while refetching
      },
    },
  });
  convexQueryClient.connect(queryClient);
  return { convex, queryClient };
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const [{ convex, queryClient }] = useState(createClients);

  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ConvexProviderWithClerk>
  );
}
