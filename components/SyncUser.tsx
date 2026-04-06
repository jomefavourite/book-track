"use client";

import { useEffect, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function SyncUser() {
  const { user, isLoaded } = useUser();
  const syncUser = useMutation(api.users.syncUser);
  const syncedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !user?.id) return;
    if (syncedRef.current === user.id) return;

    syncedRef.current = user.id;
    syncUser({
      clerkId: user.id,
      name: user.fullName ?? undefined,
      email: user.primaryEmailAddress?.emailAddress ?? undefined,
      imageUrl: user.imageUrl ?? undefined,
    }).catch(console.error);
  }, [isLoaded, user?.id, user?.fullName, user?.primaryEmailAddress?.emailAddress, user?.imageUrl, syncUser]);

  return null;
}
