"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

/** Glass card with a hairline gold border and filigree corners — the vessel every auth form sits in. */
export default function DivineCard({
  children,
  maxWidthClassName = "max-w-md",
  variant = "classic",
}: {
  children: ReactNode;
  /** Login/Forgot/Set-Password stay at the default single-column width; a form with paired-column rows (Register) opts into something wider. */
  maxWidthClassName?: string;
  /** "marigold" pairs with AuthShell's same variant — a warmer marigold/
   *  crimson glow and border instead of the classic gold, for the POS
   *  login's warmer background. Defaults to "classic" so every other
   *  call site (Admin login, Forgot Password, Set Password) is unaffected. */
  variant?: "classic" | "marigold";
}) {
  const isMarigold = variant === "marigold";
  return (
    <motion.div
      initial={{ opacity: 0, y: 28, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
      className={`relative w-full ${maxWidthClassName}`}
    >
      {/* outer glow — a slow breathing halo, not just a static outline */}
      <div
        className={`animate-soft-pulse absolute -inset-1 rounded-[28px] blur-md ${
          isMarigold
            ? "bg-gradient-to-br from-[#FF8A3D]/50 via-[#F5A623]/25 to-transparent"
            : "bg-gradient-to-br from-gold-400/50 via-gold-500/20 to-transparent"
        }`}
      />

      <div
        className={`relative overflow-hidden rounded-[26px] ${
          isMarigold
            ? "border-3 border-white/70 bg-white/65 shadow-[0_20px_60px_-20px_rgba(120,50,10,0.5),0_0_36px_-8px_rgba(255,255,255,0.45),inset_0_1px_0_rgba(255,255,255,0.6)] backdrop-blur-lg backdrop-saturate-150"
            : "border border-gold-500/25 bg-navy-900/70 shadow-[0_20px_70px_-20px_rgba(0,0,0,0.7)] backdrop-blur-2xl"
        }`}
      >
        {/* glass sheen — a soft diagonal highlight so the panel reads as a
            pane of light-catching glass rather than a flat blurred fill */}
        {isMarigold && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/35 via-white/5 to-transparent"
          />
        )}

        {/* top hairline shimmer */}
        <div
          className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent to-transparent ${
            isMarigold ? "via-white/90" : "via-gold-300/80"
          }`}
        />

        {/* corner flourishes — skipped on marigold, which goes for a
            cleaner, more modern card than the classic filigree look */}
        {!isMarigold && (
          <>
            <CornerFlourish className="left-3 top-3" variant={variant} />
            <CornerFlourish
              className="right-3 top-3 -scale-x-100"
              variant={variant}
            />
            <CornerFlourish
              className="bottom-3 left-3 -scale-y-100"
              variant={variant}
            />
            <CornerFlourish
              className="bottom-3 right-3 -scale-x-100 -scale-y-100"
              variant={variant}
            />
          </>
        )}

        <div
          className={
            isMarigold
              ? "relative px-7 py-8 sm:px-8"
              : "relative px-8 py-10 sm:px-10"
          }
        >
          {children}
        </div>
      </div>
    </motion.div>
  );
}

function CornerFlourish({
  className = "",
  variant = "classic",
}: {
  className?: string;
  variant?: "classic" | "marigold";
}) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={`pointer-events-none absolute h-8 w-8 ${variant === "marigold" ? "text-[#E0396B]/45" : "text-amber-500/50"} ${className}`}
      aria-hidden="true"
    >
      <path
        d="M2 20 C2 9 9 2 20 2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <circle cx="20" cy="2" r="1.4" fill="currentColor" />
      <circle cx="2" cy="20" r="1.4" fill="currentColor" />
    </svg>
  );
}
