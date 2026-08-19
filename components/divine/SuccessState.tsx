"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

/** Shared "it worked" confirmation block — used after set-password, forgot-password, and any future action that ends in a success screen. */
export default function SuccessState({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="py-4 text-center"
    >
      <div className="animate-soft-pulse mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-gold-400/50 bg-gold-500/10 text-amber-600 shadow-[0_0_24px_-2px_rgba(212,175,55,0.5)]">
        {icon}
      </div>
      <p className="font-accent text-amber-800">{title}</p>
      <p className="mt-1.5 text-[13px] text-ink-500">{subtitle}</p>
    </motion.div>
  );
}

export function CheckIcon() {
  return (
    <svg className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 010 1.4l-7.4 7.4a1 1 0 01-1.4 0L3.3 9.5a1 1 0 111.4-1.4l3.6 3.6 6.7-6.7a1 1 0 011.4 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}