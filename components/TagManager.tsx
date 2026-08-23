"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { useMutation as useConvexMutation } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { sanitizeTags } from "@/lib/bookTags";

/**
 * Settings card for managing the user's reusable tag vocabulary: add new tags
 * and remove ones you no longer want suggested. Deleting a tag here does not
 * change books already tagged with it.
 */
export default function TagManager() {
  const { user } = useUser();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: tags = [], isPending } = useQuery({
    ...convexQuery(api.userTags.getUserTags, { userId: user?.id ?? "" }),
    enabled: !!user?.id,
  });

  const createTag = useConvexMutation(api.userTags.createUserTag);
  const deleteTag = useConvexMutation(api.userTags.deleteUserTag);

  const handleAdd = async () => {
    if (!user?.id) return;
    const [label] = sanitizeTags([draft]);
    if (!label) {
      setDraft("");
      return;
    }
    setError(null);
    try {
      await createTag({ userId: user.id, label });
      setDraft("");
    } catch {
      setError("Could not add that tag. Please try again.");
    }
  };

  const handleDelete = async (tagId: Id<"userTags">) => {
    if (!user?.id) return;
    try {
      await deleteTag({ userId: user.id, tagId });
    } catch {
      setError("Could not remove that tag. Please try again.");
    }
  };

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Manage tags</CardTitle>
        <CardDescription>
          Tags you can reuse when creating or editing books. Add topics like
          Finance or Self-help here, or they&apos;ll be saved automatically the
          first time you use them. Removing a tag stops it from being suggested —
          books already tagged with it keep it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder="e.g., Self-help"
            aria-label="New tag"
          />
          <Button type="button" onClick={handleAdd} disabled={!draft.trim()}>
            Add
          </Button>
        </div>

        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

        <div className="mt-4">
          {isPending ? (
            <p className="text-sm text-muted-foreground">Loading tags…</p>
          ) : tags.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tags yet. Add one above, or create a book with tags.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag._id}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary"
                >
                  {tag.label}
                  <button
                    type="button"
                    onClick={() => handleDelete(tag._id)}
                    aria-label={`Remove ${tag.label}`}
                    className="rounded-full p-0.5 hover:bg-primary/20"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
