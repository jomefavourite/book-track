"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { format } from "date-fns";
import {
  BookOpen,
  CalendarRange,
  Check,
  Crown,
  Lock,
  Pencil,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toUserMessage } from "@/lib/errorMessage";
import { trackActionFailed, trackEvent } from "@/lib/analytics";

type PlanItem = {
  _id: Id<"plannedBooks">;
  year: number;
  month: number | null;
  title: string;
  author: string | null;
  totalPages: number | null;
  note: string | null;
  isPublic: boolean;
  isBookOfTheYear: boolean;
  status: "planned" | "reading" | "finished";
  progress: number;
  bookId: Id<"books"> | null;
  isTracked: boolean;
};

type DialogState =
  | { mode: "add"; year: number; month: number | null }
  | { mode: "edit"; item: PlanItem }
  | null;

const MONTHS = Array.from({ length: 12 }, (_, index) => ({
  value: index + 1,
  short: format(new Date(2000, index, 1), "MMM"),
  long: format(new Date(2000, index, 1), "MMMM"),
}));

function errorText(error: unknown) {
  const data = (error as { data?: unknown } | null)?.data;
  return typeof data === "string" ? data : toUserMessage(error);
}

/** A stable, pleasant colour per title so books are easy to tell apart. */
function spineColor(title: string) {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  }
  return `oklch(0.68 0.12 ${hash % 360})`;
}

function BookSpine({ title, className }: { title: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative flex shrink-0 items-end justify-center overflow-hidden rounded-[3px] text-[10px] font-bold uppercase text-white shadow-sm",
        className
      )}
      style={{ backgroundColor: spineColor(title) }}
    >
      <span className="absolute inset-y-0 left-0 w-[3px] bg-black/15" />
      <span className="mb-1">{title.trim().charAt(0)}</span>
    </span>
  );
}

function StatusBadge({ item }: { item: PlanItem }) {
  if (item.status === "finished") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
        <Check className="h-3 w-3" />
        Finished
      </span>
    );
  }
  if (item.status === "reading") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300">
        Reading · {item.progress}%
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      Planned
    </span>
  );
}

function PlanChip({
  item,
  isOwner,
  onEdit,
}: {
  item: PlanItem;
  isOwner: boolean;
  onEdit: (item: PlanItem) => void;
}) {
  const body = (
    <>
      <BookSpine title={item.title} className="h-10 w-7" />
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-1">
          <span className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
            {item.title}
          </span>
          {item.isBookOfTheYear && (
            <Crown
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500"
              aria-label="Book of the year"
            />
          )}
        </span>
        {item.author && (
          <span className="block truncate text-xs text-muted-foreground">
            {item.author}
          </span>
        )}
        <span className="mt-1 flex flex-wrap items-center gap-1">
          <StatusBadge item={item} />
          {isOwner && !item.isPublic && (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
              <Lock className="h-2.5 w-2.5" />
              Private
            </span>
          )}
        </span>
      </span>
    </>
  );

  const className =
    "flex w-full items-start gap-2.5 rounded-md p-1.5 text-left transition-colors";

  if (isOwner) {
    return (
      <button
        type="button"
        onClick={() => onEdit(item)}
        className={cn(className, "hover:bg-muted/70")}
      >
        {body}
      </button>
    );
  }
  if (item.bookId) {
    return (
      <Link
        href={`/books/${item.bookId}`}
        className={cn(className, "hover:bg-muted/70")}
      >
        {body}
      </Link>
    );
  }
  return <div className={className}>{body}</div>;
}

function MonthTile({
  label,
  items,
  isOwner,
  isCurrent,
  isPast,
  onAdd,
  onEdit,
  className,
}: {
  label: string;
  items: PlanItem[];
  isOwner: boolean;
  isCurrent: boolean;
  isPast: boolean;
  onAdd: () => void;
  onEdit: (item: PlanItem) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border bg-card p-2.5 transition-colors",
        isCurrent
          ? "border-foreground/40 shadow-sm"
          : "border-border",
        isPast && items.length === 0 && "opacity-60",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold text-foreground">{label}</h4>
          {isCurrent && (
            <span className="rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background">
              Now
            </span>
          )}
          {items.length > 0 && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {items.length}
            </span>
          )}
        </div>
        {isOwner && (
          <button
            type="button"
            onClick={onAdd}
            aria-label={`Add a book to ${label}`}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
      {items.length > 0 ? (
        <ul className="mt-1.5 space-y-0.5">
          {items.map((item) => (
            <li key={item._id}>
              <PlanChip item={item} isOwner={isOwner} onEdit={onEdit} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="hidden px-1 pb-1 pt-2 text-xs text-muted-foreground sm:block">
          Nothing planned
        </p>
      )}
    </div>
  );
}

function BookOfTheYear({
  year,
  pick,
  candidates,
  isOwner,
  onEdit,
  onCrown,
  onAdd,
}: {
  year: number;
  pick: PlanItem | undefined;
  candidates: PlanItem[];
  isOwner: boolean;
  onEdit: (item: PlanItem) => void;
  onCrown: (item: PlanItem) => void;
  onAdd: () => void;
}) {
  if (pick) {
    return (
      <div className="relative flex items-center gap-4 overflow-hidden rounded-lg border border-amber-300/60 bg-gradient-to-br from-amber-50 to-orange-50 p-4 dark:border-amber-500/30 dark:from-amber-500/10 dark:to-orange-500/5">
        <BookSpine title={pick.title} className="h-20 w-14 text-base" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            <Crown className="h-3.5 w-3.5" />
            Book of the year {year}
          </p>
          <p className="mt-1 line-clamp-2 text-lg font-bold leading-tight text-foreground">
            {pick.title}
          </p>
          {pick.author && (
            <p className="truncate text-sm text-muted-foreground">
              {pick.author}
            </p>
          )}
          <div className="mt-2">
            <StatusBadge item={pick} />
          </div>
        </div>
        {isOwner && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 self-start rounded-full"
            aria-label="Edit book of the year"
            onClick={() => onEdit(pick)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  }

  if (!isOwner) return null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-amber-400/60 bg-amber-50/40 p-4 dark:border-amber-500/30 dark:bg-amber-500/5 sm:flex-row sm:items-center">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300">
        <Crown className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">
          Book of the year {year}
        </p>
        <p className="text-xs text-muted-foreground">
          {candidates.length > 0
            ? "Crown the one book that defines your reading this year."
            : "Add a book to this year, then crown your favourite."}
        </p>
      </div>
      {candidates.length > 0 ? (
        <Select
          onValueChange={(id) => {
            const item = candidates.find((candidate) => candidate._id === id);
            if (item) onCrown(item);
          }}
        >
          <SelectTrigger className="h-9 w-full sm:w-56">
            <SelectValue placeholder="Choose a book" />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((item) => (
              <SelectItem key={item._id} value={item._id}>
                {item.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Button size="sm" variant="outline" onClick={onAdd} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Add a book
        </Button>
      )}
    </div>
  );
}

function PlanDialog({
  state,
  yearOptions,
  onClose,
}: {
  state: Exclude<DialogState, null>;
  yearOptions: number[];
  onClose: () => void;
}) {
  const router = useRouter();
  const editing = state.mode === "edit" ? state.item : null;

  const [title, setTitle] = useState(editing?.title ?? "");
  const [author, setAuthor] = useState(editing?.author ?? "");
  const [pages, setPages] = useState(editing?.totalPages?.toString() ?? "");
  const [note, setNote] = useState(editing?.note ?? "");
  const [year, setYear] = useState(editing?.year ?? (state.mode === "add" ? state.year : new Date().getFullYear()));
  const [month, setMonth] = useState<number | null>(
    editing ? editing.month : state.mode === "add" ? state.month : null
  );
  const [isPublic, setIsPublic] = useState(editing?.isPublic ?? true);
  const [isBookOfTheYear, setIsBookOfTheYear] = useState(
    editing?.isBookOfTheYear ?? false
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addPlan = useMutation({
    mutationFn: useConvexMutation(api.readingPlans.addPlannedBook),
  });
  const updatePlan = useMutation({
    mutationFn: useConvexMutation(api.readingPlans.updatePlannedBook),
  });
  const deletePlan = useMutation({
    mutationFn: useConvexMutation(api.readingPlans.deletePlannedBook),
  });
  const busy = addPlan.isPending || updatePlan.isPending || deletePlan.isPending;

  // Let people plan a few years ahead (and fix older plans) from the dialog.
  const years = useMemo(() => {
    const set = new Set(yearOptions);
    const now = new Date().getFullYear();
    for (let y = now - 1; y <= now + 5; y++) set.add(y);
    set.add(year);
    return Array.from(set).sort((a, b) => a - b);
  }, [yearOptions, year]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const trimmedPages = pages.trim();
    const totalPages = trimmedPages ? Number(trimmedPages) : null;
    if (totalPages !== null && (!Number.isInteger(totalPages) || totalPages <= 0)) {
      setError("Pages must be a whole number above zero.");
      return;
    }
    const nowYear = new Date().getFullYear();
    try {
      if (editing) {
        await updatePlan.mutateAsync({
          id: editing._id,
          year,
          month,
          title,
          author: author || null,
          totalPages,
          note: note || null,
          isPublic,
          isBookOfTheYear,
        });
        trackEvent("plan_book_updated", {
          year,
          moved: year !== editing.year || month !== editing.month,
          is_public: isPublic,
        });
        if (isBookOfTheYear && !editing.isBookOfTheYear) {
          trackEvent("book_of_the_year_set", { year, source: "dialog" });
        }
      } else {
        await addPlan.mutateAsync({
          year,
          month: month ?? undefined,
          title,
          author: author || undefined,
          totalPages: totalPages ?? undefined,
          note: note || undefined,
          isPublic,
          isBookOfTheYear,
        });
        // Are people planning ahead? years_ahead: 0 = this year, 1 = next year…
        trackEvent("plan_book_added", {
          year,
          years_ahead: year - nowYear,
          has_month: month !== null,
          has_pages: totalPages !== null,
          is_public: isPublic,
          book_of_the_year: isBookOfTheYear,
        });
        if (isBookOfTheYear) {
          trackEvent("book_of_the_year_set", { year, source: "dialog" });
        }
      }
      onClose();
    } catch (err) {
      trackActionFailed(editing ? "plan_book_update" : "plan_book_add", err);
      setError(errorText(err));
    }
  };

  const handleDelete = async () => {
    if (!editing) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      await deletePlan.mutateAsync({ id: editing._id });
      trackEvent("plan_book_deleted", {
        year: editing.year,
        status: editing.status,
      });
      onClose();
    } catch (err) {
      trackActionFailed("plan_book_delete", err);
      setError(errorText(err));
    }
  };

  return (
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{editing ? "Edit planned book" : "Plan a book"}</DialogTitle>
        <DialogDescription>
          {editing
            ? "Move it to another month, crown it, or start tracking it."
            : "Add a book you want to read and pick when."}
        </DialogDescription>
      </DialogHeader>

      {editing && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/60 p-2.5">
          <StatusBadge item={editing} />
          <span className="flex-1" />
          {editing.bookId ? (
            <Button asChild size="sm" variant="outline" className="h-8 gap-1.5">
              <Link href={`/books/${editing.bookId}`}>
                <BookOpen className="h-4 w-4" />
                Open book
              </Link>
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => router.push(`/books/new?plan=${editing._id}`)}
            >
              <Play className="h-3.5 w-3.5" />
              Start tracking
            </Button>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="plan-title" className="text-sm font-medium">
            Title
          </label>
          <Input
            id="plan-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Things Fall Apart"
            maxLength={200}
            required
            autoFocus={!editing}
          />
        </div>

        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <div className="space-y-1.5">
            <label htmlFor="plan-author" className="text-sm font-medium">
              Author <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Input
              id="plan-author"
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
              placeholder="Chinua Achebe"
              maxLength={200}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="plan-pages" className="text-sm font-medium">
              Pages
            </label>
            <Input
              id="plan-pages"
              inputMode="numeric"
              value={pages}
              onChange={(event) =>
                setPages(event.target.value.replace(/[^0-9]/g, ""))
              }
              placeholder="209"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <span className="text-sm font-medium">Month</span>
            <Select
              value={month === null ? "any" : String(month)}
              onValueChange={(value) =>
                setMonth(value === "any" ? null : Number(value))
              }
            >
              <SelectTrigger aria-label="Month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any time</SelectItem>
                {MONTHS.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.long}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <span className="text-sm font-medium">Year</span>
            <Select
              value={String(year)}
              onValueChange={(value) => setYear(Number(value))}
            >
              <SelectTrigger aria-label="Year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="plan-note" className="text-sm font-medium">
            Why this book? <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <textarea
            id="plan-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Recommended by Tolu · book club pick…"
            className="flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>

        <div className="space-y-2">
          <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-2.5">
            <input
              type="checkbox"
              checked={isBookOfTheYear}
              onChange={(event) => setIsBookOfTheYear(event.target.checked)}
              className="h-4 w-4 accent-amber-500"
            />
            <Crown className="h-4 w-4 text-amber-500" />
            <span className="text-sm">
              Book of the year {year}
              <span className="block text-xs text-muted-foreground">
                Replaces any other pick for {year}.
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border p-2.5">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(event) => setIsPublic(event.target.checked)}
              className="h-4 w-4 accent-foreground"
            />
            <span className="text-sm">
              Show on my public profile
              <span className="block text-xs text-muted-foreground">
                Visitors only see books you make public.
              </span>
            </span>
          </label>
        </div>

        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter className="flex-row items-center gap-2 sm:justify-between sm:space-x-0">
          {editing ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={handleDelete}
              className={cn(
                "mr-auto gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive",
                confirmDelete && "bg-destructive/10"
              )}
            >
              <Trash2 className="h-4 w-4" />
              {confirmDelete ? "Confirm delete" : "Delete"}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !title.trim()}>
              {editing ? "Save" : "Add to plan"}
            </Button>
          </div>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

export default function ReadingPlan({
  profileUserId,
  isOwnProfile,
}: {
  profileUserId: string;
  isOwnProfile: boolean;
}) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const { data, isPending } = useQuery({
    ...convexQuery(api.readingPlans.getReadingPlan, { profileUserId }),
    enabled: !!profileUserId,
  });
  const items = useMemo(() => (data ?? []) as PlanItem[], [data]);

  const setBookOfTheYear = useMutation({
    mutationFn: useConvexMutation(api.readingPlans.setBookOfTheYear),
  });

  const [year, setYear] = useState(currentYear);
  const [dialog, setDialog] = useState<DialogState>(null);

  const yearOptions = useMemo(() => {
    const set = new Set(items.map((item) => item.year));
    if (isOwnProfile) {
      set.add(currentYear);
      set.add(currentYear + 1);
    }
    if (set.size === 0) set.add(currentYear);
    return Array.from(set).sort((a, b) => a - b);
  }, [items, isOwnProfile, currentYear]);

  // Visitors land on the nearest year that actually has books.
  const activeYear = yearOptions.includes(year)
    ? year
    : yearOptions.find((option) => option >= currentYear) ??
      yearOptions[yearOptions.length - 1];

  const yearItems = items.filter((item) => item.year === activeYear);
  const anytime = yearItems.filter((item) => item.month === null);
  const pick = yearItems.find((item) => item.isBookOfTheYear);
  const finished = yearItems.filter((item) => item.status === "finished").length;
  const reading = yearItems.filter((item) => item.status === "reading").length;
  const percent = yearItems.length
    ? Math.round((finished / yearItems.length) * 100)
    : 0;

  if (!isOwnProfile && !isPending && items.length === 0) return null;

  const openAdd = (month: number | null) =>
    setDialog({ mode: "add", year: activeYear, month });
  const openEdit = (item: PlanItem) => setDialog({ mode: "edit", item });

  return (
    <section aria-labelledby="reading-plan-heading">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            id="reading-plan-heading"
            className="flex items-center gap-2 text-lg font-semibold text-foreground"
          >
            <CalendarRange className="h-5 w-5 text-muted-foreground" />
            Reading plan
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {isOwnProfile
              ? "Line up the books you want to read, month by month."
              : "Books lined up to read, month by month."}
          </p>
        </div>
        <div className="flex max-w-full items-center gap-2">
          <div
            role="radiogroup"
            aria-label="Plan year"
            className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {yearOptions.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={option === activeYear}
                onClick={() => setYear(option)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  option === activeYear
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                {option}
              </button>
            ))}
          </div>
          {isOwnProfile && (
            <Button
              size="sm"
              className="h-8 shrink-0 gap-1.5 rounded-full"
              onClick={() => openAdd(null)}
            >
              <Plus className="h-4 w-4" />
              Add book
            </Button>
          )}
        </div>
      </div>

      <Card className="space-y-4 p-3 sm:p-5">
        {isPending ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="h-24 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <BookOfTheYear
                year={activeYear}
                pick={pick}
                candidates={yearItems}
                isOwner={isOwnProfile}
                onEdit={openEdit}
                onCrown={(item) => {
                  setBookOfTheYear.mutate({ id: item._id, value: true });
                  trackEvent("book_of_the_year_set", {
                    year: item.year,
                    source: "picker",
                  });
                }}
                onAdd={() => openAdd(null)}
              />
              <div className="flex flex-col justify-center rounded-lg border border-border p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    {yearItems.length === 0
                      ? `No books planned for ${activeYear}`
                      : `${finished} of ${yearItems.length} finished`}
                  </p>
                  {yearItems.length > 0 && (
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {percent}%
                    </span>
                  )}
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-[width]"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {reading > 0
                    ? `${reading} in progress · ${yearItems.length - finished - reading} still to start`
                    : yearItems.length > 0
                      ? `${yearItems.length - finished} still to start`
                      : isOwnProfile
                        ? "Tap + on a month to start planning."
                        : ""}
                </p>
              </div>
            </div>

            {anytime.length > 0 && (
              <MonthTile
                label={`Any time in ${activeYear}`}
                items={anytime}
                isOwner={isOwnProfile}
                isCurrent={false}
                isPast={false}
                onAdd={() => openAdd(null)}
                onEdit={openEdit}
                className="border-dashed"
              />
            )}

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {MONTHS.map((month) => {
                const monthItems = yearItems.filter(
                  (item) => item.month === month.value
                );
                const isCurrent =
                  activeYear === currentYear && month.value === currentMonth;
                const isPast =
                  activeYear < currentYear ||
                  (activeYear === currentYear && month.value < currentMonth);
                if (!isOwnProfile && monthItems.length === 0) {
                  return (
                    <div
                      key={month.value}
                      className="hidden rounded-lg border border-border p-2.5 opacity-60 sm:block"
                    >
                      <h4 className="px-1 text-sm font-semibold text-foreground">
                        {month.long}
                      </h4>
                      <p className="px-1 pt-2 text-xs text-muted-foreground">
                        Nothing planned
                      </p>
                    </div>
                  );
                }
                return (
                  <MonthTile
                    key={month.value}
                    label={month.long}
                    items={monthItems}
                    isOwner={isOwnProfile}
                    isCurrent={isCurrent}
                    isPast={isPast}
                    onAdd={() => openAdd(month.value)}
                    onEdit={openEdit}
                  />
                );
              })}
            </div>
          </>
        )}
      </Card>

      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        {dialog && (
          <PlanDialog
            key={dialog.mode === "edit" ? dialog.item._id : `add-${dialog.month}`}
            state={dialog}
            yearOptions={yearOptions}
            onClose={() => setDialog(null)}
          />
        )}
      </Dialog>
    </section>
  );
}

/**
 * Compact plan summary for the profile's Overview tab: this year's book of the
 * year plus the next few books still to read. The full calendar lives on the
 * profile's Plan tab (`onOpenPlan`).
 */
export function ReadingPlanPreview({
  profileUserId,
  isOwnProfile,
  onOpenPlan,
  className,
}: {
  profileUserId: string;
  isOwnProfile: boolean;
  onOpenPlan: () => void;
  className?: string;
}) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const { data, isPending } = useQuery({
    ...convexQuery(api.readingPlans.getReadingPlan, { profileUserId }),
    enabled: !!profileUserId,
  });
  const items = (data ?? []) as PlanItem[];

  if (!isOwnProfile && !isPending && items.length === 0) return null;

  const pick =
    items.find((item) => item.isBookOfTheYear && item.year === currentYear) ??
    items.find((item) => item.isBookOfTheYear && item.year > currentYear);

  // Not finished, and not scheduled for a month that has already passed.
  const upNext = items
    .filter(
      (item) =>
        item.status !== "finished" &&
        item._id !== pick?._id &&
        (item.year > currentYear ||
          (item.year === currentYear &&
            (item.month === null || item.month >= currentMonth)))
    )
    .slice(0, 3);

  const whenLabel = (item: PlanItem) =>
    item.month === null
      ? `Any time ${item.year}`
      : `${MONTHS[item.month - 1].short} ${item.year}`;

  return (
    <Card className={cn("flex flex-col p-4 sm:p-5", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <CalendarRange className="h-4 w-4 text-muted-foreground" />
          Reading plan
        </h3>
        <button
          type="button"
          onClick={onOpenPlan}
          className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {isOwnProfile ? "Open plan →" : "See plan →"}
        </button>
      </div>

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-12 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-1 flex-col items-start justify-center gap-3 rounded-lg border border-dashed border-border p-4">
          <p className="text-sm text-muted-foreground">
            Line up the books you want to read next, month by month, and crown
            a book of the year.
          </p>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onOpenPlan}>
            <Plus className="h-4 w-4" />
            Start planning
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {pick && (
            <div className="flex items-center gap-3 rounded-lg border border-amber-300/60 bg-gradient-to-br from-amber-50 to-orange-50 p-3 dark:border-amber-500/30 dark:from-amber-500/10 dark:to-orange-500/5">
              <BookSpine title={pick.title} className="h-12 w-9" />
              <div className="min-w-0">
                <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                  <Crown className="h-3 w-3" />
                  Book of the year {pick.year}
                </p>
                <p className="truncate text-sm font-semibold text-foreground">
                  {pick.title}
                </p>
                {pick.author && (
                  <p className="truncate text-xs text-muted-foreground">
                    {pick.author}
                  </p>
                )}
              </div>
            </div>
          )}

          {upNext.length > 0 ? (
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Up next
              </p>
              <ul className="divide-y divide-border">
                {upNext.map((item) => (
                  <li key={item._id} className="flex items-center gap-3 py-2">
                    <BookSpine title={item.title} className="h-9 w-6" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {item.title}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[item.author, whenLabel(item)].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <StatusBadge item={item} />
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            !pick && (
              <p className="text-sm text-muted-foreground">
                Everything planned so far is done.
              </p>
            )
          )}
        </div>
      )}
    </Card>
  );
}
