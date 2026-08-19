"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";

type Tone = "error" | "success";

export default function StatusBanner({ tone, children }: { tone: Tone; children: ReactNode }) {
  const isError = tone === "error";
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8, height: 0 }}
        animate={{ opacity: 1, y: 0, height: "auto" }}
        exit={{ opacity: 0, y: -8, height: 0 }}
        className="overflow-hidden"
      >
        <div
          className={`mb-6 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-[13.5px] ${
            isError
              ? "border-crimson-500/40 bg-crimson-500/10 text-crimson-600"
              : "border-gold-400/40 bg-gold-500/10 text-amber-700"
          }`}
        >
          <span className="mt-0.5 shrink-0">
            {isError ? (
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 6a1 1 0 112 0v4a1 1 0 11-2 0V6zm1 8a1.25 1.25 0 100-2.5A1.25 1.25 0 0010 14z"
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
          <span>{children}</span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
