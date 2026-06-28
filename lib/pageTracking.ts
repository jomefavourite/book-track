export interface PageTrackingSessionInput {
  date: string;
  plannedPages: number;
  actualPages?: number;
  stopPage?: number;
  isRead: boolean;
  isMissed?: boolean;
}

export function normalizeStopPage(
  stopPage: number,
  totalPages?: number
): number {
  const normalized = Math.max(0, Math.floor(stopPage));
  return typeof totalPages === "number" && totalPages > 0
    ? Math.min(normalized, totalPages)
    : normalized;
}

export function clampStopPageInputValue(
  value: string,
  totalPages?: number
): string {
  if (value === "") {
    return value;
  }

  const numericValue = Number(value);
  if (Number.isNaN(numericValue)) {
    return value;
  }

  return String(normalizeStopPage(numericValue, totalPages));
}

export function getInferredStopPageByDate(
  sessions: PageTrackingSessionInput[],
  totalPages?: number
): Map<string, number> {
  const stops = new Map<string, number>();
  let cumulativeStopPage = 0;

  [...sessions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((session) => {
      if (!session.isRead || session.isMissed) {
        return;
      }

      if (typeof session.stopPage === "number") {
        cumulativeStopPage = Math.max(
          cumulativeStopPage,
          normalizeStopPage(session.stopPage, totalPages)
        );
      } else {
        cumulativeStopPage = normalizeStopPage(
          cumulativeStopPage + (session.actualPages ?? session.plannedPages ?? 0),
          totalPages
        );
      }

      stops.set(session.date, cumulativeStopPage);
    });

  return stops;
}

export function getPreviousStopPage(
  sessions: PageTrackingSessionInput[],
  dateKey: string,
  totalPages?: number
): number {
  let previousStopPage = 0;

  [...sessions]
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((session) => {
      if (session.date >= dateKey || !session.isRead || session.isMissed) {
        return;
      }

      if (typeof session.stopPage === "number") {
        previousStopPage = Math.max(
          previousStopPage,
          normalizeStopPage(session.stopPage, totalPages)
        );
      } else {
        previousStopPage = normalizeStopPage(
          previousStopPage + (session.actualPages ?? session.plannedPages ?? 0),
          totalPages
        );
      }
    });

  return previousStopPage;
}

export function calculatePagesCoveredFromStopPage({
  stopPage,
  previousStopPage,
  totalPages,
}: {
  stopPage: number;
  previousStopPage: number;
  totalPages?: number;
}): { stopPage: number; actualPages: number } {
  const normalizedStopPage = normalizeStopPage(stopPage, totalPages);
  const normalizedPreviousStopPage = normalizeStopPage(previousStopPage, totalPages);

  return {
    stopPage: normalizedStopPage,
    actualPages: Math.max(0, normalizedStopPage - normalizedPreviousStopPage),
  };
}

export function getDefaultStopPageForDate({
  sessions,
  dateKey,
  plannedPages,
  totalPages,
}: {
  sessions: PageTrackingSessionInput[];
  dateKey: string;
  plannedPages: number;
  totalPages?: number;
}): { stopPage: number; actualPages: number } {
  const previousStopPage = getPreviousStopPage(sessions, dateKey, totalPages);
  const stopPage = normalizeStopPage(previousStopPage + plannedPages, totalPages);

  return {
    stopPage,
    actualPages: Math.max(0, stopPage - previousStopPage),
  };
}

export function isUnsupportedStopPageError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("extra field `stopPage`");
}
