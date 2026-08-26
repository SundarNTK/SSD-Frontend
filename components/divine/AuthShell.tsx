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
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center px-4 py-12">
      {isMarigold ? <DivineBackgroundMarigold /> : <DivineBackground />}

      <div className="relative z-10 flex w-full flex-col items-center">
        <LogoMark />

        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.6 }}
          className="mb-8 mt-5 text-center"
        >
          <p
            className={`animate-golden-glow font-accent text-[15px] uppercase tracking-[0.28em] sm:text-base ${
              isMarigold ? "text-[#7a1f0a] drop-shadow-[0_2px_10px_rgba(255,255,255,0.55)]" : "text-amber-600"
            }`}
          >
            {eyebrow}
          </p>
          <h1
            className={`mt-3 font-display text-2xl font-bold sm:text-[28px] ${
              isMarigold ? "text-[#4a1408] drop-shadow-[0_2px_14px_rgba(255,255,255,0.6)]" : "text-amber-800"
            }`}
            style={{ textWrap: "balance" as const }}
          >
            {title}
          </h1>
          <p
            className={`mx-auto mt-2 max-w-[90vw] font-body text-[13px] sm:max-w-none sm:text-sm sm:whitespace-nowrap ${
              isMarigold ? "text-[#7a3220] drop-shadow-[0_1px_8px_rgba(255,255,255,0.5)]" : "text-ink-500"
            }`}
          >
            {subtitle}
          </p>
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
