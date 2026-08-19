"use client";

import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { EyeIcon } from "./icons";

type DivineInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "placeholder"> & {
  label: string;
  error?: string;
  icon?: ReactNode;
  hint?: string;
  /** "password" gets a built-in show/hide toggle for free — no per-page state needed. */
  revealable?: boolean;
};

/**
 * Floating-label input, gold focus ring, room for a leading icon and an
 * optional built-in password reveal toggle.
 *
 * The label float is pure CSS (see `.divine-label` in index.css) rather than
 * React state, so it stays correct for autofilled and browser-restored
 * values that never reach a change handler. That's why the label element
 * sits *after* the input in the DOM — the rule keys off the sibling
 * combinator — and why `placeholder` is fixed to a single space rather than
 * accepted as a prop: `:placeholder-shown` needs a placeholder to match on,
 * and a visible one would collide with the label anyway.
 */
const DivineInput = forwardRef<HTMLInputElement, DivineInputProps>(
  ({ label, error, icon, hint, id, className = "", type = "text", revealable, ...rest }, ref) => {
    const [focused, setFocused] = useState(false);
    const [revealed, setRevealed] = useState(false);
    const autoId = useId();
    const inputId = id ?? autoId;

    const canReveal = revealable && type === "password";
    const resolvedType = canReveal && revealed ? "text" : type;

    return (
      <div className="w-full">
        <div
          className={`group relative rounded-xl border bg-ivory-100 transition-colors duration-300 ${
            error
              ? "border-crimson-500/70"
              : focused
                ? "border-gold-400/80 shadow-[0_0_0_3px_rgba(212,175,55,0.15)]"
                : "border-gold-500/20 hover:border-gold-400/40"
          }`}
        >
          <div className="flex items-center gap-2 px-4 pt-5 pb-2">
            {icon && (
              <span className={`shrink-0 transition-colors ${focused ? "text-amber-600" : "text-ink-500"}`}>
                {icon}
              </span>
            )}
            <div className="relative w-full">
              {/*
                `rest` is spread first on purpose. react-hook-form's
                register() returns its own onBlur, and spreading it after
                these handlers would replace them outright — the focus ring
                would light up and never clear.
              */}
              <input
                {...rest}
                id={inputId}
                ref={ref}
                type={resolvedType}
                placeholder=" "
                onFocus={(e) => {
                  setFocused(true);
                  rest.onFocus?.(e);
                }}
                onBlur={(e) => {
                  setFocused(false);
                  rest.onBlur?.(e);
                }}
                className={`divine-input w-full bg-transparent font-body text-[15px] text-ink-100 outline-none placeholder:text-transparent ${className}`}
              />
              <label htmlFor={inputId} className="divine-label font-body">
                {label}
              </label>
            </div>
            {canReveal && (
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setRevealed((v) => !v)}
                className="shrink-0 text-ink-500 transition-colors hover:text-amber-600"
                aria-label={revealed ? "Hide password" : "Show password"}
              >
                <EyeIcon off={revealed} />
              </button>
            )}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {error ? (
            <motion.p
              key="error"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="mt-1.5 pl-1 text-[12.5px] text-crimson-500"
            >
              {error}
            </motion.p>
          ) : hint ? (
            <p className="mt-1.5 pl-1 text-[12.5px] text-ink-500">{hint}</p>
          ) : null}
        </AnimatePresence>
      </div>
    );
  }
);

DivineInput.displayName = "DivineInput";
export default DivineInput;
