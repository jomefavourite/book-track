"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ConvexQueryClient } from "@convex-dev/react-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useMemo, useEffect, useRef } from "react";

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  // Initialize Convex client inside the component to use runtime environment variables
  const convex = useMemo(() => {
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || "";

    if (!convexUrl) {
      console.warn(
        "NEXT_PUBLIC_CONVEX_URL is not set. Please run 'npx convex dev' to get your URL."
      );
      // Use a placeholder URL during build time to prevent errors
      // At runtime, this should be set via environment variables
      return new ConvexReactClient("https://placeholder.convex.cloud");
    }

    return new ConvexReactClient(convexUrl);
  }, []);

  const convexQueryClient = useMemo(
    () => new ConvexQueryClient(convex),
    [convex]
  );

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
    [convexQueryClient]
  );

  // Connect ConvexQueryClient to QueryClient (only once)
  const hasConnected = useRef(false);
  
  useEffect(() => {
    if (!hasConnected.current && convexQueryClient && queryClient) {
      try {
        convexQueryClient.connect(queryClient);
        hasConnected.current = true;
      } catch (error) {
        console.warn('Error connecting ConvexQueryClient:', error);
      }
    }
  }, [queryClient, convexQueryClient]);

  return (
    <ConvexProvider client={convex}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ConvexProvider>
  );
}
