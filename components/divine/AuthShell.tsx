"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
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
          <DivineCard maxWidthClassName={cardMaxWidthClassName ?? "max-w-[400px]"} variant={variant}>
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.55 }}
              className="mb-6 flex flex-col items-center text-center"
            >
              <LogoBadge3D />
              <p className="mt-4 font-accent text-[12.5px] uppercase tracking-[0.24em] text-[#7a1f0a]">{eyebrow}</p>
              <h1 className="mt-1.5 font-display text-[22px] font-bold text-[#4a1408] sm:text-2xl" style={{ textWrap: "balance" as const }}>
                {title}
              </h1>
              <p className="mx-auto mt-1.5 max-w-[85vw] font-body text-[12.5px] text-[#7a3220] sm:max-w-none">{subtitle}</p>
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
    <div className="relative flex min-h-screen w-full items-center justify-center px-4 py-12">
      <DivineBackground />

      <div className="relative z-10 flex w-full flex-col items-center">
        <LogoMark />

        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.6 }}
          className="mb-8 mt-5 text-center"
        >
          <p className="animate-golden-glow font-accent text-[15px] uppercase tracking-[0.28em] text-amber-600 sm:text-base">{eyebrow}</p>
          <h1 className="mt-3 font-display text-2xl font-bold text-amber-800 sm:text-[28px]" style={{ textWrap: "balance" as const }}>
            {title}
          </h1>
          <p className="mx-auto mt-2 max-w-[90vw] font-body text-[13px] text-ink-500 sm:max-w-none sm:text-sm sm:whitespace-nowrap">{subtitle}</p>
        </motion.div>

        <DivineCard maxWidthClassName={cardMaxWidthClassName} variant={variant}>
          {children}
        </DivineCard>

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
