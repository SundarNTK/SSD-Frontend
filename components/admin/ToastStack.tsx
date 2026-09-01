"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useToastStore } from "../../lib/toastStore";
import { PlusIcon, TrashIcon } from "../divine/icons";

const TONE_CARD = {
  create: "bg-gold-500 text-navy-950 shadow-[0_10px_28px_-10px_rgba(212,175,55,0.55)]",
  update: "bg-blue-600 text-white shadow-[0_10px_28px_-10px_rgba(37,99,235,0.45)]",
  delete: "bg-crimson-600 text-white shadow-[0_10px_28px_-10px_rgba(179,39,63,0.5)]",
  error: "bg-crimson-600 text-white shadow-[0_10px_28px_-10px_rgba(179,39,63,0.5)]",
} as const;

const TONE_ICON_BG = {
  create: "bg-navy-950/10",
  update: "bg-white/20",
  delete: "bg-white/20",
  error: "bg-white/20",
} as const;

const TONE_DISMISS = {
  create: "text-navy-950/50 hover:text-navy-950",
  update: "text-white/70 hover:text-white",
  delete: "text-white/70 hover:text-white",
  error: "text-white/70 hover:text-white",
} as const;

function ToastIcon({ tone }: { tone: keyof typeof TONE_CARD }) {
  if (tone === "create") return <PlusIcon />;
  if (tone === "delete") return <TrashIcon />;
  if (tone === "error") {
    return (
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 6a1 1 0 112 0v4a1 1 0 11-2 0V6zm1 8a1.25 1.25 0 100-2.5A1.25 1.25 0 0010 14z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 010 1.4l-7.4 7.4a1 1 0 01-1.4 0L3.3 9.5a1 1 0 111.4-1.4l3.6 3.6 6.7-6.7a1 1 0 011.4 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/**
 * Short-lived notice on the same list/form screen — no dimmed full-page
 * overlay. Create/update/delete just call `toast.created/updated/deleted(...)`
 * and the banner sits in the top-right of the current page, then disappears.
 */
export default function ToastStack() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed top-20 right-4 z-[80] flex w-[min(100%-2rem,24rem)] flex-col items-end gap-2 sm:right-6">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, x: 24, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 16, scale: 0.98 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className={`pointer-events-auto flex w-full items-center gap-3 rounded-xl px-4 py-3 text-[13.5px] font-medium ${TONE_CARD[t.tone]}`}
          >
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${TONE_ICON_BG[t.tone]}`}>
              <ToastIcon tone={t.tone} />
            </span>
            <span className="flex-1">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              className={`shrink-0 transition-colors ${TONE_DISMISS[t.tone]}`}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
