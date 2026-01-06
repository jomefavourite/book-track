"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useConvexMutation, convexQuery } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";
import { format, isSameMonth, addDays, eachDayOfInterval, differenceInDays } from "date-fns";
import {
  MONTHS,
  getDateRangeForMonths,
  getMonthDateRange,
  formatDateForStorage,
  parseDateFromStorage,
} from "@/lib/dateUtils";
import {
  generateReadingOptions,
  calculateDailyPages,
  calculateDaysInMonthRangeForBook,
  distributePagesAcrossDays,
} from "@/lib/readingCalculator";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { Button } from "@/components/ui/button";
import { Id } from "@/convex/_generated/dataModel";
import { useEffect } from "react";
import DatePicker from "@/components/DatePicker";

interface BookFormProps {
  book?: {
    _id: Id<"books">;
    name: string;
    author?: string;
    totalPages: number;
    readingMode: "calendar" | "fixed-days";
    startDate: string;
    endDate: string;
    startMonth?: string;
    endMonth?: string;
    startYear?: number;
    endYear?: number;
    daysToRead?: number;
    isPublic?: boolean;
    showCreatorName?: boolean;
    showCreatorEmail?: boolean;
    creatorName?: string;
    creatorEmail?: string;
  };
}

export default function BookForm({ book: initialBook }: BookFormProps = {}) {
  const isEditMode = !!initialBook;
  const router = useRouter();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const { mutateAsync: createBook } = useMutation({
    mutationFn: useConvexMutation(api.books.createBook),
    onSuccess: () => {
      // Invalidate and refetch the books list query
      if (user?.id) {
        queryClient.invalidateQueries({
          queryKey: convexQuery(api.books.getBooks, { userId: user.id })
            .queryKey,
        });
        queryClient.invalidateQueries({
          queryKey: convexQuery(api.books.getArchivedBooks, { userId: user.id })
            .queryKey,
        });
      }
    },
  });
  const { mutateAsync: updateBook } = useMutation({
    mutationFn: useConvexMutation(api.books.updateBook),
    onSuccess: () => {
      if (user?.id && initialBook) {
        queryClient.invalidateQueries({
          queryKey: convexQuery(api.books.getBooks, { userId: user.id })
            .queryKey,
        });
        queryClient.invalidateQueries({
          queryKey: convexQuery(api.books.getArchivedBooks, { userId: user.id })
            .queryKey,
        });
        queryClient.invalidateQueries({
          queryKey: convexQuery(api.books.getBook, {
            bookId: initialBook._id,
            userId: user.id,
          }).queryKey,
        });
      }
    },
  });
  const [name, setName] = useState(initialBook?.name || "");
  const [author, setAuthor] = useState(initialBook?.author || "");
  const [totalPages, setTotalPages] = useState(
    initialBook?.totalPages.toString() || ""
  );
  const [readingMode, setReadingMode] = useState<"calendar" | "fixed-days">(
    initialBook?.readingMode || "calendar"
  );
  const currentMonthIndex = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  // Initialize start and end dates from initialBook or defaults
  const getInitialStartDate = (): Date => {
    if (initialBook?.startDate) {
      return parseDateFromStorage(initialBook.startDate);
    }
    return new Date();
  };

  const getInitialEndDate = (): Date | null => {
    if (initialBook?.endDate) {
      return parseDateFromStorage(initialBook.endDate);
    }
    // No default end date - user must select it
    return null;
  };

  const [startDate, setStartDate] = useState<Date | null>(getInitialStartDate());
  const [endDate, setEndDate] = useState<Date | null>(getInitialEndDate());

  // Keep month/year for backward compatibility and derived values
  const defaultStartMonth =
    initialBook?.startMonth || MONTHS[currentMonthIndex];
  const defaultStartYear = initialBook?.startYear || currentYear;
  const defaultEndMonth = initialBook?.endMonth || defaultStartMonth;
  const defaultEndYear = initialBook?.endYear || defaultStartYear;

  const [startMonth, setStartMonth] = useState(defaultStartMonth);
  const [startYear, setStartYear] = useState(defaultStartYear);
  const [endMonth, setEndMonth] = useState(defaultEndMonth);
  const [endYear, setEndYear] = useState(defaultEndYear);
  const [daysToRead, setDaysToRead] = useState(
    initialBook?.daysToRead?.toString() || ""
  );
  const [selectedDays, setSelectedDays] = useState<number | null>(null);
  const [customDays, setCustomDays] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [autoSelectedDays, setAutoSelectedDays] = useState<number | null>(null);
  const [isPublic, setIsPublic] = useState(initialBook?.isPublic || false);
  const [showCreatorName, setShowCreatorName] = useState(
    initialBook?.showCreatorName || false
  );
  const [showCreatorEmail, setShowCreatorEmail] = useState(
    initialBook?.showCreatorEmail || false
  );

  // Show current year and next 10 years to cover future dates
  const years = Array.from({ length: 11 }, (_, i) => currentYear + i);

  // Calculate available months based on selected year
  const getAvailableMonths = (year: number) => {
    if (year > currentYear) return MONTHS; // Future year, all months available
    if (year < currentYear) return []; // Past year, no months available
    // Current year: only months from current month onwards
    return MONTHS.filter((_, index) => index >= currentMonthIndex);
  };

  // Calculate total days from selected dates
  const calculateTotalDays = (): number | null => {
    if (!startDate || !endDate) return null;
    if (endDate < startDate) return null;
    return differenceInDays(endDate, startDate) + 1; // +1 to include both start and end days
  };

  const totalDays = calculateTotalDays();

  // Update month/year when dates change (for backward compatibility)
  useEffect(() => {
    if (startDate) {
      const monthIndex = startDate.getMonth();
      setStartMonth(MONTHS[monthIndex]);
      setStartYear(startDate.getFullYear());
    }
  }, [startDate]);

  useEffect(() => {
    if (endDate) {
      const monthIndex = endDate.getMonth();
      setEndMonth(MONTHS[monthIndex]);
      setEndYear(endDate.getFullYear());
    }
  }, [endDate]);

  const readingOptions =
    totalPages && !isNaN(Number(totalPages))
      ? generateReadingOptions(Number(totalPages))
      : [];

  // Calculate pages per day based on current form state
  const calculateCurrentPagesPerDay = () => {
    if (!totalPages || isNaN(Number(totalPages))) {
      return null;
    }

    let days: number | undefined;
    if (readingMode === "fixed-days" && daysToRead && !isNaN(Number(daysToRead))) {
      days = Number(daysToRead);
    } else if (readingMode === "calendar" && totalDays !== null) {
      days = totalDays;
    }

    if (days && days > 0) {
      const pagesPerDay = calculateDailyPages(Number(totalPages), days);
      return { days, pagesPerDay };
    }
    return null;
  };

  const currentPagesInfo = calculateCurrentPagesPerDay();

  const handleModeChange = (mode: "calendar" | "fixed-days") => {
    setReadingMode(mode);
    setSelectedDays(null);
    setCustomDays("");
    setAutoSelectedDays(null);
  };

  // Helper function to check if start date is after end date
  const isStartAfterEnd = (
    startMonth: string,
    startYear: number,
    endMonth: string,
    endYear: number
  ) => {
    const startMonthIndex = MONTHS.indexOf(
      startMonth as (typeof MONTHS)[number]
    );
    const endMonthIndex = MONTHS.indexOf(endMonth as (typeof MONTHS)[number]);

    if (startYear > endYear) {
      return true;
    }
    if (startYear === endYear && startMonthIndex > endMonthIndex) {
      return true;
    }
    return false;
  };

  const handleStartMonthChange = (newStartMonth: string) => {
    setStartMonth(newStartMonth);
    // If start month is after end month, update end month and year to match start
    if (isStartAfterEnd(newStartMonth, startYear, endMonth, endYear)) {
      setEndMonth(newStartMonth);
      setEndYear(startYear);
    }
  };

  const handleStartYearChange = (newStartYear: number) => {
    setStartYear(newStartYear);
    // If start year/month is after end year/month, update end to match start
    if (isStartAfterEnd(startMonth, newStartYear, endMonth, endYear)) {
      setEndMonth(startMonth);
      setEndYear(newStartYear);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !totalPages || isNaN(Number(totalPages))) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (!user?.id) {
        alert("Please sign in to create a book");
        setIsSubmitting(false);
        return;
      }

      // Calculate dates and related values
      let startDateValue: string;
      let endDateValue: string;
      let daysToReadValue: number | undefined;
      let startMonthValue: string | undefined;
      let endMonthValue: string | undefined;
      let startYearValue: number | undefined;
      let endYearValue: number | undefined;

      if (readingMode === "calendar") {
        // Validate dates are selected
        if (!startDate || !endDate) {
          alert("Please select both start and end dates");
          setIsSubmitting(false);
          return;
        }

        // Validate end date is after or equal to start date
        if (endDate < startDate) {
          alert("End date must be after or equal to start date");
          setIsSubmitting(false);
          return;
        }

        startDateValue = formatDateForStorage(startDate);
        endDateValue = formatDateForStorage(endDate);

        // Calculate total days
        const days = differenceInDays(endDate, startDate) + 1;
        daysToReadValue = days;

        // Derive month/year values for backward compatibility
        startMonthValue = MONTHS[startDate.getMonth()];
        startYearValue = startDate.getFullYear();
        endMonthValue = MONTHS[endDate.getMonth()];
        endYearValue = endDate.getFullYear();
      } else {
        // Fixed days mode
        if (!daysToRead || isNaN(Number(daysToRead))) {
          alert("Please enter number of days");
          setIsSubmitting(false);
          return;
        }

        const days = Number(daysToRead);

        // Warn user if days exceed 365, but allow them to proceed
        if (days > 365) {
          const proceed = confirm(
            `You've entered ${days} days, which exceeds the recommended maximum of 365 days. This may result in very low daily page targets (${calculateDailyPages(Number(totalPages), days).toFixed(1)} pages/day).\n\nDo you want to continue?`
          );
          if (!proceed) {
            setIsSubmitting(false);
            return;
          }
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        startDateValue = formatDateForStorage(today);
        const end = new Date(today);
        end.setDate(end.getDate() + days - 1);
        endDateValue = formatDateForStorage(end);
        daysToReadValue = days;

        // Derive month/year values
        startMonthValue = MONTHS[today.getMonth()];
        startYearValue = today.getFullYear();
        endMonthValue = MONTHS[end.getMonth()];
        endYearValue = end.getFullYear();
      }

      const authorValue = author.trim() || undefined;

      if (isEditMode && initialBook) {
        // Update existing book with all fields
        await updateBook({
          bookId: initialBook._id,
          userId: user.id,
          name,
          author: authorValue,
          totalPages: Number(totalPages),
          readingMode,
          startDate: startDateValue,
          endDate: endDateValue,
          startMonth: startMonthValue,
          endMonth: endMonthValue,
          startYear: startYearValue,
          endYear: endYearValue,
          daysToRead: daysToReadValue,
          isPublic,
          showCreatorName: isPublic ? showCreatorName : false,
          showCreatorEmail: isPublic ? showCreatorEmail : false,
          creatorName:
            isPublic && showCreatorName
              ? user.fullName || undefined
              : undefined,
          creatorEmail:
            isPublic && showCreatorEmail
              ? user.primaryEmailAddress?.emailAddress || undefined
              : undefined,
        });

        router.push(`/books/${initialBook._id}`);
      } else {
        // Create new book
        const bookId = await createBook({
          userId: user.id,
          name,
          author: authorValue,
          totalPages: Number(totalPages),
          readingMode,
          startMonth: startMonthValue,
          endMonth: endMonthValue,
          startYear: startYearValue,
          endYear: endYearValue,
          daysToRead: daysToReadValue,
          startDate: startDateValue,
          endDate: endDateValue,
          isPublic,
          showCreatorName: isPublic ? showCreatorName : false,
          showCreatorEmail: isPublic ? showCreatorEmail : false,
          creatorName:
            isPublic && showCreatorName
              ? user.fullName || undefined
              : undefined,
          creatorEmail:
            isPublic && showCreatorEmail
              ? user.primaryEmailAddress?.emailAddress || undefined
              : undefined,
        });

        router.push(`/books/${bookId}`);
      }
    } catch (error) {
      console.error(
        `Error ${isEditMode ? "updating" : "creating"} book:`,
        error
      );
      alert(
        `Failed to ${isEditMode ? "update" : "create"} book. Please try again.`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-foreground">
          {isEditMode ? "Edit Book" : "Add New Book"}
        </h1>
        <ThemeSwitcher />
      </div>
      <form
        onSubmit={handleSubmit}
        className="space-y-6"
      >
        <div>
          <label className="block text-sm font-medium text-foreground">
            Book Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground">
            Author <span className="text-muted-foreground">(optional)</span>
          </label>
          <input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="e.g., J.K. Rowling"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground">
            Total Pages
          </label>
          <input
            type="number"
            value={totalPages}
            onChange={(e) => setTotalPages(e.target.value)}
            required
            min="1"
            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {currentPagesInfo && (
            <p className="mt-2 text-sm text-muted-foreground">
              With {currentPagesInfo.days} day
              {currentPagesInfo.days !== 1 ? "s" : ""} to read:{" "}
              <span className="font-medium text-foreground">
                {currentPagesInfo.pagesPerDay.toFixed(1)} pages per day
              </span>
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground">
            Reading Mode
          </label>
          <div className="mt-2 flex gap-4">
            <label className="flex items-center">
              <input
                type="radio"
                value="calendar"
                checked={readingMode === "calendar"}
                onChange={() => handleModeChange("calendar")}
                className="mr-2"
              />
              Calendar
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="fixed-days"
                checked={readingMode === "fixed-days"}
                onChange={() => handleModeChange("fixed-days")}
                className="mr-2"
              />
              Fixed Days
            </label>
          </div>
        </div>

        {readingMode === "calendar" && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <DatePicker
                selectedDate={startDate}
                onDateSelect={(date) => {
                  setStartDate(date);
                  // If end date is before new start date, update end date
                  if (endDate && date > endDate) {
                    setEndDate(date);
                  }
                }}
                allowPastDates={true}
                maxDate={endDate || undefined}
                label="Start Date"
              />
              <DatePicker
                selectedDate={endDate}
                onDateSelect={(date) => {
                  setEndDate(date);
                  // If start date is after new end date, update start date
                  if (startDate && date < startDate) {
                    setStartDate(date);
                  }
                }}
                allowPastDates={true}
                minDate={startDate || undefined}
                label="End Date"
              />
            </div>

            {startDate && endDate && (
              <div className="space-y-2 rounded-lg border border-border bg-muted p-4">
                {endDate < startDate ? (
                  <p className="text-sm font-medium text-destructive">
                    ⚠️ End date must be after or equal to start date
                  </p>
                ) : (
                  <>
                    <p className="text-sm font-medium text-foreground">
                      Reading Period: {format(startDate, "MMMM d, yyyy")} -{" "}
                      {format(endDate, "MMMM d, yyyy")}
                    </p>
                    {totalDays !== null && (
                      <>
                        <p className="text-sm text-muted-foreground">
                          Total days: <span className="font-medium text-foreground">{totalDays}</span>
                        </p>
                        {totalPages &&
                          !isNaN(Number(totalPages)) &&
                          totalDays > 0 && (
                            <p className="text-sm text-muted-foreground">
                              Pages per day:{" "}
                              <span className="font-medium text-foreground">
                                {calculateDailyPages(Number(totalPages), totalDays).toFixed(1)}
                              </span>
                            </p>
                          )}
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}

        {readingMode === "fixed-days" && (
          <div>
            <label className="block text-sm font-medium text-foreground">
              Number of Days
            </label>
            <input
              type="number"
              value={daysToRead}
              onChange={(e) => setDaysToRead(e.target.value)}
              required
              min="1"
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {daysToRead &&
              !isNaN(Number(daysToRead)) &&
              Number(daysToRead) > 365 && (
                <p className="mt-2 text-sm font-medium text-amber-600 dark:text-amber-500">
                  ⚠️ The recommended maximum is 365 days. You've entered{" "}
                  {daysToRead} days. This may result in very low daily page
                  targets.
                </p>
              )}
            {daysToRead &&
              !isNaN(Number(daysToRead)) &&
              totalPages &&
              !isNaN(Number(totalPages)) && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {calculateDailyPages(
                    Number(totalPages),
                    Number(daysToRead)
                  )}{" "}
                  pages per day
                </p>
              )}
          </div>
        )}

        <div className="rounded-lg border border-border bg-muted p-4">
          <h3 className="mb-4 text-lg font-semibold text-foreground">
            Visibility Settings
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm font-medium text-foreground">
                  Make this book public
                </label>
                <p className="text-xs text-muted-foreground">
                  Allow others to view your reading progress
                </p>
              </div>
              <label className="relative inline-flex cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => {
                    setIsPublic(e.target.checked);
                    if (!e.target.checked) {
                      setShowCreatorName(false);
                      setShowCreatorEmail(false);
                    }
                  }}
                  className="peer sr-only"
                />
                <div className="peer h-6 w-11 rounded-full bg-input after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-border after:bg-background after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-full peer-checked:after:border-primary"></div>
              </label>
            </div>

            {isPublic && (
              <div className="space-y-3 border-t border-border pt-3">
                <p className="text-sm font-medium text-foreground">
                  Creator Information (optional)
                </p>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={showCreatorName}
                      onChange={(e) => setShowCreatorName(e.target.checked)}
                      className="mr-2 rounded border-input text-foreground focus:ring-ring"
                    />
                    <span className="text-sm text-foreground">
                      Show my name on public book
                    </span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={showCreatorEmail}
                      onChange={(e) => setShowCreatorEmail(e.target.checked)}
                      className="mr-2 rounded border-input text-foreground focus:ring-ring"
                    />
                    <span className="text-sm text-foreground">
                      Show my email on public book
                    </span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="w-full"
        >
          {isSubmitting
            ? isEditMode
              ? "Updating..."
              : "Creating..."
            : isEditMode
              ? "Update Book"
              : "Create Book"}
        </Button>
      </form>
    </div>
  );
}
