"use client";

import { motion } from "framer-motion";
import type { PasswordCheck } from "../../lib/password";

const BAR_COLORS = ["bg-crimson-500", "bg-flame-600", "bg-flame-400", "bg-gold-400", "bg-gold-300"];

export default function PasswordStrengthMeter({
  check,
  show,
}: {
  check: PasswordCheck;
  show: boolean;
}) {
  if (!show) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="mt-3 flex gap-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-navy-700/80">
            <motion.div
              initial={false}
              animate={{ scaleX: i <= check.score && check.score > 0 ? 1 : i === 0 && check.score === 0 ? 0 : 1 }}
              className={`h-full origin-left rounded-full ${i <= check.score ? BAR_COLORS[check.score] : "bg-transparent"}`}
              transition={{ duration: 0.35 }}
            />
          </div>
        ))}
      </div>
      <p
        className={`mt-2 text-[12.5px] font-medium ${
          check.score <= 1 ? "text-crimson-500" : check.score === 2 ? "text-flame-400" : "text-amber-600"
        }`}
      >
        {check.label}
      </p>
      {check.errors.length > 0 && (
        <ul className="mt-2 space-y-1">
          {check.errors.map((e) => (
            <li key={e} className="flex items-start gap-1.5 text-[12px] text-ink-500">
              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-ink-500" />
              {e}
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}
