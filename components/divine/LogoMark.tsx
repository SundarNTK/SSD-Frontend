"use client";

import { motion } from "framer-motion";

// Lives in public/assets/ now, not an ES-imported module — Next serves
// public/ files at the root URL as-is, no asset-pipeline hash/import needed.
const logoMark = "/assets/logo-mark.png";

/** The shrine emblem — soft breathing gold halo behind it, gentle entrance on mount. */
export default function LogoMark({ size = 192 }: { size?: number }) {
  return (
    <motion.div
      className="relative mx-auto"
      style={{ width: size, height: size }}
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
