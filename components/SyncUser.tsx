"use client";

import { useEffect, useRef } from "react";
import { useSession, useUser } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { trackEvent } from "@/lib/analytics";

// A session created this recently counts as a fresh sign-in (covers OAuth redirects).
const FRESH_SESSION_MS = 5 * 60 * 1000;
const TRACKED_SESSION_KEY = "booktrackr:tracked-session";

function wasSessionTracked(sessionId: string) {
  try {
    return localStorage.getItem(TRACKED_SESSION_KEY) === sessionId;
  } catch {
    return false;
  }
}

function markSessionTracked(sessionId: string) {
  try {
    localStorage.setItem(TRACKED_SESSION_KEY, sessionId);
  } catch {
    // Storage unavailable; worst case the event can fire again.
  }
}

export default function SyncUser() {
  const { user, isLoaded } = useUser();
  const { session } = useSession();
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
    })
      .then((result) => {
        if (!session || wasSessionTracked(session.id)) return;
        const provider = user.externalAccounts[0]?.provider ?? "email";
        if (result.isNew) {
          trackEvent("signup_completed", { provider });
        } else if (Date.now() - session.createdAt.getTime() < FRESH_SESSION_MS) {
          trackEvent("login_completed", { provider });
        } else {
          return;
        }
        markSessionTracked(session.id);
      })
      .catch(console.error);
  }, [isLoaded, user, user?.id, user?.fullName, user?.primaryEmailAddress?.emailAddress, user?.imageUrl, session, syncUser]);

  return null;
}
