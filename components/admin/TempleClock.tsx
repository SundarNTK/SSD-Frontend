"use client";

import { AnimatePresence, motion } from "framer-motion";
import { getTempleTimeParts, useTempleClock, TEMPLE_TIME_ZONE_LABEL } from "../../lib/datetime";

/**
 * Live Singapore-time clock for the topbar.
 *
 * The motion is deliberately restrained — only the digit that actually
 * changed animates, and the separators fade slowly rather than blinking.
 * The Admin Panel shell is the one screen people sit in for hours (the
 * cinematic treatment belongs to the auth pages), so the clock should read
 * as quietly alive rather than compete with the work.
 */
export default function TempleClock() {
  const now = useTempleClock();
  const { hour, minute, second, dayPeriod, date } = getTempleTimeParts(now);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-gold-500/15 bg-ivory-100 px-3 py-1.5 sm:px-3.5">
      <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-soft-pulse rounded-full bg-gold-400" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-gold-300" />
      </span>

      <div className="leading-tight">
        {/* The date is the first thing to go when space is tight — the time
            is what someone actually glances up for. */}
        <p className="hidden text-[10px] uppercase tracking-[0.14em] text-ink-500 md:block">
          {date} &middot; {TEMPLE_TIME_ZONE_LABEL}
        </p>

        <p className="flex items-baseline font-accent text-[14.5px] tabular-nums text-amber-700 sm:text-[15px]">
          <TimeUnit value={hour} />
          <Separator />
          <TimeUnit value={minute} />
          <Separator />
          <TimeUnit value={second} className="text-amber-600" />
          <span className="ml-1.5 text-[10.5px] tracking-wide text-ink-500">{dayPeriod}</span>
          <span className="ml-1.5 text-[10px] tracking-wide text-ink-500 md:hidden">
            {TEMPLE_TIME_ZONE_LABEL}
          </span>
        </p>
      </div>
    </div>
  );
}

/**
 * Animates only when its own value changes, so the hour sits still while
 * the seconds roll. `inline-grid` with both the outgoing and incoming digit
 * stacked in one cell keeps the width fixed — without it the line reflows
 * on every tick as the exiting copy leaves the flow.
 */
function TimeUnit({ value, className = "" }: { value: string; className?: string }) {
  return (
    <span className={`relative inline-grid overflow-hidden ${className}`} style={{ minWidth: "2ch" }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: "-70%", opacity: 0 }}
          animate={{ y: "0%", opacity: 1 }}
          exit={{ y: "70%", opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
          className="col-start-1 row-start-1 text-center"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function Separator() {
  return (
    <span aria-hidden="true" className="animate-clock-colon mx-[1px] text-amber-600/70">
      :
    </span>
  );
}
