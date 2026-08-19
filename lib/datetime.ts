import { useEffect, useState } from "react";

/**
 * The temple's wall-clock timezone. Every date the platform shows a person —
 * pooja slots, booking times, receipt timestamps — is Singapore time
 * regardless of where the browser or the server happens to be, so the zone
 * is named once here rather than assumed from the client's locale.
 *
 * Formatting goes through Intl with an explicit `timeZone`, never a manual
 * "+8 hours" offset: the offset arithmetic is the standard way these bugs
 * start, and it silently produces wrong times the moment anything about the
 * zone or the host machine changes.
 */
export const TEMPLE_TIME_ZONE = "Asia/Singapore";
export const TEMPLE_TIME_ZONE_LABEL = "SGT";

// Intl.DateTimeFormat construction is expensive — build each once and reuse.
const timeFormatter = new Intl.DateTimeFormat("en-SG", {
  timeZone: TEMPLE_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

const dateFormatter = new Intl.DateTimeFormat("en-SG", {
  timeZone: TEMPLE_TIME_ZONE,
  weekday: "short",
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export type TempleTimeParts = {
  hour: string;
  minute: string;
  second: string;
  dayPeriod: string;
  date: string;
};

/**
 * Split into parts rather than one string so the seconds can animate on
 * their own without re-rendering (and re-animating) the rest of the clock.
 */
export function getTempleTimeParts(value: Date): TempleTimeParts {
  const parts = timeFormatter.formatToParts(value);
  const find = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";

  return {
    hour: find("hour"),
    minute: find("minute"),
    second: find("second"),
    dayPeriod: find("dayPeriod").toUpperCase(),
    date: dateFormatter.format(value),
  };
}

/**
 * Date-only values are handled as plain year/month/day and never round-trip
 * through UTC.
 *
 * `date.toISOString().slice(0, 10)` is the tempting one-liner here and it is
 * wrong: it converts to UTC first, so a date picked as the 15th is stored as
 * the 14th for anyone west of Greenwich. These two build and read the string
 * from the local calendar fields directly, so what was clicked is what is
 * saved.
 */
export function toISODateString(value: Date): string {
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${value.getFullYear()}-${month}-${day}`;
}

export function parseISODateString(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  // Constructed from parts, not parsed from the string — `new Date("2026-08-15")`
  // is specified to be treated as UTC midnight, which is the same trap again.
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? null : date;
}

const longDateFormatter = new Intl.DateTimeFormat("en-SG", {
  timeZone: TEMPLE_TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
});

/** "15 Aug 2026" — for showing a date-only value back to the user. */
export function formatTempleDate(value: Date | null): string {
  return value ? longDateFormatter.format(value) : "";
}

/** Midnight today, for "is this in the past" comparisons on date-only values. */
export function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function isSameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

/** One-off formatting for lists and detail screens. */
export function formatTempleDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return `${dateFormatter.format(date)}, ${timeFormatter.format(date)}`;
}

/**
 * A Date that re-renders on each wall-clock second.
 *
 * Scheduled with a self-correcting timeout to the next second boundary
 * rather than `setInterval(1000)`: an interval accumulates drift and, more
 * visibly, ticks at whatever fraction of a second the page happened to load
 * on, so the display can sit on a number for nearly two seconds and then
 * skip. Re-measuring each tick keeps it aligned to the real second.
 */
export function useTempleClock(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timeoutId: number;

    const schedule = () => {
      timeoutId = window.setTimeout(() => {
        setNow(new Date());
        schedule();
      }, 1000 - (Date.now() % 1000));
    };

    schedule();
    return () => window.clearTimeout(timeoutId);
  }, []);

  return now;
}
