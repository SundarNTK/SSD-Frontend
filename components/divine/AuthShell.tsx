"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import AdminLoginBackground from "./AdminLoginBackground";
import DivineBackground from "./DivineBackground";
import DivineBackgroundMarigold from "./DivineBackgroundMarigold";
import DivineCard from "./DivineCard";
import LogoMark from "./LogoMark";

export default function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
  cardMaxWidthClassName,
  variant = "classic",
  backdrop = "divine",
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
  cardMaxWidthClassName?: string;
  /** "marigold" swaps in the warmer POS login backdrop/card. Defaults to
   *  "classic" so Admin login, Forgot Password, and Set Password are
   *  unaffected. */
  variant?: "classic" | "marigold";
  /** Admin sign-in uses the temple photo; other classic auth screens keep
   *  the illustrated DivineBackground. */
  backdrop?: "divine" | "admin-photo";
}) {
  const isMarigold = variant === "marigold";

  // Marigold: a single compact card — logo, eyebrow, title and subtitle all
  // live inside it, top-center, the way the reference layout put them,
  // instead of classic's logo-then-heading-then-card stack above it.
  if (isMarigold) {
    return (
      <div className="relative flex min-h-screen w-full items-center justify-center px-4 py-10">
        <DivineBackgroundMarigold />

        <div className="relative z-10 w-full max-w-[400px]">
          <DivineCard
            maxWidthClassName={cardMaxWidthClassName ?? "max-w-[400px]"}
            variant={variant}
          >
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.55 }}
              className="mb-6 flex flex-col items-center text-center"
            >
              <LogoBadge3D />
              <p className="mt-4 font-accent text-[12.5px] uppercase tracking-[0.24em] text-[#7a1f0a]">
                {eyebrow}
              </p>
              <h1
                className="mt-1.5 font-display text-[22px] font-bold text-[#4a1408] sm:text-2xl"
                style={{ textWrap: "balance" as const }}
              >
                {title}
              </h1>
              <p className="mx-auto mt-1.5 max-w-[85vw] font-body text-[12.5px] text-[#7a3220] sm:max-w-none">
                {subtitle}
              </p>
            </motion.div>

            {children}
          </DivineCard>

          {footer && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="mx-auto mt-6 max-w-[400px] text-center font-body text-[12.5px] text-[#7a3220] drop-shadow-[0_1px_8px_rgba(255,255,255,0.5)]"
            >
              {footer}
            </motion.div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative flex min-h-[100dvh] w-full items-center justify-center px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] ${
        backdrop === "admin-photo" ? "isolate overflow-hidden bg-[#2a1408]" : ""
      }`}
    >
      {backdrop === "admin-photo" ? <AdminLoginBackground /> : <DivineBackground />}

      <div className="relative z-10 mt-6 flex w-full flex-col items-center sm:mt-11">
        <div
          className={`relative w-full ${cardMaxWidthClassName ?? "max-w-md"}`}
        >
          {/* Straddles the card's top edge — half the medallion sits above
              the border, half overlaps into the card's own top padding —
              rather than taking up flow height inside the card, which is
              what keeps the whole thing short enough to fit one screen. */}
          <motion.div
            initial={{ opacity: 0, scale: 0.7, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="absolute left-1/2 top-0 z-20 -translate-x-1/2 -translate-y-1/2"
          >
            <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-[#c98a3a]/60 bg-gradient-to-br from-[#fdf6e6] to-[#f7ecd2] p-2 shadow-[0_12px_28px_-8px_rgba(58,20,8,0.5)] sm:h-24 sm:w-24">
              <LogoMark sizeClassName="h-full w-full" />
            </div>
          </motion.div>

          <DivineCard
            maxWidthClassName={cardMaxWidthClassName}
            variant={variant}
          >
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.6 }}
              className="mb-5 mt-8 text-center sm:mt-9"
            >
              <p className="animate-golden-glow font-accent text-[15px] uppercase tracking-[0.28em] text-[#e8590c] sm:text-base">
                {eyebrow}
              </p>
              <h1
                className="mt-2.5 font-display text-2xl font-bold text-[#b3273f] sm:text-[28px]"
                style={{ textWrap: "balance" as const }}
              >
                {title}
              </h1>
              <p className="mx-auto mt-1.5 max-w-[90vw] font-body text-[13px] text-ink-500 sm:max-w-none sm:text-sm sm:whitespace-nowrap">
                {subtitle}
              </p>
            </motion.div>

            {children}

            {footer && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="mt-6 text-center font-body text-[12.5px] text-ink-500"
              >
                {footer}
              </motion.div>
            )}
          </DivineCard>
        </div>
      </div>
    </div>
  );
}

/**
 * The temple emblem alone for the marigold card header — no background
 * badge, just the mark itself at a generous size with a soft 3D drop-shadow
 * for lift. Local to this variant; LogoMark itself (used elsewhere) is
 * untouched.
 */
function LogoBadge3D() {
  return (
    <motion.img
      initial={{ opacity: 0, scale: 0.7, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      src="/assets/logo-mark.png"
      alt="Sri Siva Durga Temple"
      className="h-[112px] w-[112px] object-contain drop-shadow-[0_10px_18px_rgba(180,70,10,0.35)]"
    />
  );
}
