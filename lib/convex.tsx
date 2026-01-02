"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ConvexQueryClient } from "@convex-dev/react-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useMemo, useEffect, useRef } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || "";

if (!convexUrl) {
  console.warn(
    "NEXT_PUBLIC_CONVEX_URL is not set. Please run 'npx convex dev' to get your URL."
  );
}

const convex = new ConvexReactClient(convexUrl);
const convexQueryClient = new ConvexQueryClient(convex);

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            queryKeyHashFn: convexQueryClient.hashFn(),
            queryFn: convexQueryClient.queryFn(),
            staleTime: 1000 * 60 * 5, // 5 minutes
            refetchOnWindowFocus: true,
            placeholderData: (previousData: unknown) => previousData, // Keep previous data while refetching
          },
        },
      }),
    []
  );

  // Connect ConvexQueryClient to QueryClient (only once)
  const hasConnected = useRef(false);
  useEffect(() => {
    if (!hasConnected.current) {
      convexQueryClient.connect(queryClient);
      hasConnected.current = true;
    }
  }, [queryClient]);

  return (
    <ConvexProvider client={convex}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ConvexProvider>
  );
}
