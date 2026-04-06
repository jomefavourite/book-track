"use client";

import { useState, useEffect, useRef } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
  addYears,
  subYears,
  isSameMonth,
  isSameDay,
  getDay,
  isToday,
  setMonth,
  setYear,
} from "date-fns";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface DatePickerProps {
  selectedDate: Date | null;
  onDateSelect: (date: Date) => void;
  minDate?: Date;
  maxDate?: Date;
  allowPastDates?: boolean;
  label?: string;
}

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export default function DatePicker({
  selectedDate,
  onDateSelect,
  minDate,
  maxDate,
  allowPastDates = true,
  label,
}: DatePickerProps) {
  // Use selected date's month/year, or current month if no selection
  // Allow free navigation - don't auto-reset when selectedDate changes
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    if (selectedDate) {
      return startOfMonth(selectedDate);
    }
    return startOfMonth(new Date());
  });

  // Only sync currentMonth with selectedDate on initial mount
  // After that, let user navigate freely
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (!hasInitialized.current && selectedDate) {
      setCurrentMonth(startOfMonth(selectedDate));
      hasInitialized.current = true;
    }
  }, [selectedDate]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Get first day of week for the month (0 = Sunday)
  const firstDayOfWeek = getDay(monthStart);

  // Create array with empty cells for days before month starts
  const calendarDays: (Date | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    calendarDays.push(null);
  }
  daysInMonth.forEach((day) => calendarDays.push(day));

  const handlePreviousMonth = () => {
    setCurrentMonth(subMonths(currentMonth, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(addMonths(currentMonth, 1));
  };

  const handlePreviousYear = () => {
    setCurrentMonth(subYears(currentMonth, 1));
  };

  const handleNextYear = () => {
    setCurrentMonth(addYears(currentMonth, 1));
  };

  const handleMonthSelect = (monthIndex: number) => {
    setCurrentMonth(setMonth(currentMonth, monthIndex));
  };

  const handleYearSelect = (year: number) => {
    setCurrentMonth(setYear(currentMonth, year));
  };

  const handleToday = () => {
    const today = new Date();
    setCurrentMonth(startOfMonth(today));
    onDateSelect(today);
  };

  const isDateDisabled = (date: Date): boolean => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dateToCheck = new Date(date);
    dateToCheck.setHours(0, 0, 0, 0);

    // Check minDate
    if (minDate) {
      const min = new Date(minDate);
      min.setHours(0, 0, 0, 0);
      if (dateToCheck < min) return true;
    }

    // Check maxDate
    if (maxDate) {
      const max = new Date(maxDate);
      max.setHours(0, 0, 0, 0);
      if (dateToCheck > max) return true;
    }

    // If past dates not allowed, disable past dates
    if (!allowPastDates && dateToCheck < today) {
      return true;
    }

    return false;
  };

  const isDateSelected = (date: Date): boolean => {
    if (!selectedDate) return false;
    return isSameDay(date, selectedDate);
  };

  // Generate year range (current year ± 50 years)
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 101 }, (_, i) => currentYear - 50 + i);

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-foreground mb-2">
          {label}
        </label>
      )}
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        {/* Month/Year Navigation */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handlePreviousYear}
              className="h-8 w-8"
              title="Previous year"
            >
              <ChevronLeft className="h-4 w-4" />
              <ChevronLeft className="h-4 w-4 -ml-2" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handlePreviousMonth}
              className="h-8 w-8"
              title="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-8 px-3 font-semibold hover:bg-accent"
                >
                  {format(currentMonth, "MMMM")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="center"
                className="w-32 max-h-[200px] overflow-y-auto"
              >
                {MONTHS.map((month, index) => (
                  <DropdownMenuItem
                    key={month}
                    onClick={() => handleMonthSelect(index)}
                    className={cn(
                      "cursor-pointer",
                      currentMonth.getMonth() === index && "bg-accent"
                    )}
                  >
                    {month}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-8 px-3 font-semibold hover:bg-accent"
                >
                  {format(currentMonth, "yyyy")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="center"
                className="w-24 max-h-[200px] overflow-y-auto"
              >
                {years.map((year) => (
                  <DropdownMenuItem
                    key={year}
                    onClick={() => handleYearSelect(year)}
                    className={cn(
                      "cursor-pointer",
                      currentMonth.getFullYear() === year && "bg-accent"
                    )}
                  >
                    {year}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleNextMonth}
              className="h-8 w-8"
              title="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleNextYear}
              className="h-8 w-8"
              title="Next year"
            >
              <ChevronRight className="h-4 w-4" />
              <ChevronRight className="h-4 w-4 -ml-2" />
            </Button>
          </div>
        </div>

        {/* Day of Week Headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {DAYS_OF_WEEK.map((day) => (
            <div
              key={day}
              className="text-center text-xs font-semibold text-muted-foreground py-1.5"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((day, index) => {
            if (day === null) {
              return (
                <div
                  key={`empty-${index}`}
                  className="aspect-square"
                />
              );
            }

            const isDisabled = isDateDisabled(day);
            const isSelected = isDateSelected(day);
            const isCurrentMonthDay = isSameMonth(day, currentMonth);
            const isTodayDate = isToday(day);

            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => !isDisabled && onDateSelect(day)}
                disabled={isDisabled}
                className={cn(
                  "aspect-square rounded-md text-sm font-medium transition-all",
                  "hover:bg-accent hover:text-accent-foreground",
                  "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
                  isSelected &&
                    "bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-sm",
                  isDisabled &&
                    "opacity-30 cursor-not-allowed hover:bg-transparent",
                  !isCurrentMonthDay && "opacity-40",
                  isTodayDate && !isSelected && "ring-2 ring-primary/50"
                )}
              >
                {format(day, "d")}
              </button>
            );
          })}
        </div>

        {/* Today Button and Selected Date Display */}
        <div className="mt-4 flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleToday}
            className="h-8 text-xs"
          >
            <Calendar className="h-3 w-3 mr-1" />
            Today
          </Button>
          {selectedDate && (
            <div className="text-sm text-muted-foreground">
              Selected:{" "}
              <span className="font-medium text-foreground">
                {format(selectedDate, "MMM d, yyyy")}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
