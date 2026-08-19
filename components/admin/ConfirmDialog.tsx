"use client";

import { AnimatePresence, motion } from "framer-motion";
import DivineButton from "../divine/DivineButton";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
  loading?: boolean;
  /** Shown inside the dialog rather than behind it — a refusal is the answer to the question being asked. */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Shared confirmation step for destructive actions.
 *
 * It keeps the dialog open when the server refuses, so the reason lands
 * where the person is looking. Deletes here are frequently *rejected* by
 * design — a role still assigned to someone, for instance — and that
 * explanation is the most useful thing on screen, not an error to dismiss.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
  loading,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={loading ? undefined : onCancel}
            className="fixed inset-0 z-[70] bg-navy-950/75 backdrop-blur-sm"
          />
          <div className="pointer-events-none fixed inset-0 z-[71] flex items-center justify-center p-4">
            <motion.div
              role="dialog"
              aria-modal="true"
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.97 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="pointer-events-auto w-full max-w-md rounded-2xl border border-gold-500/20 bg-navy-900 p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)]"
            >
              <h2 className="font-display text-[19px] text-ink-100">{title}</h2>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-500">{message}</p>

              {error && (
                <p className="mt-4 rounded-xl border border-crimson-500/40 bg-crimson-500/10 px-4 py-3 text-[12.5px] leading-relaxed text-crimson-400">
                  {error}
                </p>
              )}

              <div className="mt-6 flex gap-3">
                <DivineButton variant="ghost" type="button" onClick={onCancel} disabled={loading}>
                  {cancelLabel}
                </DivineButton>
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={loading}
                  className={`w-full rounded-xl px-5 py-3 font-accent text-[15px] font-semibold tracking-wide transition-[transform,box-shadow] hover:scale-[1.015] active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100 disabled:hover:shadow-none ${
                    tone === "danger"
                      ? "bg-gradient-to-b from-crimson-500 to-crimson-600 text-white hover:shadow-[0_0_20px_2px_rgba(179,39,63,0.7)]"
                      : "bg-gradient-to-b from-gold-300 via-gold-500 to-gold-600 text-navy-950 hover:shadow-[0_0_22px_2px_rgba(212,175,55,0.75)]"
                  }`}
                >
                  {loading ? "Working…" : confirmLabel}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
