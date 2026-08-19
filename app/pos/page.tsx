"use client";

import { motion } from "framer-motion";
import DivineBackground from "../../components/divine/DivineBackground";
import LogoMark from "../../components/divine/LogoMark";

/** Placeholder — the POS counter app has no built screens yet. */
export default function PosPlaceholderPage() {
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center px-4 py-12">
      <DivineBackground />
      <div className="relative z-10 flex flex-col items-center text-center">
        <LogoMark />
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.6 }}
          className="mt-5"
        >
          <p className="animate-golden-glow font-accent text-[15px] uppercase tracking-[0.28em] text-amber-600 sm:text-base">
            Sri Siva Durga Temple
          </p>
          <h1 className="mt-3 font-display text-2xl text-amber-800 sm:text-[28px]">Point of Sale</h1>
          <p className="mx-auto mt-2 max-w-md font-body text-[13px] text-ink-500 sm:text-sm">
            The counter billing app is on its way. Please check back soon.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
