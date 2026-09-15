"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarIcon, ChevronIcon } from "./icons";
import { FORM_CONTROL_ERROR, FORM_CONTROL_FOCUS, FORM_CONTROL_SHELL, FORM_LABEL, FORM_MUTED } from "./formFieldStyles";
import {
  formatTempleDate,
  isSameDay,
  parseISODateString,
  startOfToday,
  toISODateString,
} from "../../lib/datetime";

type DivineDatePickerProps = {
  label: string;
  /** ISO date string, "YYYY-MM-DD", or "" for empty. */
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  /** Blocks selection before this date — pass startOfToday() for "future only". */
  minDate?: Date | null;
  /** Blocks selection after this date — e.g. an "end date" field passing the paired "start date" field's value blocks a range that runs backwards. */
  maxDate?: Date | null;
  placeholder?: string;
  /** Extra classes appended to the trigger button — e.g. a page that wants
   *  this field to carry a themed border/shadow at rest, not just on focus.
   *  Empty by default, so every existing call site is unaffected. */
  containerClassName?: string;
  /** Same convention as DivineInput's `staticLabel` — marks an admin
   *  master-form field, which gets the same built-in gradient border
   *  DivineListbox always shows. Off by default so POS keeps its plain
   *  gray/gold-focus border. */
  staticLabel?: boolean;
};

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const PANEL_WIDTH = 300;
const PANEL_HEIGHT = 350;

type Cell = { date: Date; outside: boolean };

/** Always 6 rows, so the panel never changes height as months change. */
function buildMonthGrid(year: number, month: number): Cell[] {
  const firstOfMonth = new Date(year, month, 1);
  const leading = firstOfMonth.getDay();
  const gridStart = new Date(year, month, 1 - leading);

  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    return { date, outside: date.getMonth() !== month };
  });
}

/**
 * Calendar in the temple's own visual language, replacing the browser's
 * native date UI — which can't be styled at all and renders as an OS-grey
 * panel in the middle of a navy-and-gold screen.
 *
 * The panel renders through a portal rather than inline. Date fields sit
 * inside the scrolling body of a FormDrawer, and a 350px absolutely
 * positioned panel gets clipped by that scroll container; a portal with
 * fixed positioning escapes it, and lets the calendar flip above the field
 * when there isn't room below.
 */
export default function DivineDatePicker({
  label,
  value,
  onChange,
  error,
  hint,
  minDate,
  maxDate,
  placeholder = "Select a date",
  containerClassName = "",
  staticLabel = false,
}: DivineDatePickerProps) {
  const selected = parseISODateString(value);
  const today = startOfToday();

  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => selected ?? today);
  const [direction, setDirection] = useState(0);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  // Clicking the month or year in the header swaps the day grid for one of
  // these instead — jumping to a birth year (or any far-off year) one month
  // arrow click at a time was the whole complaint this replaces.
  const [activePicker, setActivePicker] = useState<"days" | "months" | "years">("days");
  const [yearQuery, setYearQuery] = useState("");

  const triggerRef = useRef<HTMLButtonElement>(null);
  const yearListRef = useRef<HTMLDivElement>(null);
  const labelId = useId();

  // Opening should land on the selected value's month/year, on the day
  // grid, every time — set directly in the click handler that flips `open`
  // rather than in an effect keyed on it, since there's no reason to wait
  // an extra render for a reset the click itself already knows to make.
  function toggleOpen() {
    if (!open) {
      setView(selected ?? today);
      setActivePicker("days");
      setYearQuery("");
    }
    setOpen((v) => !v);
  }

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;

    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const roomBelow = window.innerHeight - rect.bottom;
      const openUpward = roomBelow < PANEL_HEIGHT + 16 && rect.top > PANEL_HEIGHT;

      setPosition({
        top: openUpward ? rect.top - PANEL_HEIGHT - 8 : rect.bottom + 8,
        left: Math.min(Math.max(8, rect.left), window.innerWidth - PANEL_WIDTH - 8),
      });
    };

    place();
    window.addEventListener("resize", place);
    // `true` captures scrolling in the drawer, not just the window.
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function shiftMonth(delta: number) {
    setDirection(delta);
    setView((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));
  }

  function pick(date: Date) {
    onChange(toISODateString(date));
    setOpen(false);
  }

  const isDisabled = (date: Date) => Boolean((minDate && date < minDate) || (maxDate && date > maxDate));
  const cells = buildMonthGrid(view.getFullYear(), view.getMonth());

  // A generous default range (covers any date-of-birth field), narrowed to
  // whatever minDate/maxDate actually allow so a constrained field — an
  // Event Date restricted to "today onward" — never lists a year that would
  // just land on an all-disabled month.
  const thisYear = today.getFullYear();
  const rangeStart = minDate ? minDate.getFullYear() : thisYear - 120;
  const rangeEnd = maxDate ? maxDate.getFullYear() : thisYear + 15;
  const allYears = Array.from({ length: rangeEnd - rangeStart + 1 }, (_, i) => rangeEnd - i);
  const filteredYears = yearQuery.trim() ? allYears.filter((y) => String(y).includes(yearQuery.trim())) : allYears;

  function pickYear(year: number) {
    setView((v) => new Date(year, v.getMonth(), 1));
    setActivePicker("days");
    setYearQuery("");
  }

  function pickMonth(monthIndex: number) {
    setView((v) => new Date(v.getFullYear(), monthIndex, 1));
    setActivePicker("days");
  }

  // Land the picker on the currently-viewed year instead of wherever the
  // list happens to start (the far end of a 120-year list otherwise).
  useEffect(() => {
    if (activePicker !== "years") return;
    const el = yearListRef.current?.querySelector<HTMLButtonElement>(`[data-year="${view.getFullYear()}"]`);
    el?.scrollIntoView({ block: "center" });
  }, [activePicker, view]);

  // Same gradient-border scoping as DivineInput/DivineTextarea: staticLabel
  // marks an admin master-form field, which gets the two-layer gradient
  // border; POS (staticLabel off) keeps the original plain border.
  const outerWrapClass = staticLabel
    ? `${FORM_CONTROL_SHELL} ${error ? FORM_CONTROL_ERROR : open ? FORM_CONTROL_FOCUS : ""}`
    : "";
  const triggerClass = staticLabel
    ? "group relative w-full rounded-lg bg-white text-left leading-none"
    : `group relative w-full rounded-xl border bg-white text-left transition-colors duration-300 ${
        error
          ? "border-crimson-500/70"
          : open
            ? "border-gold-400/80 shadow-[0_0_0_3px_rgba(212,175,55,0.15)]"
            : "border-gray-200 hover:border-gray-300"
      }`;

  return (
    <div className="w-full">
      {staticLabel && (
        <label id={labelId} className={FORM_LABEL}>
          {label}
        </label>
      )}
      <div className={outerWrapClass}>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleOpen}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={labelId}
        className={`${triggerClass} ${containerClassName}`}
      >
        <div className={`flex items-center gap-2 ${staticLabel ? "h-10 px-3" : "px-4 pt-5 pb-2"}`}>
          {!staticLabel && (
            <span className={`shrink-0 transition-colors ${open ? "text-amber-600" : "text-ink-500"}`}>
              <CalendarIcon />
            </span>
          )}
          <div className="relative min-w-0 w-full">
            {!staticLabel && (
              <span
                id={labelId}
                className="pointer-events-none absolute -top-[18px] left-0 right-0 truncate text-[11px] tracking-wide text-gray-700"
              >
                {label}
              </span>
            )}
            <span className={`block truncate font-body ${staticLabel ? "text-[14px] leading-5" : "text-[15px]"} ${selected ? "text-ink-100" : staticLabel ? FORM_MUTED : "text-ink-500"}`}>
              {selected ? formatTempleDate(selected) : placeholder}
            </span>
          </div>
          {selected && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Clear date"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="shrink-0 rounded p-0.5 text-gray-400 transition-colors hover:text-crimson-500"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </span>
          )}
          {staticLabel && (
            <span className={`shrink-0 ${open ? "text-[#e8590c]" : "text-gray-400"}`}>
              <CalendarIcon />
            </span>
          )}
        </div>
      </button>
      </div>

      {error ? (
        <p className="mt-1.5 pl-1 text-[12.5px] text-crimson-500">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 pl-1 text-[12.5px] text-ink-500">{hint}</p>
      ) : null}

      {createPortal(
        <AnimatePresence>
          {open && position && (
            <>
              <button
                type="button"
                aria-label="Close calendar"
                onClick={() => setOpen(false)}
                className="fixed inset-0 z-[60] cursor-default"
              />
              <motion.div
                role="dialog"
                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.97 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
                style={{ top: position.top, left: position.left, width: PANEL_WIDTH }}
                className="fixed z-[61] overflow-hidden rounded-2xl border border-gold-500/25 bg-navy-900/90 p-3 shadow-[0_28px_70px_-20px_rgba(0,0,0,0.85)] backdrop-blur-xl"
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold-400/50 to-transparent" />

                <div className="mb-2 flex items-center justify-between px-1">
                  <NavButton onClick={() => shiftMonth(-1)} label="Previous month" disabled={activePicker !== "days"}>
                    ‹
                  </NavButton>
                  <div className="flex items-center gap-1">
                    <HeaderPickerButton
                      active={activePicker === "months"}
                      onClick={() => setActivePicker((p) => (p === "months" ? "days" : "months"))}
                    >
                      {MONTHS[view.getMonth()]}
                    </HeaderPickerButton>
                    <HeaderPickerButton
                      active={activePicker === "years"}
                      tabular
                      onClick={() => setActivePicker((p) => (p === "years" ? "days" : "years"))}
                    >
                      {view.getFullYear()}
                    </HeaderPickerButton>
                  </div>
                  <NavButton onClick={() => shiftMonth(1)} label="Next month" disabled={activePicker !== "days"}>
                    ›
                  </NavButton>
                </div>

                {activePicker === "months" ? (
                  <div className="grid grid-cols-3 gap-1" style={{ height: 190 }}>
                    {MONTHS.map((name, index) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => pickMonth(index)}
                        className={`flex items-center justify-center rounded-lg text-[12.5px] transition-colors ${
                          index === view.getMonth()
                            ? "bg-gold-500 font-semibold text-navy-950 shadow-[0_2px_10px_-2px_rgba(212,175,55,0.7)]"
                            : index === today.getMonth() && view.getFullYear() === thisYear
                              ? "text-amber-600 hover:bg-gold-500/15"
                              : "text-ink-100 hover:bg-gold-500/15 hover:text-amber-700"
                        }`}
                      >
                        {name.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                ) : activePicker === "years" ? (
                  <div className="flex flex-col">
                    <input
                      type="text"
                      inputMode="numeric"
                      autoFocus
                      value={yearQuery}
                      onChange={(e) => setYearQuery(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      placeholder="Type a year…"
                      className="mb-2 w-full rounded-lg border border-gold-500/20 bg-navy-800/60 px-3 py-1.5 text-[13px] text-ink-100 outline-none placeholder:text-ink-500 focus:border-gold-400/60"
                    />
                    <div ref={yearListRef} className="grid grid-cols-4 gap-1 overflow-y-auto pr-0.5" style={{ height: 152 }}>
                      {filteredYears.length === 0 && (
                        <p className="col-span-4 py-6 text-center text-[12.5px] text-ink-500">No matching year.</p>
                      )}
                      {filteredYears.map((y) => (
                        <button
                          key={y}
                          type="button"
                          data-year={y}
                          onClick={() => pickYear(y)}
                          className={`h-9 shrink-0 rounded-lg text-[12.5px] tabular-nums transition-colors ${
                            y === view.getFullYear()
                              ? "bg-gold-500 font-semibold text-navy-950 shadow-[0_2px_10px_-2px_rgba(212,175,55,0.7)]"
                              : y === thisYear
                                ? "text-amber-600 hover:bg-gold-500/15"
                                : "text-ink-100 hover:bg-gold-500/15 hover:text-amber-700"
                          }`}
                        >
                          {y}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mb-1 grid grid-cols-7 gap-0.5">
                      {WEEKDAYS.map((d) => (
                        <span key={d} className="py-1 text-center text-[10.5px] uppercase tracking-wide text-ink-500">
                          {d}
                        </span>
                      ))}
                    </div>

                    <div className="relative overflow-hidden" style={{ height: 198 }}>
                      <AnimatePresence initial={false} custom={direction} mode="popLayout">
                        <motion.div
                          key={`${view.getFullYear()}-${view.getMonth()}`}
                          custom={direction}
                          initial={{ x: direction > 0 ? 40 : -40, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          exit={{ x: direction > 0 ? -40 : 40, opacity: 0 }}
                          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                          className="absolute inset-0 grid grid-cols-7 gap-0.5 content-start"
                        >
                          {cells.map(({ date, outside }) => {
                            const disabled = isDisabled(date);
                            const isSelected = isSameDay(date, selected);
                            const isToday = isSameDay(date, today);

                            return (
                              <button
                                key={date.toISOString()}
                                type="button"
                                disabled={disabled}
                                onClick={() => pick(date)}
                                className={`relative h-8 rounded-lg text-[12.5px] tabular-nums transition-colors ${
                                  isSelected
                                    ? "bg-gold-500 font-semibold text-navy-950 shadow-[0_2px_10px_-2px_rgba(212,175,55,0.7)]"
                                    : disabled
                                      ? "cursor-not-allowed text-ink-500/25"
                                      : outside
                                        ? "text-ink-500/45 hover:bg-navy-800/70 hover:text-ink-300"
                                        : "text-ink-100 hover:bg-gold-500/15 hover:text-amber-700"
                                }`}
                              >
                                {date.getDate()}
                                {isToday && !isSelected && (
                                  <span className="absolute inset-x-0 bottom-1 mx-auto h-[3px] w-[3px] rounded-full bg-gold-400" />
                                )}
                              </button>
                            );
                          })}
                        </motion.div>
                      </AnimatePresence>
                    </div>
                  </>
                )}

                <div className="mt-2 flex items-center justify-between border-t border-gold-500/10 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      onChange("");
                      setOpen(false);
                    }}
                    className="rounded-lg px-2 py-1 text-[12px] text-ink-500 transition-colors hover:text-crimson-500"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    disabled={isDisabled(today)}
                    onClick={() => pick(today)}
                    className="rounded-lg px-2 py-1 text-[12px] text-amber-600 transition-colors hover:text-amber-700 disabled:opacity-40"
                  >
                    Today
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}

/** The clickable "September" / "2025" pair in the header — same control for both, just what they open differs. */
function HeaderPickerButton({
  active,
  tabular,
  onClick,
  children,
}: {
  active: boolean;
  tabular?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="listbox"
      aria-expanded={active}
      className={`flex items-center gap-1 rounded-md border px-2 py-1 font-accent text-[13.5px] tracking-wide transition-colors ${tabular ? "tabular-nums" : ""} ${
        active
          ? "border-gold-400/60 bg-gold-500/15 text-amber-600"
          : "border-gold-500/20 text-amber-700 hover:border-gold-500/40 hover:bg-gold-500/10"
      }`}
    >
      {children}
      <ChevronIcon className={`h-3 w-3 transition-transform duration-200 ${active ? "rotate-180" : ""}`} />
    </button>
  );
}

function NavButton({
  onClick,
  label,
  disabled,
  children,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-7 w-7 items-center justify-center rounded-lg border border-gold-500/20 text-[15px] text-ink-500 transition-colors hover:border-gold-500/40 hover:bg-gold-500/10 hover:text-amber-600 disabled:pointer-events-none disabled:opacity-0"
    >
      {children}
    </button>
  );
}
