/**
 * Date formatting for the public portal. Events store date-only values at
 * midnight UTC, so everything is formatted in UTC — formatting in the
 * visitor's local zone could show the previous day, and would also make the
 * server-rendered HTML differ from what the browser renders (a hydration
 * mismatch).
 */
const opts = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...o });

const DAY = opts({ day: "numeric" });
const MONTH = opts({ month: "short" });
const YEAR = opts({ year: "numeric" });
const FULL = opts({ day: "numeric", month: "short", year: "numeric" });

const sameDay = (a: Date, b: Date) => FULL.format(a) === FULL.format(b);

/** "15 Feb 2026", "10 – 15 Nov 2026" or "30 Dec 2026 – 2 Jan 2027". */
export function formatDateRange(start?: string, end?: string): string {
  if (!start) return "";
  const s = new Date(start);
  const e = end ? new Date(end) : s;
  if (sameDay(s, e)) return FULL.format(s);
  if (MONTH.format(s) === MONTH.format(e) && YEAR.format(s) === YEAR.format(e)) {
    return `${DAY.format(s)} – ${DAY.format(e)} ${MONTH.format(e)} ${YEAR.format(e)}`;
  }
  return `${FULL.format(s)} – ${FULL.format(e)}`;
}

/** Day-of-month and short month of the first day, for a calendar tile. */
export function dateTile(start?: string): { day: string; month: string } {
  if (!start) return { day: "", month: "" };
  const s = new Date(start);
  return { day: DAY.format(s), month: MONTH.format(s).toUpperCase() };
}
