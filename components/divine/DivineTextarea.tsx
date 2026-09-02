"use client";

import { forwardRef, useEffect, useId, useRef, useState, type TextareaHTMLAttributes } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  FORM_CONTROL_MULTILINE,
  FORM_CONTROL_ERROR,
  FORM_CONTROL_FOCUS,
  FORM_LABEL,
  FORM_PLACEHOLDER,
  defaultEnterPlaceholder,
} from "./formFieldStyles";

type DivineTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string;
  hint?: string;
  staticLabel?: boolean;
};

function resize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.max(el.scrollHeight, 104)}px`;
}

const DivineTextarea = forwardRef<HTMLTextAreaElement, DivineTextareaProps>(
  ({ label, error, hint, id, className = "", rows = 4, staticLabel = false, placeholder, ...rest }, forwardedRef) => {
    const [focused, setFocused] = useState(false);
    const autoId = useId();
    const inputId = id ?? autoId;
    const localRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
      resize(localRef.current);
    });

    const assignRef = (el: HTMLTextAreaElement | null) => {
      localRef.current = el;
      if (typeof forwardedRef === "function") forwardedRef(el);
      else if (forwardedRef) forwardedRef.current = el;
    };

    if (staticLabel) {
      const shownPlaceholder = placeholder ?? `${defaultEnterPlaceholder(label)}...`;
      return (
        <div className="w-full">
          <label htmlFor={inputId} className={FORM_LABEL}>
            {label}
          </label>
          <div
            className={`${FORM_CONTROL_MULTILINE} ${error ? FORM_CONTROL_ERROR : focused ? FORM_CONTROL_FOCUS : ""}`}
          >
            <textarea
              {...rest}
              id={inputId}
              ref={assignRef}
              rows={rows}
              placeholder={shownPlaceholder}
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
              className={`w-full min-h-[104px] resize-none overflow-hidden bg-transparent font-body text-[15px] text-ink-100 outline-none ${FORM_PLACEHOLDER} ${className}`}
            />
          </div>
          <FieldMessage error={error} hint={hint} />
        </div>
      );
    }

    const fieldBoxClass = `group relative rounded-xl border bg-white transition-colors duration-300 ${
      error
        ? "border-crimson-500/70"
        : focused
          ? "border-gold-400/80 shadow-[0_0_0_3px_rgba(212,175,55,0.15)]"
          : "border-gray-200 hover:border-gray-300"
    }`;

    return (
      <div className="w-full">
        <div className={fieldBoxClass}>
          <div className="flex gap-2 px-4 pt-5 pb-2">
            <div className="relative w-full">
              <textarea
                {...rest}
                id={inputId}
                ref={assignRef}
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
        <FieldMessage error={error} hint={hint} />
      </div>
    );
  }
);

function FieldMessage({ error, hint }: { error?: string; hint?: string }) {
  return (
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
  );
}

DivineTextarea.displayName = "DivineTextarea";
export default DivineTextarea;
