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
  /** Optional second confirm — used when the person can pick one of two
   *  proceed paths (e.g. create GST as inactive vs replace the active one). */
  altConfirmLabel?: string;
  onAltConfirm?: () => void;
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
  altConfirmLabel,
  onAltConfirm,
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
              <h2 className="font-display text-[19px] font-bold text-ink-100">{title}</h2>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-500">{message}</p>

              {error && (
                <p className="mt-4 rounded-xl border border-crimson-500/40 bg-crimson-500/10 px-4 py-3 text-[12.5px] leading-relaxed text-crimson-400">
                  {error}
                </p>
              )}

              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <DivineButton variant="ghost" fullWidth={false} type="button" onClick={onCancel} disabled={loading}>
                  {cancelLabel}
                </DivineButton>
                {altConfirmLabel && onAltConfirm && (
                  <button
                    type="button"
                    onClick={onAltConfirm}
                    disabled={loading}
                    className="w-auto rounded-md border border-maroon/30 bg-white px-4 py-2 font-accent text-[13.5px] font-semibold tracking-wide text-maroon shadow-[0_2px_6px_-1px_rgba(0,0,0,0.08)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:bg-[#faf6f1] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? "Working…" : altConfirmLabel}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={loading}
                  className={`w-auto rounded-md border px-4 py-2 font-accent text-[13.5px] font-semibold tracking-wide shadow-[0_2px_6px_-1px_rgba(0,0,0,0.08)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 active:translate-y-0 active:shadow-[0_2px_6px_-1px_rgba(0,0,0,0.08)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-[0_2px_6px_-1px_rgba(0,0,0,0.08)] ${
                    tone === "danger"
                      ? "border-crimson-600/25 bg-crimson-600 text-white hover:shadow-[0_10px_24px_-6px_rgba(143,28,48,0.55)]"
                      : "border-maroon/30 bg-maroon text-white hover:bg-maroon-hover hover:shadow-[0_10px_24px_-6px_rgba(124,21,39,0.55)]"
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
