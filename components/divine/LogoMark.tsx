"use client";

import { motion } from "framer-motion";

// Lives in public/assets/ now, not an ES-imported module — Next serves
// public/ files at the root URL as-is, no asset-pipeline hash/import needed.
const logoMark = "/assets/logo-mark.png";

/** The shrine emblem — soft breathing gold halo behind it, gentle entrance on mount. */
export default function LogoMark({
  size = 192,
  sizeClassName,
}: {
  size?: number;
  /** Responsive Tailwind width/height classes (e.g. "h-14 w-14 sm:h-20 sm:w-20")
   *  used instead of the fixed `size` prop — for a spot like the login card
   *  where the logo needs to shrink on short viewports rather than stay a
   *  single fixed px value. Off by default so every existing call site
   *  (Customer Portal placeholder) keeps its current fixed size. */
  sizeClassName?: string;
}) {
  return (
    <motion.div
      className={`relative mx-auto ${sizeClassName ?? ""}`}
      style={sizeClassName ? undefined : { width: size, height: size }}
      initial={{ opacity: 0, scale: 0.7, y: -12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="animate-soft-pulse absolute inset-[-30%] rounded-full bg-[radial-gradient(circle,rgba(212,175,55,0.55),rgba(212,175,55,0.12)_55%,transparent_72%)] blur-md" />
      <img
        src={logoMark}
        alt="Sri Siva Durga Temple"
        className="relative h-full w-full object-contain drop-shadow-[0_0_22px_rgba(212,175,55,0.55)]"
      />
    </motion.div>
  );
}
