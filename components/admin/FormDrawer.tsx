"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

type FormDrawerProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  /**
   * No longer rendered here — a submit failure pops the same red toast
   * every create/update/delete success already uses (see useAsyncAction
   * and ToastStack), so every master form shows errors the same way
   * without an inline banner duplicating it. Kept optional so existing
   * `error={create.error || update.error}` call sites don't need editing.
   */
  error?: string | null;
  /** Defaults to max-w-lg — Item Master's larger form passes a wider class. */
  maxWidthClassName?: string;
};

/**
 * Centered modal every master's create/edit form renders inside — one
 * shell, reused by Roles, Permissions, Users, and every master after them.
 *
 * Was a right-edge slide-over with a spring transition; a spring can
 * overshoot and settle slowly, which read as lag for something that opens
 * on every create/edit click. Now the same fast fade+scale as ConfirmDialog
 * (duration: 0.18s), so the two feel like one consistent "modal" language
 * instead of two different motion systems.
 */
export default function FormDrawer({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  maxWidthClassName = "max-w-lg",
}: FormDrawerProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-navy-950/70 backdrop-blur-sm"
          />
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              key="panel"
              role="dialog"
              aria-modal="true"
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.97 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className={`pointer-events-auto flex max-h-[85vh] w-full ${maxWidthClassName} flex-col overflow-hidden rounded-2xl border border-gold-500/20 bg-navy-900 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)]`}
            >
              <div className="flex items-start justify-between border-b border-gold-500/10 px-4 py-4 sm:px-6 sm:py-5">
                <div>
                  <h2 className="font-display text-[19px] font-bold text-ink-100">{title}</h2>
                  {subtitle && <p className="mt-0.5 text-[12.5px] text-ink-500">{subtitle}</p>}
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="rounded-lg p-1.5 text-ink-500 transition-colors hover:bg-ivory-100 hover:text-ink-100"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">{children}</div>

              <div className="border-t border-gold-500/10 px-4 py-3 sm:px-6 sm:py-4">{footer}</div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
