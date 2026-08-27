"use client";

import { AnimatePresence, motion } from "framer-motion";
import { getTempleTimeParts, useTempleClock, TEMPLE_TIME_ZONE_LABEL } from "../../lib/datetime";

/**
 * Live Singapore-time clock for the topbar.
 *
 * The motion is deliberately restrained by default — only the digit that
 * actually changed animates, and the separators fade slowly rather than
 * blinking. The Admin Panel shell is the one screen people sit in for hours
 * (the cinematic treatment belongs to the auth pages), so the clock should
 * read as quietly alive rather than compete with the work.
 *
 * `variant="flame"` opts a single call site (the POS counter header, which
 * already runs a bolder red/orange/gold theme) into a livelier gradient
 * border, warmer digit colors, and an ambient shimmer — additive so the
 * Admin Topbar's default look is untouched.
 */
export default function TempleClock({ variant = "default" }: { variant?: "default" | "flame" }) {
  const now = useTempleClock();
  const { hour, minute, second, dayPeriod, date } = getTempleTimeParts(now);

  if (variant === "flame") {
    return (
      <div className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-crimson-500/70 via-flame-500/70 to-[#FFC145]/70 p-[1.5px] shadow-[0_4px_16px_-8px_rgba(255,122,46,0.4)] transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-8px_rgba(255,122,46,0.6)]">
        <div className="relative flex items-center gap-3 overflow-hidden rounded-[10px] bg-white/95 px-3 py-1.5 backdrop-blur-md sm:px-3.5">
          {/* Ambient shimmer, gold at rest — crossfades to a silver sweep on
              hover (two overlapping layers whose opacity swaps, since a
              gradient's own colors can't be transitioned directly). */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0 -translate-x-[160%] animate-[shimmer-sweep_6s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-[#FFD700]/25 to-transparent opacity-100 transition-opacity duration-500 group-hover:opacity-0"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0 -translate-x-[160%] animate-[shimmer-sweep_6s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-slate-300/45 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          />
          <span className="relative z-10 flex h-1.5 w-1.5 shrink-0" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-soft-pulse rounded-full bg-flame-400" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-crimson-500" />
          </span>

          <div className="relative z-10 leading-tight">
            <p className="hidden text-[10px] uppercase tracking-[0.14em] text-ink-500 md:block">
              {date} &middot; {TEMPLE_TIME_ZONE_LABEL}
            </p>

            <p className="flex items-baseline font-accent text-[14.5px] font-bold tabular-nums text-flame-600 sm:text-[15px]">
              <TimeUnit value={hour} />
              <Separator className="text-flame-500/80" />
              <TimeUnit value={minute} />
              <Separator className="text-flame-500/80" />
              <TimeUnit value={second} className="text-crimson-500" />
              <span className="ml-1.5 text-[10.5px] font-medium tracking-wide text-ink-500">{dayPeriod}</span>
              <span className="ml-1.5 text-[10px] font-medium tracking-wide text-ink-500 md:hidden">
                {TEMPLE_TIME_ZONE_LABEL}
              </span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-gold-500/25 bg-white px-3 py-1.5 shadow-[0_1px_4px_rgba(0,0,0,0.06)] sm:px-3.5">
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

function Separator({ className = "text-amber-600/70" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`animate-clock-colon mx-[1px] ${className}`}>
      :
    </span>
  );
}
