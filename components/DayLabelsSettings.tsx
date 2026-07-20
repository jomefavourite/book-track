"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { CalendarDays, Plus, Trash2, Undo2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { toUserMessage } from "@/lib/errorMessage";
import {
  DAY_BEHAVIORS,
  DAY_BEHAVIOR_HELP,
  DAY_ICONS,
  dayIconFor,
  type DayBehavior,
} from "@/lib/scheduleDayType";

type DayLabel = {
  _id: string;
  name: string;
  behavior: DayBehavior;
  icon?: string;
  isArchived?: boolean;
  /** Present on the client-side placeholders shown before seeding runs */
  isPlaceholder?: boolean;
};

const ICON_KEYS = Object.keys(DAY_ICONS);

/**
 * Lets a community name its own schedule days. The *name* is free text; the
 * behavior comes from a closed set so every reading and catch-up computation
 * knows what the day means without understanding the community's vocabulary.
 */
export default function DayLabelsSettings({
  communityId,
  canEdit,
}: {
  communityId: Id<"communities">;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [newBehavior, setNewBehavior] = useState<DayBehavior>("reading");
  const [newIcon, setNewIcon] = useState<string>(ICON_KEYS[0]);
  const [error, setError] = useState<string | null>(null);
  // Set when Add is pressed with an empty name, to highlight the field.
  const [nameInvalid, setNameInvalid] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const labelsQuery = convexQuery(api.communityDayLabels.listForCommunity, {
    communityId,
    includeArchived: true,
  });
  const { data: labels } = useQuery(labelsQuery);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: labelsQuery.queryKey });

  const { mutateAsync: createLabel, isPending: creating } = useMutation({
    mutationFn: useConvexMutation(api.communityDayLabels.createLabel),
    onSuccess: invalidate,
  });
  const { mutateAsync: updateLabel } = useMutation({
    mutationFn: useConvexMutation(api.communityDayLabels.updateLabel),
    onSuccess: invalidate,
  });
  const { mutateAsync: archiveLabel } = useMutation({
    mutationFn: useConvexMutation(api.communityDayLabels.archiveLabel),
    onSuccess: invalidate,
  });

  const rows = useMemo(() => (labels ?? []) as DayLabel[], [labels]);

  // Queries can't write, so a community that predates day labels shows
  // read-only placeholders until we persist the seeded defaults once.
  const { mutate: ensureLabels } = useMutation({
    mutationFn: useConvexMutation(api.communityDayLabels.ensureLabelsForCommunity),
    onSuccess: invalidate,
  });
  const needsSeeding = canEdit && rows.some((label) => label.isPlaceholder);
  useEffect(() => {
    if (needsSeeding) {
      ensureLabels({ communityId });
    }
  }, [needsSeeding, ensureLabels, communityId]);

  const run = async (action: () => Promise<unknown>, successMessage: string) => {
    setError(null);
    try {
      await action();
      toast({ title: successMessage });
    } catch (caught) {
      setError(toUserMessage(caught));
    }
  };

  const trimmedNewName = newName.trim();

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold text-foreground">Day labels</h2>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Name the kinds of days your reading schedules use. Each label needs a
        behavior so progress and catch-up suggestions know what the day means —
        rename &quot;Rest&quot; to &quot;Sabbath&quot; and nothing else changes.
      </p>

      <div className="mt-4 space-y-2">
        {rows.map((label) => {
          const Icon = dayIconFor(label.icon, label.behavior);
          const archived = label.isArchived === true;
          return (
            <div
              key={label._id}
              className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center"
              style={{ borderColor: "var(--border)" }}
            >
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              {/* Uncontrolled + commit on blur: renaming shouldn't fire a
                  mutation on every keystroke. */}
              <Input
                key={`${label._id}:${label.name}`}
                defaultValue={label.name}
                disabled={!canEdit || label.isPlaceholder}
                onBlur={(event) => {
                  const name = event.target.value.trim();
                  if (name.length === 0) {
                    // Don't leave the field looking blank — a label must have a name.
                    event.target.value = label.name;
                    setError("A day label needs a name.");
                    return;
                  }
                  if (name === label.name) return;
                  run(
                    () =>
                      updateLabel({
                        labelId: label._id as Id<"communityDayLabels">,
                        name,
                      }),
                    "Day label renamed"
                  );
                }}
                className="h-9 w-full sm:w-44"
                aria-label={`Name for ${label.name}`}
              />
              <Select
                value={label.behavior}
                disabled={!canEdit || label.isPlaceholder}
                onValueChange={(value) =>
                  run(
                    () =>
                      updateLabel({
                        labelId: label._id as Id<"communityDayLabels">,
                        behavior: value as DayBehavior,
                      }),
                    "Day behavior updated"
                  )
                }
              >
                <SelectTrigger className="h-9 w-full sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAY_BEHAVIORS.map((behavior) => (
                    <SelectItem key={behavior} value={behavior}>
                      {DAY_BEHAVIOR_HELP[behavior].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="flex-1 text-xs text-muted-foreground">
                {DAY_BEHAVIOR_HELP[label.behavior].description}
              </p>
              {canEdit && !label.isPlaceholder && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    run(
                      () =>
                        archiveLabel({
                          labelId: label._id as Id<"communityDayLabels">,
                          isArchived: !archived,
                        }),
                      archived ? "Day label restored" : "Day label archived"
                    )
                  }
                  aria-label={archived ? "Restore label" : "Archive label"}
                >
                  {archived ? (
                    <Undo2 className="h-4 w-4" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {canEdit && (
        <form
          className="mt-4 flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center"
          style={{ borderColor: "var(--border)" }}
          // Own the empty-name case rather than letting the browser's native
          // `required` bubble take over, so the highlight matches the app.
          noValidate
          onSubmit={async (event) => {
            event.preventDefault();
            if (creating) return;
            if (trimmedNewName.length === 0) {
              setNameInvalid(true);
              setError("Enter a name for the new day label.");
              nameInputRef.current?.focus();
              return;
            }
            await run(
              () =>
                createLabel({
                  communityId,
                  name: trimmedNewName,
                  behavior: newBehavior,
                  icon: newIcon,
                }),
              "Day label added"
            );
            setNewName("");
            setNameInvalid(false);
          }}
        >
          <Input
            ref={nameInputRef}
            value={newName}
            onChange={(event) => {
              setNewName(event.target.value);
              if (nameInvalid) setNameInvalid(false);
              if (error) setError(null);
            }}
            placeholder="New label, e.g. Sabbath"
            aria-required="true"
            aria-invalid={nameInvalid || undefined}
            aria-describedby={nameInvalid ? "day-label-name-error" : undefined}
            className={`h-9 w-full sm:w-44 ${
              nameInvalid
                ? "border-destructive focus-visible:ring-destructive"
                : ""
            }`}
            aria-label="New day label name"
          />
          <Select
            value={newBehavior}
            onValueChange={(value) => setNewBehavior(value as DayBehavior)}
          >
            <SelectTrigger className="h-9 w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAY_BEHAVIORS.map((behavior) => (
                <SelectItem key={behavior} value={behavior}>
                  {DAY_BEHAVIOR_HELP[behavior].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={newIcon} onValueChange={setNewIcon}>
            <SelectTrigger className="h-9 w-full sm:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ICON_KEYS.map((key) => {
                const Icon = DAY_ICONS[key];
                return (
                  <SelectItem key={key} value={key}>
                    <span className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      {key}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {/* Deliberately always clickable — clicking with an empty name
              highlights the field instead of leaving a dead button. */}
          <Button type="submit" variant="outline" disabled={creating}>
            <Plus className="h-4 w-4" />
            {creating ? "Adding..." : "Add"}
          </Button>
        </form>
      )}

      {error && (
        <p
          id="day-label-name-error"
          role="alert"
          className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
    </Card>
  );
}
