"use client";

import { forwardRef, useEffect, useId, useRef, useState, type TextareaHTMLAttributes } from "react";
import { AnimatePresence, motion } from "framer-motion";

type DivineTextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "placeholder"> & {
  label: string;
  error?: string;
  hint?: string;
};

function resize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

/**
 * Multi-line counterpart to DivineInput — same floating-label mechanics
 * (the `.divine-input` / `.divine-label` CSS pair keys off a class, not the
 * element type, so it works unchanged on a textarea), for fields like a
 * service's description that need more than one line.
 *
 * Grows with its content instead of scrolling internally — `min-h` sets the
 * floor (roughly the old `rows` height) and the effect below raises it to
 * `scrollHeight` on every keystroke, so nothing hides behind a scrollbar.
 * The effect (no dependency array, so it runs after every render) also
 * catches react-hook-form's reset() populating the field programmatically,
 * which never fires the input event our onInput handler listens for.
 */
const DivineTextarea = forwardRef<HTMLTextAreaElement, DivineTextareaProps>(
  ({ label, error, hint, id, className = "", rows = 4, ...rest }, forwardedRef) => {
    const [focused, setFocused] = useState(false);
    const autoId = useId();
    const inputId = id ?? autoId;
    const localRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
      resize(localRef.current);
    });

    return (
      <div className="w-full">
        <div
          className={`group relative rounded-xl border bg-white transition-colors duration-300 ${
            error
              ? "border-crimson-500/70"
              : focused
                ? "border-gold-400/80 shadow-[0_0_0_3px_rgba(212,175,55,0.15)]"
                : "border-gold-500/20 hover:border-gold-400/40"
          }`}
        >
          <div className="flex gap-2 px-4 pt-5 pb-2">
            <div className="relative w-full">
              <textarea
                {...rest}
                id={inputId}
                ref={(el) => {
                  localRef.current = el;
                  if (typeof forwardedRef === "function") forwardedRef(el);
                  else if (forwardedRef) forwardedRef.current = el;
                }}
                rows={rows}
                placeholder=" "
                onFocus={(e) => {
                  setFocused(true);
                  rest.onFocus?.(e);
                }}
                onBlur={(e) => {
                  setFocused(false);
                  rest.onBlur?.(e);
                }}
                onInput={(e) => {
                  resize(e.currentTarget);
                  rest.onInput?.(e);
                }}
                className={`divine-input w-full min-h-[104px] resize-none overflow-hidden bg-transparent font-body text-[15px] text-ink-100 outline-none placeholder:text-transparent ${className}`}
              />
              <label htmlFor={inputId} className="divine-label font-body">
                {label}
              </label>
            </div>
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

DivineTextarea.displayName = "DivineTextarea";
export default DivineTextarea;
