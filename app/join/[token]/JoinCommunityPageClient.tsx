"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { SignInButton, useUser } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { Lock, Users } from "lucide-react";
import { api } from "@/convex/_generated/api";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type InvitePreview = {
  community: {
    name: string;
    description?: string;
    visibility: "public" | "private";
    memberCount: number;
    brandColor?: string;
  };
  roleToGrant: "admin" | "moderator" | "member";
  isActive: boolean;
  isExpired: boolean;
  isUsedUp: boolean;
};

export default function JoinCommunityPageClient() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isLoaded } = useUser();
  const [error, setError] = useState<string | null>(null);

  const { data: invite, isPending } = useQuery({
    ...convexQuery(api.communities.getInvitePreview, { token }),
    enabled: !!token,
  });

  const preview = invite as InvitePreview | null | undefined;

  const { mutateAsync: acceptInvite, isPending: acceptPending } = useMutation({
    mutationFn: useConvexMutation(api.communities.acceptInvite),
    onSuccess: (result: { slug: string }) => {
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.communities.getMyCommunities, {}).queryKey,
      });
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.communities.discoverCommunities, {}).queryKey,
      });
      router.push(`/communities/${result.slug}`);
    },
  });

  return (
    <>
      <Navigation />
      <main className="mx-auto flex min-h-[70vh] max-w-2xl items-center p-3 sm:p-6">
        {isPending || !isLoaded ? (
          <Card className="w-full p-6 text-center text-muted-foreground">
            Loading invite...
          </Card>
        ) : !preview ? (
          <Card className="w-full p-6 text-center sm:p-10">
            <h1 className="text-2xl font-bold text-foreground">
              Invite not found
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This invite may have been removed or typed incorrectly.
            </p>
          </Card>
        ) : !preview.isActive ? (
          <Card className="w-full p-6 text-center sm:p-10">
            <h1 className="text-2xl font-bold text-foreground">
              Invite unavailable
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This invite is no longer active.
            </p>
          </Card>
        ) : (
          <Card className="w-full p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <span
                className="h-4 w-4 rounded-full border border-border"
                style={{ backgroundColor: preview.community.brandColor ?? "transparent" }}
                aria-hidden="true"
              />
              <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium capitalize text-muted-foreground">
                {preview.community.visibility === "private" && <Lock className="h-3 w-3" />}
                {preview.community.visibility}
              </span>
            </div>
            <h1 className="mt-4 text-3xl font-bold text-foreground">
              Join {preview.community.name}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {preview.community.description ||
                "Accept this invite to join the reading community."}
            </p>

            <div className="mt-6 text-sm text-muted-foreground">
              <div className="rounded-md border border-border p-3">
                <Users className="mb-2 h-4 w-4" />
                <p className="font-medium text-foreground">
                  {preview.community.memberCount.toLocaleString()} members
                </p>
                <p className="capitalize">
                  You will join as {preview.roleToGrant}.
                </p>
              </div>
            </div>

            {error && (
              <p className="mt-5 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </p>
            )}

            {!user ? (
              <SignInButton mode="modal">
                <Button className="mt-6 w-full">Sign In to Accept Invite</Button>
              </SignInButton>
            ) : (
              <Button
                className="mt-6 w-full"
                disabled={acceptPending}
                onClick={async () => {
                  setError(null);
                  try {
                    await acceptInvite({ token });
                  } catch (caught) {
                    setError(
                      caught instanceof Error
                        ? caught.message
                        : "Unable to accept invite."
                    );
                  }
                }}
              >
                {acceptPending ? "Joining..." : "Accept Invite"}
              </Button>
            )}
          </Card>
        )}
      </main>
    </>
  );
}
