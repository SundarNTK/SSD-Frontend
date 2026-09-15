"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ClockIcon } from "./icons";
import { FORM_CONTROL_ERROR, FORM_CONTROL_FOCUS, FORM_CONTROL_SHELL, FORM_LABEL, FORM_MUTED } from "./formFieldStyles";
import { formatHHMMDisplay, parseHHMM, toHHMM } from "../../lib/datetime";

type DivineTimePickerProps = {
  label: string;
  /** 24-hour "HH:mm", or "" for empty. */
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  placeholder?: string;
  containerClassName?: string;
  /** Same convention as DivineDatePicker's staticLabel — an admin master-form field. */
  staticLabel?: boolean;
};

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1); // 1–12
const MINUTES = Array.from({ length: 60 }, (_, i) => i); // 0–59
const PERIODS: Array<"AM" | "PM"> = ["AM", "PM"];

const PANEL_WIDTH = 220;
const PANEL_HEIGHT = 290;
const COLUMN_HEIGHT = 208;

/**
 * Replaces the browser's native `<input type="time">` — a Chrome-only
 * three-segment widget that can't be restyled at all and looks nothing
 * like the rest of the admin panel, the same reason DivineDatePicker
 * exists for `type="date"`. Every "HH:mm" field in the app (Event slot
 * times, Hall Booking's start/end times) should render through this one
 * component so a future change to how time is picked only has to happen
 * once.
 */
export default function DivineTimePicker({
  label,
  value,
  onChange,
  error,
  hint,
  placeholder = "Select a time",
  containerClassName = "",
  staticLabel = false,
}: DivineTimePickerProps) {
  const parsed = parseHHMM(value);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const hourListRef = useRef<HTMLDivElement>(null);
  const minuteListRef = useRef<HTMLDivElement>(null);
  const periodListRef = useRef<HTMLDivElement>(null);
  const labelId = useId();

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

  // Scroll each column to its current value (or the top, if nothing's been
  // picked yet) the moment the panel opens, so picking a time never starts
  // with a blind scroll through an hour list that opens at "1".
  useEffect(() => {
    if (!open) return;
    const scrollTo = (container: HTMLDivElement | null, selector: string) => {
      container?.querySelector<HTMLButtonElement>(selector)?.scrollIntoView({ block: "center" });
    };
    scrollTo(hourListRef.current, `[data-hour="${parsed?.hour12 ?? 12}"]`);
    scrollTo(minuteListRef.current, `[data-minute="${parsed?.minute ?? 0}"]`);
    scrollTo(periodListRef.current, `[data-period="${parsed?.period ?? "AM"}"]`);
    // Only on open — not on every keystroke of picking, which would keep
    // yanking the list back to the selected row mid-scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function pickHour(hour12: number) {
    onChange(toHHMM(hour12, parsed?.minute ?? 0, parsed?.period ?? "AM"));
  }
  function pickMinute(minute: number) {
    onChange(toHHMM(parsed?.hour12 ?? 12, minute, parsed?.period ?? "AM"));
  }
  function pickPeriod(period: "AM" | "PM") {
    onChange(toHHMM(parsed?.hour12 ?? 12, parsed?.minute ?? 0, period));
  }

  function pickNow() {
    const now = new Date();
    const hour24 = now.getHours();
    onChange(toHHMM(hour24 % 12 || 12, now.getMinutes(), hour24 >= 12 ? "PM" : "AM"));
  }

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

  const display = formatHHMMDisplay(value);

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
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-labelledby={labelId}
          className={`${triggerClass} ${containerClassName}`}
        >
          <div className={`flex items-center gap-2 ${staticLabel ? "h-10 px-3" : "px-4 pt-5 pb-2"}`}>
            {!staticLabel && (
              <span className={`shrink-0 transition-colors ${open ? "text-amber-600" : "text-ink-500"}`}>
                <ClockIcon />
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
              <span
                className={`block truncate font-body tabular-nums ${staticLabel ? "text-[14px] leading-5" : "text-[15px]"} ${
                  display ? "text-ink-100" : staticLabel ? FORM_MUTED : "text-ink-500"
                }`}
              >
                {display || placeholder}
              </span>
            </div>
            {display && (
              <span
                role="button"
                tabIndex={-1}
                aria-label="Clear time"
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
                <ClockIcon />
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
                aria-label="Close time picker"
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

                <div className="mb-2 grid grid-cols-3 gap-1 px-1 text-center text-[10px] uppercase tracking-wide text-ink-500">
                  <span>Hour</span>
                  <span>Min</span>
                  <span>&nbsp;</span>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  <TimeColumn
                    listRef={hourListRef}
                    items={HOURS}
                    dataAttr="data-hour"
                    isSelected={(h) => h === parsed?.hour12}
                    onPick={pickHour}
                    format={(h) => String(h)}
                  />
                  <TimeColumn
                    listRef={minuteListRef}
                    items={MINUTES}
                    dataAttr="data-minute"
                    isSelected={(m) => m === parsed?.minute}
                    onPick={pickMinute}
                    format={(m) => String(m).padStart(2, "0")}
                  />
                  <div ref={periodListRef} className="flex flex-col gap-1.5" style={{ height: COLUMN_HEIGHT }}>
                    {PERIODS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        data-period={p}
                        onClick={() => pickPeriod(p)}
                        className={`h-9 shrink-0 rounded-lg text-[13px] font-semibold tracking-wide transition-colors ${
                          p === parsed?.period
                            ? "bg-gold-500 text-navy-950 shadow-[0_2px_10px_-2px_rgba(212,175,55,0.7)]"
                            : "text-ink-100 hover:bg-gold-500/15 hover:text-amber-700"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

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
                    onClick={pickNow}
                    className="rounded-lg px-2 py-1 text-[12px] text-amber-600 transition-colors hover:text-amber-700"
                  >
                    Now
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg bg-maroon px-3 py-1 text-[12px] font-medium text-white transition-colors hover:bg-maroon-hover"
                  >
                    Done
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

function TimeColumn<T extends number>({
  listRef,
  items,
  dataAttr,
  isSelected,
  onPick,
  format,
}: {
  listRef: React.RefObject<HTMLDivElement | null>;
  items: T[];
  dataAttr: string;
  isSelected: (item: T) => boolean;
  onPick: (item: T) => void;
  format: (item: T) => string;
}) {
  return (
    <div ref={listRef} className="flex flex-col gap-0.5 overflow-y-auto pr-0.5" style={{ height: COLUMN_HEIGHT }}>
      {items.map((item) => {
        const selected = isSelected(item);
        return (
          <button
            key={item}
            type="button"
            {...{ [dataAttr]: item }}
            onClick={() => onPick(item)}
            className={`h-8 shrink-0 rounded-lg text-[13px] tabular-nums transition-colors ${
              selected
                ? "bg-gold-500 font-semibold text-navy-950 shadow-[0_2px_10px_-2px_rgba(212,175,55,0.7)]"
                : "text-ink-100 hover:bg-gold-500/15 hover:text-amber-700"
            }`}
          >
            {format(item)}
          </button>
        );
      })}
    </div>
  );
}
