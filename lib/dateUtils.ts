import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, parse } from "date-fns";

export const MONTHS = [
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
] as const;

export function getMonthDateRange(month: string, year: number): { start: Date; end: Date } {
  const monthIndex = MONTHS.indexOf(month as typeof MONTHS[number]);
  if (monthIndex === -1) {
    throw new Error(`Invalid month: ${month}`);
  }

  // Create date in local timezone to avoid timezone issues
  const date = new Date(year, monthIndex, 1);
  // Ensure we're working with local dates, not UTC
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  
  return {
    start: startOfMonth(start),
    end: endOfMonth(end),
  };
}

export function calculateDaysInMonthRange(
  startMonth: string,
  startYear: number,
  endMonth: string,
  endYear: number
): number {
  const start = getMonthDateRange(startMonth, startYear).start;
  const end = getMonthDateRange(endMonth, endYear).end;
  
  const days = eachDayOfInterval({ start, end });
  return days.length;
}

export function getDateRangeForMonths(
  startMonth: string,
  startYear: number,
  endMonth: string,
  endYear: number
): { start: Date; end: Date } {
  const start = getMonthDateRange(startMonth, startYear).start;
  const end = getMonthDateRange(endMonth, endYear).end;
  
  return { start, end };
}

export function formatDateForStorage(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function parseDateFromStorage(dateString: string): Date {
  return parse(dateString, "yyyy-MM-dd", new Date());
}

export function getAllDaysInRange(start: Date, end: Date): Date[] {
  return eachDayOfInterval({ start, end });
}

export function formatTimerDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  return `${s}s`;
}

export function formatCountdown(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

