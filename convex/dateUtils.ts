import { format, parse, eachDayOfInterval } from "date-fns";

export function formatDateForStorage(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function parseDateFromStorage(dateString: string): Date {
  return parse(dateString, "yyyy-MM-dd", new Date());
}

export function getAllDaysInRange(start: Date, end: Date): Date[] {
  return eachDayOfInterval({ start, end });
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

