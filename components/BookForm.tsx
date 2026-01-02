"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useConvexMutation, convexQuery } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";
import {
  MONTHS,
  getDateRangeForMonths,
  formatDateForStorage,
} from "@/lib/dateUtils";
import {
  generateReadingOptions,
  calculateDailyPages,
  calculateDaysInMonthRangeForBook,
  distributePagesAcrossDays,
} from "@/lib/readingCalculator";
import { useRouter } from "next/navigation";
import ThemeSwitcher from "@/components/ThemeSwitcher";

export default function BookForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { mutateAsync: createBook } = useMutation({
    mutationFn: useConvexMutation(api.books.createBook),
    onSuccess: () => {
      // Invalidate and refetch the books list query
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.books.getBooks, {}).queryKey,
      });
    },
  });
  const [name, setName] = useState("");
  const [totalPages, setTotalPages] = useState("");
  const [readingMode, setReadingMode] = useState<"calendar" | "fixed-days">(
    "calendar"
  );
  const [startMonth, setStartMonth] = useState(MONTHS[new Date().getMonth()]);
  const [startYear, setStartYear] = useState(new Date().getFullYear());
  const [endMonth, setEndMonth] = useState(MONTHS[new Date().getMonth()]);
  const [endYear, setEndYear] = useState(new Date().getFullYear());
  const [daysToRead, setDaysToRead] = useState("");
  const [selectedDays, setSelectedDays] = useState<number | null>(null);
  const [customDays, setCustomDays] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentYear = new Date().getFullYear();
  // Show current year and next 10 years to cover future dates
  const years = Array.from({ length: 11 }, (_, i) => currentYear + i);

  const readingOptions =
    totalPages && !isNaN(Number(totalPages))
      ? generateReadingOptions(Number(totalPages))
      : [];

  const handleModeChange = (mode: "calendar" | "fixed-days") => {
    setReadingMode(mode);
    setSelectedDays(null);
    setCustomDays("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !totalPages || isNaN(Number(totalPages))) {
      return;
    }

    setIsSubmitting(true);

    try {
      let startDate: string;
      let endDate: string;
      let daysToReadValue: number | undefined;
      let startMonthValue: string | undefined;
      let endMonthValue: string | undefined;
      let startYearValue: number | undefined;
      let endYearValue: number | undefined;

      if (readingMode === "calendar") {
        if (!selectedDays && !customDays) {
          alert("Please select or enter number of days");
          setIsSubmitting(false);
          return;
        }

        const days = selectedDays || Number(customDays);
        if (!days || days <= 0) {
          alert("Please enter a valid number of days");
          setIsSubmitting(false);
          return;
        }

        const totalDays = calculateDaysInMonthRangeForBook(
          startMonth,
          startYear,
          endMonth,
          endYear
        );

        if (days > totalDays) {
          alert(
            `Selected days (${days}) exceed available days (${totalDays}) in the selected month range`
          );
          setIsSubmitting(false);
          return;
        }

        const dateRange = getDateRangeForMonths(
          startMonth,
          startYear,
          endMonth,
          endYear
        );
        startDate = formatDateForStorage(dateRange.start);
        endDate = formatDateForStorage(
          new Date(dateRange.start.getTime() + (days - 1) * 24 * 60 * 60 * 1000)
        );

        startMonthValue = startMonth;
        endMonthValue = endMonth;
        startYearValue = startYear;
        endYearValue = endYear;
      } else {
        if (!daysToRead || isNaN(Number(daysToRead))) {
          alert("Please enter number of days");
          setIsSubmitting(false);
          return;
        }

        const days = Number(daysToRead);
        const today = new Date();
        startDate = formatDateForStorage(today);
        const end = new Date(today);
        end.setDate(end.getDate() + days - 1);
        endDate = formatDateForStorage(end);
        daysToReadValue = days;
      }

      const bookId = await createBook({
        name,
        totalPages: Number(totalPages),
        readingMode,
        startMonth: startMonthValue,
        endMonth: endMonthValue,
        startYear: startYearValue,
        endYear: endYearValue,
        daysToRead: daysToReadValue,
        startDate,
        endDate,
      });

      router.push(`/books/${bookId}`);
    } catch (error) {
      console.error("Error creating book:", error);
      alert("Failed to create book. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
          Add New Book
        </h1>
        <ThemeSwitcher />
      </div>
      <form
        onSubmit={handleSubmit}
        className="space-y-6"
      >
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Book Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Total Pages
          </label>
          <input
            type="number"
            value={totalPages}
            onChange={(e) => setTotalPages(e.target.value)}
            required
            min="1"
            className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
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
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Start Month
                  </label>
                  <select
                    value={startMonth}
                    onChange={(e) =>
                      setStartMonth(e.target.value as (typeof MONTHS)[number])
                    }
                    className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                  >
                    {MONTHS.map((month) => (
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
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Start Year
                  </label>
                  <select
                    value={startYear}
                    onChange={(e) => setStartYear(Number(e.target.value))}
                    className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
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
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  End Month
                </label>
                <select
                  value={endMonth}
                  onChange={(e) =>
                    setEndMonth(e.target.value as (typeof MONTHS)[number])
                  }
                  className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                >
                  {MONTHS.map((month) => (
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
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  End Year
                </label>
                <select
                  value={endYear}
                  onChange={(e) => setEndYear(Number(e.target.value))}
                  className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
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
              <p>
                Total days in selected month range:{" "}
                {calculateDaysInMonthRangeForBook(
                  startMonth,
                  startYear,
                  endMonth,
                  endYear
                )}
              </p>
            </div>

            {totalPages && !isNaN(Number(totalPages)) && (
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Select Reading Duration
                </label>
                <div className="mt-2 space-y-2">
                  {readingOptions.map((option) => (
                    <label
                      key={option.days}
                      className="flex cursor-pointer items-center rounded-md border border-zinc-200 p-3 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    >
                      <input
                        type="radio"
                        name="days"
                        value={option.days}
                        checked={selectedDays === option.days}
                        onChange={() => setSelectedDays(option.days)}
                        className="mr-3"
                      />
                      <div>
                        <div className="font-medium">
                          {option.days} days ({option.pagesPerDay} pages/day)
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
                      }}
                      placeholder="Enter days"
                      min="1"
                      className="w-32 rounded-md border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                    />
                    {customDays && !isNaN(Number(customDays)) && (
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">
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
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Number of Days
            </label>
            <input
              type="number"
              value={daysToRead}
              onChange={(e) => setDaysToRead(e.target.value)}
              required
              min="1"
              className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 shadow-sm focus:border-zinc-500 focus:outline-none focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            />
            {daysToRead &&
              !isNaN(Number(daysToRead)) &&
              totalPages &&
              !isNaN(Number(totalPages)) && (
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  {calculateDailyPages(Number(totalPages), Number(daysToRead))}{" "}
                  pages per day
                </p>
              )}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-zinc-900 px-4 py-2 font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {isSubmitting ? "Creating..." : "Create Book"}
        </button>
      </form>
    </div>
  );
}
