"use client";

import { useState } from "react";
import Link from "next/link";
import { useClerk } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";
import { trackActionFailed, trackEvent } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const CONFIRM_PHRASE = "DELETE";

export default function DeleteAccountSection() {
  const { signOut } = useClerk();
  const { data: blockers, isPending } = useQuery(
    convexQuery(api.account.getDeletionBlockers, {})
  );
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ownedCommunities = blockers?.ownedCommunities ?? [];
  const isBlocked = ownedCommunities.length > 0;

  function handleOpenChange(next: boolean) {
    if (isDeleting) return;
    setOpen(next);
    if (!next) {
      setConfirmText("");
      setError(null);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);
    try {
      const response = await fetch("/api/account", { method: "DELETE" });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Something went wrong. Please try again.");
      }
      trackEvent("account_deleted");
      await signOut({ redirectUrl: "/" });
    } catch (err) {
      trackActionFailed("delete_account", err);
      setError(err instanceof Error ? err.message : String(err));
      setIsDeleting(false);
    }
  }

  return (
    <Card className="max-w-xl border-destructive/40">
      <CardHeader>
        <CardTitle>Delete account</CardTitle>
        <CardDescription>
          Permanently delete your account and everything in it: your profile,
          books, reading logs, reflection notes, tags and reminders. Public
          books and your profile disappear straight away. This can&apos;t be
          undone. See our{" "}
          <Link href="/privacy#retention" className="underline underline-offset-4">
            Privacy Policy
          </Link>{" "}
          for details.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isBlocked && (
          <div
            className="rounded-md border border-border bg-muted/50 p-4 text-sm"
            role="status"
          >
            <p className="font-medium text-foreground">
              You own {ownedCommunities.length === 1 ? "a community" : "communities"}
            </p>
            <p className="mt-1 text-muted-foreground">
              Delete {ownedCommunities.length === 1 ? "it" : "them"} from community
              settings first, or email{" "}
              <a href="mailto:hello@booktrackr.app" className="underline underline-offset-4">
                hello@booktrackr.app
              </a>{" "}
              to hand ownership to another admin.
            </p>
            <ul className="mt-3 space-y-1">
              {ownedCommunities.map((community) => (
                <li key={community._id}>
                  <Link
                    href={`/communities/${community.slug}/settings`}
                    className="font-medium text-foreground underline underline-offset-4"
                  >
                    {community.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <Button
          variant="destructive"
          disabled={isPending || isBlocked}
          onClick={() => setOpen(true)}
        >
          Delete my account
        </Button>
      </CardContent>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              All of your BookTrackr data will be permanently deleted and you
              will be signed out. Type {CONFIRM_PHRASE} to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            placeholder={CONFIRM_PHRASE}
            aria-label={`Type ${CONFIRM_PHRASE} to confirm`}
            autoComplete="off"
            disabled={isDeleting}
          />
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={confirmText.trim() !== CONFIRM_PHRASE || isDeleting}
            >
              {isDeleting ? "Deleting…" : "Delete account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
