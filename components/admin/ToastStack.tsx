"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useToastStore } from "../../lib/toastStore";
import { PlusIcon, TrashIcon } from "../divine/icons";

// Solid, saturated surfaces — the same gold-gradient-button language used
// everywhere else in the app — rather than a white card with a small
// tinted icon, which read as too close to the page background to notice.
const TONE_CARD = {
  create: "bg-gradient-to-r from-gold-300 via-gold-400 to-gold-500 text-navy-950 shadow-[0_20px_50px_-12px_rgba(212,175,55,0.6)]",
  update: "bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-[0_20px_50px_-12px_rgba(37,99,235,0.5)]",
  delete: "bg-gradient-to-r from-crimson-500 to-crimson-600 text-white shadow-[0_20px_50px_-12px_rgba(179,39,63,0.55)]",
  error: "bg-gradient-to-r from-crimson-500 to-crimson-600 text-white shadow-[0_20px_50px_-12px_rgba(179,39,63,0.55)]",
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
  // update
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
 * The confirmation half of every create/update/delete flow — mounted once
 * in AdminLayout, so any page just calls `toast.created/updated/deleted(...)`
 * and it shows up here regardless of which screen triggered it.
 *
 * Centered on the viewport like the modals it follows (FormDrawer,
 * ConfirmDialog), including their same dimmed/blurred backdrop, so it
 * reads as the direct continuation of the dialog that just closed instead
 * of a separate, easy-to-miss notification system. The backdrop is
 * pointer-events-none, though — unlike a modal this never actually blocks
 * interaction, it just looks the same for the second it's up.
 */
export default function ToastStack() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed inset-0 z-[80] flex flex-col items-center justify-center gap-2.5 p-4">
      <AnimatePresence>
        {toasts.length > 0 && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 -z-10 bg-navy-950/50 backdrop-blur-sm"
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className={`pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl px-4 py-3.5 text-[13.5px] font-medium ${TONE_CARD[t.tone]}`}
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
