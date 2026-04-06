import {
  calculateDaysInMonthRange,
  getDateRangeForMonths,
  getAllDaysInRange,
  formatDateForStorage,
} from "./dateUtils";

export interface ReadingOption {
  days: number;
  pagesPerDay: number;
}

export function generateReadingOptions(totalPages: number): ReadingOption[] {
  const options: ReadingOption[] = [];
  const presetDays = [7, 14, 21, 30, 60, 90];

  for (const days of presetDays) {
    const pagesPerDay = Math.ceil(totalPages / days);
    options.push({ days, pagesPerDay });
  }

  return options;
}

export function calculateDailyPages(
  totalPages: number,
  days: number
): number {
  return Math.ceil(totalPages / days);
}

export function calculateDaysInMonthRangeForBook(
  startMonth: string,
  startYear: number,
  endMonth: string,
  endYear: number
): number {
  return calculateDaysInMonthRange(startMonth, startYear, endMonth, endYear);
}

export function distributePagesAcrossDays(
  totalPages: number,
  startDate: Date,
  endDate: Date
): Map<string, number> {
  const days = getAllDaysInRange(startDate, endDate);
  const totalDays = days.length;
  const pagesPerDay = Math.floor(totalPages / totalDays);
  const remainder = totalPages % totalDays;

  const distribution = new Map<string, number>();

  days.forEach((day, index) => {
    const dateKey = formatDateForStorage(day);
    // Distribute remainder pages across first days
    const pages = pagesPerDay + (index < remainder ? 1 : 0);
    distribution.set(dateKey, pages);
  });

  return distribution;
}

export function calculateCatchUpPages(
  totalPages: number,
  completedPages: number,
  remainingDays: number
): number {
  const remainingPages = totalPages - completedPages;
  if (remainingDays <= 0) {
    return remainingPages;
  }
  return Math.ceil(remainingPages / remainingDays);
}

export function distributePagesSequentially(
  books: Array<{ totalPages: number; days: number }>,
  availableDays: number
): Array<{ bookIndex: number; startDay: number; endDay: number; pagesPerDay: number }> {
  const schedule: Array<{
    bookIndex: number;
    startDay: number;
    endDay: number;
    pagesPerDay: number;
  }> = [];

  let currentDay = 0;

  for (let i = 0; i < books.length; i++) {
    const book = books[i];
    const daysForBook = Math.min(book.days, availableDays - currentDay);
    
    if (daysForBook <= 0) {
      break;
    }

    const pagesPerDay = calculateDailyPages(book.totalPages, daysForBook);
    const endDay = currentDay + daysForBook - 1;

    schedule.push({
      bookIndex: i,
      startDay: currentDay,
      endDay,
      pagesPerDay,
    });

    currentDay = endDay + 1;
  }

  return schedule;
}

export function calculateRemainingPages(
  totalPages: number,
  actualPagesRead: number
): number {
  return Math.max(0, totalPages - actualPagesRead);
}

export function getMissedDays(
  startDate: Date,
  endDate: Date,
  completedDates: Set<string>
): Date[] {
  const allDays = getAllDaysInRange(startDate, endDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return allDays.filter((day) => {
    const dayKey = formatDateForStorage(day);
    const isPast = day < today;
    const isMissed = !completedDates.has(dayKey);
    return isPast && isMissed;
  });
}

