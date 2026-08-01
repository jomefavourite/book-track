"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SignInButton, useUser } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { ArrowLeft, Lock, Search } from "lucide-react";
import { api } from "@/convex/_generated/api";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormPageSkeleton } from "@/components/CommunityCardSkeleton";
import { Input } from "@/components/ui/input";

export default function NewCommunityPageClient() {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [brandColor, setBrandColor] = useState("#111827");
  const [instagramUrl, setInstagramUrl] = useState("");
  const [tiktokUrl, setTiktokUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);

  const { data: creatorStatus, isPending: statusPending } = useQuery({
    ...convexQuery(api.communities.getCreatorStatus, {}),
    enabled: !!user?.id,
  });

  const { mutateAsync: createCommunity, isPending: createPending } = useMutation({
    mutationFn: useConvexMutation(api.communities.createCommunity),
    onSuccess: (community: { slug: string } | null) => {
      if (!community) return;
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.communities.getMyCommunities, {}).queryKey,
      });
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.communities.discoverCommunities, {}).queryKey,
      });
      router.push(`/communities/${community.slug}`);
    },
  });

  const { mutateAsync: requestAccess, isPending: requestPending } = useMutation({
    mutationFn: useConvexMutation(api.communities.requestCreatorAccess),
    onSuccess: () => {
      setReason("");
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.communities.getCreatorStatus, {}).queryKey,
      });
    },
  });

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    try {
      await createCommunity({
        name,
        description,
        visibility,
        brandColor,
        instagramUrl,
        tiktokUrl,
        websiteUrl,
      });
    } catch (caught) {
      setIsSubmitting(false);
      setError(caught instanceof Error ? caught.message : "Unable to create community.");
    }
  };

  return (
    <>
      <Navigation />
      <main className="mx-auto max-w-3xl p-3 sm:p-6">
        <Button variant="ghost" asChild className="mb-4">
          <Link href="/communities">
            <ArrowLeft className="h-4 w-4" />
            Communities
          </Link>
        </Button>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground sm:text-4xl">
            Create Community
          </h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            Request creator access or set up a focused reading community once
            approved.
          </p>
        </div>

        {!isLoaded ? (
          <FormPageSkeleton fields={4} />
        ) : !user ? (
          <Card className="p-6 text-center sm:p-10">
            <h2 className="text-xl font-semibold text-foreground">
              Sign in required
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              You need to sign in before creating or requesting access to create
              communities.
            </p>
            <SignInButton mode="modal">
              <Button className="mt-5">Sign In</Button>
            </SignInButton>
          </Card>
        ) : statusPending ? (
          <FormPageSkeleton fields={4} />
        ) : !creatorStatus?.canCreate &&
          creatorStatus?.requestStatus === "pending" ? (
          <Card className="p-6 text-center sm:p-10">
            <h2 className="text-xl font-semibold text-foreground">
              Request pending
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Your community creator request is pending approval. You will be
              able to create a community here after it is approved.
            </p>
            <Button asChild className="mt-5">
              <Link href="/communities">Back to Communities</Link>
            </Button>
          </Card>
        ) : !creatorStatus?.canCreate ? (
          <Card className="p-6">
            <h2 className="text-xl font-semibold text-foreground">
              Community creation
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Creation is gated so communities stay intentional. Tell us what
              kind of community you want to create and who it is for.
            </p>
            <form
              className="mt-5 space-y-4"
              onSubmit={async (event) => {
                event.preventDefault();
                if (isRequesting) return;
                setIsRequesting(true);
                try {
                  await requestAccess({ reason });
                } finally {
                  setIsRequesting(false);
                }
              }}
            >
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Tell us what kind of community you want to create and who it is for."
                className="min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" asChild>
                  <Link href="/communities">Cancel</Link>
                </Button>
                <Button type="submit" disabled={isRequesting}>
                  {isRequesting ? "Sending..." : "Request access"}
                </Button>
              </div>
            </form>
          </Card>
        ) : (
          <Card className="p-5 sm:p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 sm:col-span-2">
                  <span className="text-sm font-medium text-foreground">
                    Community name
                  </span>
                  <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Saturday Readers Club"
                    required
                  />
                </label>

                <label className="space-y-2 sm:col-span-2">
                  <span className="text-sm font-medium text-foreground">
                    Description
                  </span>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="A focused group for reading and growing together."
                    className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </label>

                <div className="space-y-2 sm:col-span-2">
                  <span className="text-sm font-medium text-foreground">
                    Visibility
                  </span>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setVisibility("private")}
                      className={`rounded-md border p-4 text-left transition-colors ${
                        visibility === "private"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-accent"
                      }`}
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <Lock className="h-4 w-4" />
                        Private
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        Discoverable, but activity and joining are invite-only.
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisibility("public")}
                      className={`rounded-md border p-4 text-left transition-colors ${
                        visibility === "public"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-accent"
                      }`}
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <Search className="h-4 w-4" />
                        Public
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        Discoverable with a public community profile.
                      </span>
                    </button>
                  </div>
                </div>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-foreground">
                    Brand color
                  </span>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={brandColor}
                      onChange={(event) => setBrandColor(event.target.value)}
                      className="w-16 p-1"
                      aria-label="Brand color"
                    />
                    <Input
                      value={brandColor}
                      onChange={(event) => setBrandColor(event.target.value)}
                      placeholder="#111827"
                    />
                  </div>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-foreground">
                    Instagram <span className="text-muted-foreground">(optional)</span>
                  </span>
                  <Input
                    type="url"
                    value={instagramUrl}
                    onChange={(event) => setInstagramUrl(event.target.value)}
                    placeholder="https://instagram.com/yourcommunity"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-foreground">
                    TikTok <span className="text-muted-foreground">(optional)</span>
                  </span>
                  <Input
                    type="url"
                    value={tiktokUrl}
                    onChange={(event) => setTiktokUrl(event.target.value)}
                    placeholder="https://tiktok.com/@yourcommunity"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-foreground">
                    Website <span className="text-muted-foreground">(optional)</span>
                  </span>
                  <Input
                    type="url"
                    value={websiteUrl}
                    onChange={(event) => setWebsiteUrl(event.target.value)}
                    placeholder="https://yourcommunity.com"
                  />
                </label>
              </div>

              {error && (
                <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </p>
              )}

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" asChild>
                  <Link href="/communities">Cancel</Link>
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Creating..." : "Create Community"}
                </Button>
              </div>
            </form>
          </Card>
        )}
      </main>
    </>
  );
}
