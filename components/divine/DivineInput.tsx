"use client";

import { forwardRef, useId, useState, type FocusEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { EyeIcon } from "./icons";
import {
  FORM_CONTROL,
  FORM_CONTROL_ERROR,
  FORM_CONTROL_FOCUS,
  FORM_LABEL,
  FORM_PLACEHOLDER,
  defaultEnterPlaceholder,
} from "./formFieldStyles";

type DivineInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  icon?: ReactNode;
  hint?: string;
  revealable?: boolean;
  containerClassName?: string;
  loading?: boolean;
  /** Admin master fields: maroon label above, visible placeholder, peach border. */
  staticLabel?: boolean;
  /** Defaults to the end of the field on master forms, start on login/POS. */
  iconPosition?: "start" | "end";
};

const DivineInput = forwardRef<HTMLInputElement, DivineInputProps>(
  (
    {
      label,
      error,
      icon,
      hint,
      id,
      className = "",
      type = "text",
      revealable,
      containerClassName = "",
      staticLabel = false,
      loading = false,
      placeholder,
      iconPosition,
      ...rest
    },
    ref
  ) => {
    const [focused, setFocused] = useState(false);
    const [revealed, setRevealed] = useState(false);
    const autoId = useId();
    const inputId = id ?? autoId;

    const canReveal = revealable && type === "password";
    const resolvedType = canReveal && revealed ? "text" : type;
    const iconAtEnd = (iconPosition ?? (staticLabel ? "end" : "start")) === "end";

    const focusHandlers = {
      onFocus: (e: FocusEvent<HTMLInputElement>) => {
        setFocused(true);
        rest.onFocus?.(e);
      },
      onBlur: (e: FocusEvent<HTMLInputElement>) => {
        setFocused(false);
        rest.onBlur?.(e);
      },
    };

    const trailing = (
      <>
        {loading && (
          <svg className="h-4 w-4 shrink-0 animate-spin text-amber-600" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
          </svg>
        )}
        {canReveal && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setRevealed((v) => !v)}
            className="shrink-0 text-gray-400 transition-colors hover:text-amber-600"
            aria-label={revealed ? "Hide password" : "Show password"}
          >
            <EyeIcon off={revealed} />
          </button>
        )}
      </>
    );

    if (staticLabel) {
      const shownPlaceholder = placeholder ?? defaultEnterPlaceholder(label);
      return (
        <div className="w-full">
          <label htmlFor={inputId} className={FORM_LABEL}>
            {label}
          </label>
          <div
            className={`${FORM_CONTROL} ${error ? FORM_CONTROL_ERROR : focused ? FORM_CONTROL_FOCUS : ""} ${containerClassName}`}
          >
            {icon && !iconAtEnd && (
              <span className={`shrink-0 ${focused ? "text-amber-600" : "text-gray-400"}`}>{icon}</span>
            )}
            <input
              {...rest}
              id={inputId}
              ref={ref}
              type={resolvedType}
              placeholder={shownPlaceholder}
              {...focusHandlers}
              className={`min-w-0 flex-1 bg-transparent font-body text-[14px] leading-5 text-ink-100 outline-none ${FORM_PLACEHOLDER} ${className}`}
            />
            {icon && iconAtEnd && (
              <span className={`shrink-0 ${focused ? "text-amber-600" : "text-gray-400"}`}>{icon}</span>
            )}
            {trailing}
          </div>
          <FieldMessage error={error} hint={hint} />
        </div>
      );
    }

    const outerWrapClass = "";
    const fieldBoxClass = `group relative rounded-md border bg-white transition-colors duration-300 ${
      error
        ? "border-crimson-500/70"
        : focused
          ? "border-gold-400/80 shadow-[0_0_0_3px_rgba(212,175,55,0.15)]"
          : "border-gray-200 hover:border-gray-300"
    }`;

    return (
      <div className="w-full">
        <div className={outerWrapClass}>
          <div className={`${fieldBoxClass} ${containerClassName}`}>
            <div className="flex items-center gap-2 px-4 py-3.5">
              {icon && (
                <span className={`shrink-0 transition-colors ${focused ? "text-amber-600" : "text-ink-500"}`}>
                  {icon}
                </span>
              )}
              <div className="relative w-full">
                <input
                  {...rest}
                  id={inputId}
                  ref={ref}
                  type={resolvedType}
                  placeholder=" "
                  {...focusHandlers}
                  className={`divine-input w-full bg-transparent font-body text-[15px] text-ink-100 outline-none placeholder:text-transparent ${className}`}
                />
                <label htmlFor={inputId} className="divine-label font-body">
                  {label}
                </label>
              </div>
              {trailing}
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

DivineInput.displayName = "DivineInput";
export default DivineInput;
