"use client";

import { useUser, SignInButton, SignOutButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export default function AuthButton() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return (
      <div className="text-sm text-muted-foreground">Loading...</div>
    );
  }

  if (isSignedIn) {
    return (
      <SignOutButton>
        <Button variant="default" size="sm">
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

