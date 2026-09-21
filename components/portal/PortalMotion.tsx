"use client";

import { MotionConfig, motion, useScroll, useSpring } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Wraps the whole public portal: honours the visitor's "reduce motion" OS
 * setting for every framer-motion animation inside it, and draws a thin gold
 * reading-progress bar along the top edge that fills as the page scrolls.
 */
export default function PortalMotion({ children }: { children: ReactNode }) {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 28, mass: 0.4 });

  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        style={{ scaleX }}
        className="fixed inset-x-0 top-0 z-[60] h-[3px] origin-left bg-gradient-to-r from-gold-500 via-flame-500 to-crimson-500"
        aria-hidden="true"
      />
      {children}
    </MotionConfig>
  );
}
