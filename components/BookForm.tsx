"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useConvexMutation, convexQuery } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";
import { format, isSameMonth, addDays, eachDayOfInterval } from "date-fns";
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

  // Default to current month for start, and same month for end (or next month if start is December)
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

  // Calculate total available days in the selected month range
  const totalAvailableDays = calculateDaysInMonthRangeForBook(
    startMonth,
    startYear,
    endMonth,
    endYear
  );

  // Auto-select total days when month range changes and no manual selection exists
  useEffect(() => {
    if (
      !isEditMode &&
      readingMode === "calendar" &&
      !selectedDays &&
      !customDays &&
      totalPages &&
      !isNaN(Number(totalPages))
    ) {
      // Calculate actual available days based on start date
      const selectedStartRange = getMonthDateRange(startMonth, startYear);
      const firstDayOfSelectedMonth = selectedStartRange.start;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // If selected month is current month, start from today; otherwise use first day of month
      const actualStartDate = isSameMonth(firstDayOfSelectedMonth, today)
        ? today
        : firstDayOfSelectedMonth > today
          ? firstDayOfSelectedMonth
          : today;

      const selectedEndRange = getMonthDateRange(endMonth, endYear);
      const lastDayOfSelectedEndMonth = selectedEndRange.end;

      // Calculate actual available days from start date to end of end month using eachDayOfInterval for accuracy
      const daysArray = eachDayOfInterval({
        start: actualStartDate,
        end: lastDayOfSelectedEndMonth,
      });
      const actualAvailableDays = daysArray.length;

      setAutoSelectedDays(actualAvailableDays);
    } else {
      setAutoSelectedDays(null);
    }
  }, [
    startMonth,
    startYear,
    endMonth,
    endYear,
    totalPages,
    readingMode,
    selectedDays,
    customDays,
    isEditMode,
  ]);

  const readingOptions =
    totalPages && !isNaN(Number(totalPages))
      ? generateReadingOptions(Number(totalPages))
      : [];

  // Calculate pages per day for edit mode
  const calculateEditModePagesPerDay = () => {
    if (
      !isEditMode ||
      !initialBook ||
      !totalPages ||
      isNaN(Number(totalPages))
    ) {
      return null;
    }

    let days: number | undefined;
    if (initialBook.readingMode === "fixed-days" && initialBook.daysToRead) {
      days = initialBook.daysToRead;
    } else if (
      initialBook.readingMode === "calendar" &&
      initialBook.startDate &&
      initialBook.endDate
    ) {
      const start = parseDateFromStorage(initialBook.startDate);
      const end = parseDateFromStorage(initialBook.endDate);
      const timeDiff = end.getTime() - start.getTime();
      days = Math.ceil(timeDiff / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end days
    }

    if (days && days > 0) {
      const pagesPerDay = calculateDailyPages(Number(totalPages), days);
      return { days, pagesPerDay };
    }
    return null;
  };

  const editModePagesInfo = calculateEditModePagesPerDay();

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
      // In edit mode, we only update name, author, totalPages, and visibility settings
      if (isEditMode && initialBook && user?.id) {
        const authorValue = author.trim() || undefined;

        await updateBook({
          bookId: initialBook._id,
          userId: user.id,
          name,
          author: authorValue,
          totalPages: Number(totalPages),
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
        return;
      }

      if (!user?.id) {
        alert("Please sign in to create a book");
        setIsSubmitting(false);
        return;
      }

      // Create mode - calculate dates
      let startDate: string;
      let endDate: string;
      let daysToReadValue: number | undefined;
      let startMonthValue: string | undefined;
      let endMonthValue: string | undefined;
      let startYearValue: number | undefined;
      let endYearValue: number | undefined;

      if (readingMode === "calendar") {
        // Use manually selected days, custom days, or auto-selected days
        const days = selectedDays || Number(customDays) || autoSelectedDays;
        if (!days || days <= 0) {
          alert("Please select or enter number of days");
          setIsSubmitting(false);
          return;
        }

        // Calculate actual available days based on start date
        const selectedStartRange = getMonthDateRange(startMonth, startYear);
        const firstDayOfSelectedMonth = selectedStartRange.start;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // If selected month is current month, start from today; otherwise use first day of month
        const actualStartDate = isSameMonth(firstDayOfSelectedMonth, today)
          ? today
          : firstDayOfSelectedMonth > today
            ? firstDayOfSelectedMonth
            : today;

        const selectedEndRange = getMonthDateRange(endMonth, endYear);
        const lastDayOfSelectedEndMonth = selectedEndRange.end;

        // Calculate actual available days from start date to end of end month using eachDayOfInterval for accuracy
        const daysArray = eachDayOfInterval({
          start: actualStartDate,
          end: lastDayOfSelectedEndMonth,
        });
        const actualAvailableDays = daysArray.length;

        if (days > actualAvailableDays) {
          alert(
            `Selected days (${days}) exceed available days (${actualAvailableDays}) from ${format(actualStartDate, "MMMM d, yyyy")} to ${format(lastDayOfSelectedEndMonth, "MMMM d, yyyy")}. Set custom days as ${actualAvailableDays} to adjust the duration.`
          );
          setIsSubmitting(false);
          return;
        }

        // Calculate actual end date using addDays for reliable date arithmetic
        const actualEndDate = addDays(actualStartDate, days - 1);

        // Compare dates by normalizing to start of day (ignore time component)
        const actualEndDateNormalized = new Date(
          actualEndDate.getFullYear(),
          actualEndDate.getMonth(),
          actualEndDate.getDate()
        );
        const lastDayNormalized = new Date(
          lastDayOfSelectedEndMonth.getFullYear(),
          lastDayOfSelectedEndMonth.getMonth(),
          lastDayOfSelectedEndMonth.getDate()
        );

        if (actualEndDateNormalized > lastDayNormalized) {
          alert(
            `Selected reading duration (${days} days) would extend beyond the selected end month (${endMonth} ${endYear}). Please adjust the duration or end month.`
          );
          setIsSubmitting(false);
          return;
        }

        startDate = formatDateForStorage(actualStartDate);
        endDate = formatDateForStorage(actualEndDate);

        // Store the user's selected month/year values (not the calculated ones)
        // This ensures the dropdowns show the correct values when editing
        startMonthValue = startMonth;
        startYearValue = startYear;
        endMonthValue = endMonth;
        endYearValue = endYear;
      } else {
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
        startDate = formatDateForStorage(today);
        const end = new Date(today);
        end.setDate(end.getDate() + days - 1);
        endDate = formatDateForStorage(end);
        daysToReadValue = days;
      }

      // In edit mode, we only update name, author, totalPages, and visibility settings
      if (isEditMode && initialBook && user?.id) {
        const authorValue = author.trim() || undefined;

        await updateBook({
          bookId: initialBook._id,
          userId: user.id,
          name,
          author: authorValue,
          totalPages: Number(totalPages),
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
        return;
      }

      if (!user?.id) {
        alert("Please sign in to create a book");
        setIsSubmitting(false);
        return;
      }

      const authorValue = author.trim() || undefined;

      // Create new book
      {
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
          startDate,
          endDate,
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
      {isEditMode && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            You can edit the book name, author, total pages, and visibility
            settings. Reading schedule and dates cannot be changed.
          </p>
        </div>
      )}
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
          {editModePagesInfo && (
            <p className="mt-2 text-sm text-muted-foreground">
              With {editModePagesInfo.days} day
              {editModePagesInfo.days !== 1 ? "s" : ""} to read:{" "}
              <span className="font-medium text-foreground">
                {editModePagesInfo.pagesPerDay.toFixed(1)} pages per day
              </span>
            </p>
          )}
        </div>

        {!isEditMode && (
          <>
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
                <div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground">
                        Start Month
                      </label>
                      <select
                        value={startMonth}
                        onChange={(e) =>
                          handleStartMonthChange(
                            e.target.value as (typeof MONTHS)[number]
                          )
                        }
                        className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        {getAvailableMonths(startYear).map((month) => (
                          <option
                            key={month}
                            value={month}
                          >
                            {month}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground">
                        Start Year
                      </label>
                      <select
                        value={startYear}
                        onChange={(e) => {
                          const newYear = Number(e.target.value);
                          handleStartYearChange(newYear);
                          // If year changes and current start month is not available, reset to first available month
                          const availableMonths = getAvailableMonths(newYear);
                          if (
                            availableMonths.length > 0 &&
                            !availableMonths.includes(
                              startMonth as (typeof MONTHS)[number]
                            )
                          ) {
                            setStartMonth(
                              availableMonths[0] as (typeof MONTHS)[number]
                            );
                          }
                        }}
                        className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        {years.map((year) => (
                          <option
                            key={year}
                            value={year}
                          >
                            {year}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground">
                      End Month
                    </label>
                    <select
                      value={endMonth}
                      onChange={(e) =>
                        setEndMonth(e.target.value as (typeof MONTHS)[number])
                      }
                      className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      {getAvailableMonths(endYear).map((month) => (
                        <option
                          key={month}
                          value={month}
                        >
                          {month}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground">
                      End Year
                    </label>
                    <select
                      value={endYear}
                      onChange={(e) => {
                        const newYear = Number(e.target.value);
                        setEndYear(newYear);
                        // If year changes and current end month is not available, reset to first available month
                        const availableMonths = getAvailableMonths(newYear);
                        if (
                          availableMonths.length > 0 &&
                          !availableMonths.includes(
                            endMonth as (typeof MONTHS)[number]
                          )
                        ) {
                          setEndMonth(
                            availableMonths[0] as (typeof MONTHS)[number]
                          );
                        }
                      }}
                      className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 shadow-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      {years.map((year) => (
                        <option
                          key={year}
                          value={year}
                        >
                          {year}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  {(() => {
                    // Calculate actual available days based on start date
                    const selectedStartRange = getMonthDateRange(
                      startMonth,
                      startYear
                    );
                    const firstDayOfSelectedMonth = selectedStartRange.start;
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);

                    // If selected month is current month, start from today; otherwise use first day of month
                    const actualStartDate = isSameMonth(
                      firstDayOfSelectedMonth,
                      today
                    )
                      ? today
                      : firstDayOfSelectedMonth > today
                        ? firstDayOfSelectedMonth
                        : today;

                    const selectedEndRange = getMonthDateRange(
                      endMonth,
                      endYear
                    );
                    const lastDayOfSelectedEndMonth = selectedEndRange.end;

                    // Calculate actual available days from start date to end of end month using eachDayOfInterval for accuracy
                    const daysArray = eachDayOfInterval({
                      start: actualStartDate,
                      end: lastDayOfSelectedEndMonth,
                    });
                    const actualAvailableDays = daysArray.length;

                    const days =
                      selectedDays ||
                      Number(customDays) ||
                      autoSelectedDays ||
                      actualAvailableDays;
                    const pagesPerDay =
                      totalPages && !isNaN(Number(totalPages)) && days > 0
                        ? calculateDailyPages(Number(totalPages), days)
                        : 0;

                    return (
                      <div className="space-y-2">
                        <p>
                          <span className="font-medium">
                            Total days in selected month range:
                          </span>{" "}
                          {totalAvailableDays}
                        </p>
                        <p>
                          <span className="font-medium">
                            Available days from start:
                          </span>{" "}
                          {actualAvailableDays}{" "}
                          {actualAvailableDays !== totalAvailableDays &&
                            `(from ${format(actualStartDate, "MMMM d, yyyy")})`}
                        </p>
                        {totalPages &&
                          !isNaN(Number(totalPages)) &&
                          days > 0 && (
                            <>
                              <p className="font-medium text-foreground">
                                {selectedDays || customDays
                                  ? `Selected: ${days} days (${pagesPerDay.toFixed(1)} pages/day)`
                                  : `Auto-selected: ${days} days (${pagesPerDay.toFixed(1)} pages/day)`}
                              </p>
                              {days > 0 &&
                                (() => {
                                  const calculatedEndDate = addDays(
                                    actualStartDate,
                                    days - 1
                                  );
                                  // Ensure end date doesn't exceed selected end month
                                  const finalEndDate =
                                    calculatedEndDate >
                                    lastDayOfSelectedEndMonth
                                      ? lastDayOfSelectedEndMonth
                                      : calculatedEndDate;
                                  return (
                                    <p className="text-sm text-muted-foreground">
                                      Reading Period:{" "}
                                      {format(actualStartDate, "MMMM d, yyyy")}{" "}
                                      - {format(finalEndDate, "MMMM d, yyyy")} (
                                      {days} day{days !== 1 ? "s" : ""})
                                    </p>
                                  );
                                })()}
                            </>
                          )}
                      </div>
                    );
                  })()}
                </div>

                {totalPages && !isNaN(Number(totalPages)) && (
                  <div>
                    <label className="block text-sm font-medium text-foreground">
                      Select Reading Duration
                    </label>
                    <div className="mt-2 space-y-2">
                      {readingOptions.map((option) => (
                        <label
                          key={option.days}
                          className="flex cursor-pointer items-center rounded-md border border-input p-3 hover:bg-accent"
                        >
                          <input
                            type="radio"
                            name="days"
                            value={option.days}
                            checked={selectedDays === option.days}
                            onChange={() => {
                              setSelectedDays(option.days);
                              setAutoSelectedDays(null);
                            }}
                            className="mr-3"
                          />
                          <div>
                            <div className="font-medium">
                              {option.days} days ({option.pagesPerDay}{" "}
                              pages/day)
                            </div>
                          </div>
                        </label>
                      ))}
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="days"
                          checked={selectedDays === null && customDays !== ""}
                          onChange={() => {
                            setSelectedDays(null);
                            setCustomDays("");
                            setAutoSelectedDays(null);
                          }}
                          className="mr-2"
                        />
                        <span className="mr-2">Custom:</span>
                        <input
                          type="number"
                          value={customDays}
                          onChange={(e) => {
                            setCustomDays(e.target.value);
                            setSelectedDays(null);
                            setAutoSelectedDays(null);
                          }}
                          placeholder="Enter days"
                          min="1"
                          className="w-32 rounded-md border border-input bg-background px-2 py-1"
                        />
                        {customDays && !isNaN(Number(customDays)) && (
                          <span className="text-sm text-muted-foreground">
                            (
                            {calculateDailyPages(
                              Number(totalPages),
                              Number(customDays)
                            )}{" "}
                            pages/day)
                          </span>
                        )}
                      </div>
                    </div>
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
          </>
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
