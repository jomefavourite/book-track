"use client";

import { FormEvent, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { ArrowLeft, ImagePlus, X } from "lucide-react";
import { differenceInDays } from "date-fns";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  formatDateForStorage,
  MONTHS,
  parseDateFromStorage,
} from "@/lib/dateUtils";
import { calculateDailyPages } from "@/lib/readingCalculator";

type Role = "owner" | "admin" | "moderator" | "member";

type CommunityDetail = {
  _id: Id<"communities">;
  name: string;
  slug: string;
  viewerRole?: Role;
};

function canManage(role?: Role) {
  return role === "owner" || role === "admin" || role === "moderator";
}

function todayKey() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return formatDateForStorage(today);
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export default function NewCommunityBookPageClient() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [author, setAuthor] = useState("");
  const [totalPages, setTotalPages] = useState("");
  const [totalChapters, setTotalChapters] = useState("");
  const [progressStyle, setProgressStyle] = useState<"pages" | "chapters">(
    "pages"
  );
  const [ignorePages, setIgnorePages] = useState(false);
  const [readingMode, setReadingMode] = useState<"calendar" | "fixed-days">(
    "calendar"
  );
  const [startDate, setStartDate] = useState(todayKey());
  const [endDate, setEndDate] = useState("");
  const [daysToRead, setDaysToRead] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  const generateUploadUrl = useConvexMutation(api.communities.generateUploadUrl);

  const { data: community, isPending } = useQuery({
    ...convexQuery(api.communities.getCommunityBySlug, { slug }),
    enabled: !!slug,
  });

  const detail = community as CommunityDetail | null | undefined;
  const canEdit = canManage(detail?.viewerRole);
  const chapterOnlyMode = progressStyle === "chapters" && ignorePages;

  const { mutateAsync: createCommunityBook, isPending: createPending } =
    useMutation({
      mutationFn: useConvexMutation(api.communities.createCommunityBook),
      onSuccess: () => {
        if (!detail) return;
        queryClient.invalidateQueries({
          queryKey: convexQuery(api.communities.getCommunityBooks, {
            communityId: detail._id,
          }).queryKey,
        });
        router.push(`/communities/${detail.slug}`);
      },
    });

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!detail || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    const parsedTotalPages = Number(totalPages);
    const parsedTotalChapters = Number(totalChapters);

    if (
      !chapterOnlyMode &&
      (!totalPages || !Number.isFinite(parsedTotalPages) || parsedTotalPages < 1)
    ) {
      setError("Enter a valid total pages count.");
      return;
    }

    if (
      progressStyle === "chapters" &&
      (!totalChapters ||
        !Number.isInteger(parsedTotalChapters) ||
        parsedTotalChapters < 1)
    ) {
      setError("Enter a valid total chapters count.");
      return;
    }

    let startDateValue = startDate;
    let endDateValue = endDate;
    let daysToReadValue: number | undefined;

    if (readingMode === "calendar") {
      if (!startDate || !endDate) {
        setError("Select both start and end dates.");
        return;
      }
      if (parseDateFromStorage(endDate) < parseDateFromStorage(startDate)) {
        setError("End date must be after or equal to start date.");
        return;
      }
      daysToReadValue =
        differenceInDays(parseDateFromStorage(endDate), parseDateFromStorage(startDate)) +
        1;
    } else {
      const days = Number(daysToRead);
      if (!Number.isInteger(days) || days < 1) {
        setError("Enter a valid number of days.");
        return;
      }
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = addDays(start, days - 1);
      startDateValue = formatDateForStorage(start);
      endDateValue = formatDateForStorage(end);
      daysToReadValue = days;
    }

    const start = parseDateFromStorage(startDateValue);
    const end = parseDateFromStorage(endDateValue);

    try {
      let coverImageStorageId: string | undefined;
      if (coverFile) {
        const uploadUrl = await generateUploadUrl({});
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": coverFile.type },
          body: coverFile,
        });
        if (!response.ok) throw new Error("Cover image upload failed.");
        const uploaded = await response.json();
        coverImageStorageId = uploaded.storageId;
      }

      await createCommunityBook({
        coverImageStorageId:
          coverImageStorageId as Id<"_storage"> | undefined,
        communityId: detail._id,
        name,
        author: author.trim() || undefined,
        totalPages:
          !chapterOnlyMode && totalPages ? parsedTotalPages : undefined,
        totalChapters:
          progressStyle === "chapters" ? parsedTotalChapters : undefined,
        progressStyle,
        ignorePages: progressStyle === "chapters" ? ignorePages : false,
        readingMode,
        startMonth: MONTHS[start.getMonth()],
        endMonth: MONTHS[end.getMonth()],
        startYear: start.getFullYear(),
        endYear: end.getFullYear(),
        daysToRead: daysToReadValue,
        startDate: startDateValue,
        endDate: endDateValue,
      });
    } catch (caught) {
      setIsSubmitting(false);
      setError(
        caught instanceof Error ? caught.message : "Unable to add community book."
      );
    }
  };

  const totalDays =
    startDate && endDate && parseDateFromStorage(endDate) >= parseDateFromStorage(startDate)
      ? differenceInDays(parseDateFromStorage(endDate), parseDateFromStorage(startDate)) + 1
      : null;
  const pagesPerDay =
    totalDays && totalPages && !chapterOnlyMode
      ? calculateDailyPages(Number(totalPages), totalDays)
      : null;

  return (
    <>
      <Navigation />
      <main className="mx-auto max-w-3xl p-3 sm:p-6">
        <Button variant="ghost" asChild className="mb-4">
          <Link href={detail ? `/communities/${detail.slug}` : "/communities"}>
            <ArrowLeft className="h-4 w-4" />
            Community
          </Link>
        </Button>

        {isPending ? (
          <Card className="p-6 text-muted-foreground">Loading community...</Card>
        ) : !detail ? (
          <Card className="p-6 text-center text-muted-foreground">
            Community not found.
          </Card>
        ) : !canEdit ? (
          <Card className="p-6 text-center sm:p-10">
            <h1 className="text-2xl font-bold text-foreground">
              Admin or moderator access required
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Only owners, admins, and moderators can add shared books to this
              community.
            </p>
          </Card>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-foreground sm:text-4xl">
                Add Community Book
              </h1>
              <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                Create a shared reading plan for {detail.name}. Members will see
                it inside the community.
              </p>
            </div>

            <Card className="p-5 sm:p-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2 sm:col-span-2">
                    <span className="text-sm font-medium text-foreground">
                      Book name
                    </span>
                    <Input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      required
                    />
                  </label>

                  <label className="space-y-2 sm:col-span-2">
                    <span className="text-sm font-medium text-foreground">
                      Author <span className="text-muted-foreground">(optional)</span>
                    </span>
                    <Input
                      value={author}
                      onChange={(event) => setAuthor(event.target.value)}
                      placeholder="e.g., Octavia Butler"
                    />
                  </label>

                  <div className="space-y-2 sm:col-span-2">
                    <span className="text-sm font-medium text-foreground">
                      Cover image{" "}
                      <span className="text-muted-foreground">(optional)</span>
                    </span>
                    <div className="flex items-center gap-4">
                      {coverPreviewUrl ? (
                        <div className="relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={coverPreviewUrl}
                            alt="Cover preview"
                            className="h-28 w-20 rounded-md border border-border object-cover"
                          />
                          <button
                            type="button"
                            aria-label="Remove cover image"
                            className="absolute -right-2 -top-2 rounded-full border border-border bg-background p-1 text-muted-foreground shadow-sm hover:text-foreground"
                            onClick={() => {
                              setCoverFile(null);
                              if (coverPreviewUrl)
                                URL.revokeObjectURL(coverPreviewUrl);
                              setCoverPreviewUrl(null);
                              if (coverInputRef.current)
                                coverInputRef.current.value = "";
                            }}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex h-28 w-20 items-center justify-center rounded-md border border-dashed border-border bg-muted/40">
                          <ImagePlus className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                      <div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => coverInputRef.current?.click()}
                        >
                          {coverFile ? "Change image" : "Choose image"}
                        </Button>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Shown in the community library.
                        </p>
                      </div>
                      <input
                        ref={coverInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null;
                          if (coverPreviewUrl)
                            URL.revokeObjectURL(coverPreviewUrl);
                          setCoverFile(file);
                          setCoverPreviewUrl(
                            file ? URL.createObjectURL(file) : null
                          );
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <span className="text-sm font-medium text-foreground">
                      How members will log reading
                    </span>
                    <div className="flex flex-wrap gap-4 text-sm text-foreground">
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="progressStyle"
                          value="pages"
                          checked={progressStyle === "pages"}
                          onChange={() => setProgressStyle("pages")}
                        />
                        Page-based
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="progressStyle"
                          value="chapters"
                          checked={progressStyle === "chapters"}
                          onChange={() => setProgressStyle("chapters")}
                        />
                        Chapter-based
                      </label>
                    </div>
                  </div>

                  {progressStyle === "chapters" && (
                    <label className="flex items-center gap-2 sm:col-span-2">
                      <input
                        type="checkbox"
                        checked={ignorePages}
                        onChange={(event) => setIgnorePages(event.target.checked)}
                      />
                      <span className="text-sm text-foreground">
                        Ignore pages completely
                      </span>
                    </label>
                  )}

                  {!chapterOnlyMode && (
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-foreground">
                        Total pages
                      </span>
                      <Input
                        type="number"
                        min={1}
                        value={totalPages}
                        onChange={(event) => setTotalPages(event.target.value)}
                        required
                      />
                    </label>
                  )}

                  {progressStyle === "chapters" && (
                    <label className="space-y-2">
                      <span className="text-sm font-medium text-foreground">
                        Total chapters
                      </span>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={totalChapters}
                        onChange={(event) => setTotalChapters(event.target.value)}
                        required
                      />
                    </label>
                  )}

                  <div className="space-y-2 sm:col-span-2">
                    <span className="text-sm font-medium text-foreground">
                      Reading plan
                    </span>
                    <div className="flex flex-wrap gap-4 text-sm text-foreground">
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="readingMode"
                          value="calendar"
                          checked={readingMode === "calendar"}
                          onChange={() => setReadingMode("calendar")}
                        />
                        Calendar dates
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="readingMode"
                          value="fixed-days"
                          checked={readingMode === "fixed-days"}
                          onChange={() => setReadingMode("fixed-days")}
                        />
                        Fixed number of days
                      </label>
                    </div>
                  </div>

                  {readingMode === "calendar" ? (
                    <>
                      <label className="space-y-2">
                        <span className="text-sm font-medium text-foreground">
                          Start date
                        </span>
                        <Input
                          type="date"
                          value={startDate}
                          onChange={(event) => setStartDate(event.target.value)}
                          required
                        />
                      </label>
                      <label className="space-y-2">
                        <span className="text-sm font-medium text-foreground">
                          End date
                        </span>
                        <Input
                          type="date"
                          value={endDate}
                          onChange={(event) => setEndDate(event.target.value)}
                          required
                        />
                      </label>
                    </>
                  ) : (
                    <label className="space-y-2 sm:col-span-2">
                      <span className="text-sm font-medium text-foreground">
                        Number of days
                      </span>
                      <Input
                        type="number"
                        min={1}
                        value={daysToRead}
                        onChange={(event) => setDaysToRead(event.target.value)}
                        required
                      />
                    </label>
                  )}
                </div>

                {pagesPerDay !== null && (
                  <p className="rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
                    This plan works out to{" "}
                    <span className="font-medium text-foreground">
                      {pagesPerDay.toFixed(1)} pages per day
                    </span>
                    .
                  </p>
                )}

                {error && (
                  <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                  </p>
                )}

                <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" asChild>
                    <Link href={`/communities/${detail.slug}`}>Cancel</Link>
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Adding..." : "Add Community Book"}
                  </Button>
                </div>
              </form>
            </Card>
          </>
        )}
      </main>
    </>
  );
}
