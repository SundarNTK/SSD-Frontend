"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";

type Tone = "error" | "success" | "warning";

export default function StatusBanner({
  tone,
  children,
  className = "mb-6",
}: {
  tone: Tone;
  children: ReactNode;
  className?: string;
}) {
  const isError = tone === "error";
  const isWarning = tone === "warning";
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8, height: 0 }}
        animate={{ opacity: 1, y: 0, height: "auto" }}
        exit={{ opacity: 0, y: -8, height: 0 }}
        className="overflow-hidden"
      >
        <div
          role={isError || isWarning ? "alert" : undefined}
          className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-[13.5px] ${className} ${
            isError
              ? "border-crimson-500/40 bg-crimson-500/10 text-crimson-600"
              : isWarning
                ? "border-amber-500/50 bg-amber-50 text-left text-amber-950 shadow-[0_8px_22px_-14px_rgba(166,116,32,0.55)]"
                : "border-gold-400/40 bg-gold-500/10 text-amber-700"
          }`}
        >
          <span
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
              isWarning ? "bg-amber-500/20 text-amber-700" : ""
            }`}
          >
            {isError ? (
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 6a1 1 0 112 0v4a1 1 0 11-2 0V6zm1 8a1.25 1.25 0 100-2.5A1.25 1.25 0 0010 14z"
                  clipRule="evenodd"
                />
              </svg>
            ) : isWarning ? (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M10.29 3.86c.77-1.33 2.65-1.33 3.42 0l8.09 14.01c.75 1.3-.19 2.93-1.71 2.93H3.91c-1.52 0-2.46-1.63-1.71-2.93L10.29 3.86zM12 9a1 1 0 00-1 1v3.5a1 1 0 102 0V10a1 1 0 00-1-1zm0 8a1.25 1.25 0 100-2.5A1.25 1.25 0 0012 17z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M16.7 5.3a1 1 0 010 1.4l-7.4 7.4a1 1 0 01-1.4 0L3.3 9.5a1 1 0 111.4-1.4l3.6 3.6 6.7-6.7a1 1 0 011.4 0z"
                  clipRule="evenodd"
                />
              </svg>
            )}
          </span>
          {isWarning ? (
            <div className="min-w-0 pt-0.5">
              <p className="font-accent text-[11px] font-bold uppercase tracking-[0.16em] text-amber-800">Warning</p>
              <p className="mt-1 leading-relaxed text-[13px] text-amber-950">{children}</p>
            </div>
          ) : (
            <span>{children}</span>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/** Urgent stay-on-page notice — crimson with a warm amber wash, not the gold “success” banner. */
export function StayOnPageWarning({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={`mt-2 rounded-lg border border-crimson-500/65 bg-gradient-to-r from-crimson-500/16 via-[#fff5f5] to-amber-500/12 text-left ${className}`}
    >
      <div className="flex items-center gap-2 border-l-[4px] border-crimson-600 px-2.5 py-1">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-crimson-500 text-white">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path
              fillRule="evenodd"
              d="M10.29 3.86c.77-1.33 2.65-1.33 3.42 0l8.09 14.01c.75 1.3-.19 2.93-1.71 2.93H3.91c-1.52 0-2.46-1.63-1.71-2.93L10.29 3.86zM12 9a1 1 0 00-1 1v3.5a1 1 0 102 0V10a1 1 0 00-1-1zm0 8a1.25 1.25 0 100-2.5A1.25 1.25 0 0012 17z"
              clipRule="evenodd"
            />
          </svg>
        </span>
        <p className="min-w-0 text-[12px] leading-snug text-crimson-600">
          <span className="font-accent font-bold uppercase tracking-[0.12em]">Warning: </span>
          {children}
        </p>
      </div>
    </div>
  );
}
