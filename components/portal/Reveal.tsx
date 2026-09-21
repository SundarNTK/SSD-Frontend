"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Fades and lifts its children into view the first time they scroll on
 * screen. A thin client wrapper so the section components themselves can stay
 * Server Components (SEO-friendly, no JS for static markup).
 */
export default function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
