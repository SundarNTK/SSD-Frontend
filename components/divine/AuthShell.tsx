"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import DivineBackground from "./DivineBackground";
import DivineCard from "./DivineCard";
import LogoMark from "./LogoMark";

export default function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
  cardMaxWidthClassName,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
  cardMaxWidthClassName?: string;
}) {
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
          <p className="animate-golden-glow font-accent text-[15px] uppercase tracking-[0.28em] text-amber-600 sm:text-base">
            {eyebrow}
          </p>
          <h1 className="mt-3 font-display text-2xl text-amber-800 sm:text-[28px]" style={{ textWrap: "balance" as const }}>
            {title}
          </h1>
          <p className="mx-auto mt-2 max-w-[90vw] font-body text-[13px] text-ink-500 sm:max-w-none sm:text-sm sm:whitespace-nowrap">
            {subtitle}
          </p>
        </motion.div>

        <DivineCard maxWidthClassName={cardMaxWidthClassName}>{children}</DivineCard>

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
