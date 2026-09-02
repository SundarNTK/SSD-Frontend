"use client";

import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

type FormDrawerProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  /** When true, chrome (overlay, gradient header, footer) is hidden on
   *  print so only the drawer body — e.g. a receipt — is printed. */
  printSheet?: boolean;
  /**
   * No longer rendered here — a submit failure pops the same red toast
   * every create/update/delete success already uses (see useAsyncAction
   * and ToastStack), so every master form shows errors the same way
   * without an inline banner duplicating it. Kept optional so existing
   * `error={create.error || update.error}` call sites don't need editing.
   */
  error?: string | null;
  /** Defaults to max-w-2xl — a master with an especially large form (Item,
   *  Service) passes a wider class still. */
  maxWidthClassName?: string;
  /** Circular badge in the header identifying what this form is for (a
   *  shopping bag for Item, etc.). Optional — call sites that still pass
   *  `subtitle` are ignored; the header shows the title only. */
  icon?: ReactNode;
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
  onClose,
  children,
  footer,
  maxWidthClassName = "max-w-2xl",
  icon,
  printSheet = false,
}: FormDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

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
            className={`fixed inset-0 z-40 bg-navy-950/70 backdrop-blur-sm ${printSheet ? "print:hidden" : ""}`}
          />
          <div className={`pointer-events-none fixed inset-0 z-50 flex items-center justify-center overflow-hidden p-3 sm:p-4 ${printSheet ? "print:relative print:inset-auto print:block print:p-0" : ""}`}>
            <motion.div
              key="panel"
              role="dialog"
              aria-modal="true"
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.97 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className={`pointer-events-auto flex max-h-[calc(100dvh-1.5rem)] w-full ${maxWidthClassName} flex-col overflow-hidden rounded-2xl border border-gold-500/25 bg-navy-900 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)] ${printSheet ? "print:max-h-none print:max-w-none print:overflow-visible print:rounded-none print:border-0 print:bg-white print:shadow-none" : ""}`}
            >
              <div className={`relative flex shrink-0 items-center justify-between overflow-hidden bg-maroon px-4 py-2.5 sm:px-5 sm:py-3 ${printSheet ? "print:hidden" : ""}`}>
                <div className="relative flex min-w-0 items-center gap-2.5">
                  {icon && (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#7c1527] text-white">{icon}</span>
                  )}
                  <h2 className="truncate text-[16px] font-bold text-white sm:text-[17px]">{title}</h2>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-crimson-600 text-white shadow-[0_2px_8px_-2px_rgba(0,0,0,0.45)] transition-colors hover:bg-crimson-500"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              <div className={`form-drawer-scroll flex-1 space-y-4 overflow-y-auto bg-white px-4 py-4 sm:px-6 sm:py-5 ${printSheet ? "print:overflow-visible print:p-0" : ""}`}>{children}</div>

              <div className={`relative z-10 shrink-0 border-t border-maroon/15 bg-white px-4 py-3 shadow-[0_-6px_16px_-4px_rgba(0,0,0,0.18)] sm:px-6 ${printSheet ? "print:hidden" : ""}`}>{footer}</div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
