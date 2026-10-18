"use client";

import { useUser, SignInButton, SignOutButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trackEvent } from "@/lib/analytics";

export default function AuthButton() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return <Skeleton className="h-8 w-20 rounded-md" />;
  }

  if (isSignedIn) {
    return (
      <SignOutButton>
        <Button
          variant="default"
          size="sm"
          onClick={() => trackEvent("logout", { location: "header" })}
        >
          Sign Out
        </Button>
      </SignOutButton>
    );
  }

  return (
    <SignInButton mode="modal">
      <Button variant="default" size="sm">
        Sign In
      </Button>
    </SignInButton>
  );
}

