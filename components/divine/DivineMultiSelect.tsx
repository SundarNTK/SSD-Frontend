"use client";

import { useEffect, useId, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckIcon, ChevronIcon } from "./icons";
import type { ListboxOption } from "./DivineListbox";

type DivineMultiSelectProps = {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  options: ListboxOption[];
  error?: string;
  placeholder?: string;
  emptyMessage?: string;
};

/**
 * Multi-select in the same visual language as DivineListbox, for fields
 * where several values are legitimate at once (a user's roles today; item
 * categories and event tags later).
 *
 * The panel stays open while ticking — closing after each choice is the
 * usual mistake in multi-selects, and it forces a reopen per selection.
 */
export default function DivineMultiSelect({
  label,
  values,
  onChange,
  options,
  error,
  placeholder = "None selected",
  emptyMessage = "No options available",
}: DivineMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const labelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const selectedOptions = options.filter((o) => values.includes(o.value));

  function toggle(value: string) {
    onChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  }

  return (
    <div className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={labelId}
        className={`group relative w-full rounded-xl border bg-white text-left transition-colors duration-300 ${
          error
            ? "border-crimson-500/70"
            : open
              ? "border-gold-400/80 shadow-[0_0_0_3px_rgba(212,175,55,0.15)]"
              : "border-gold-500/20 hover:border-gold-400/40"
        }`}
      >
        <div className="flex items-center gap-2 px-4 pt-5 pb-2">
          <div className="relative w-full">
            <span id={labelId} className="pointer-events-none absolute -top-[18px] left-0 text-[11px] tracking-wide text-amber-600">
              {label}
            </span>

            {selectedOptions.length === 0 ? (
              <span className="block truncate font-body text-[15px] text-ink-500">{placeholder}</span>
            ) : (
              // Chips rather than a comma-joined string: with several roles
              // assigned, a run-on line truncates and hides which ones.
              <span className="flex flex-wrap gap-1.5 py-0.5">
                {selectedOptions.map((o) => (
                  <span
                    key={o.value}
                    className="inline-flex items-center gap-1 rounded-md border border-gold-500/25 bg-gold-500/10 px-2 py-0.5 text-[12px] text-amber-700"
                  >
                    {o.label}
                    <span
                      role="button"
                      tabIndex={-1}
                      aria-label={`Remove ${o.label}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(o.value);
                      }}
                      className="text-amber-500/70 transition-colors hover:text-crimson-500"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                        <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                      </svg>
                    </span>
                  </span>
                ))}
              </span>
            )}
          </div>
          <ChevronIcon
            className={`shrink-0 self-start text-ink-500 transition-transform duration-200 ${open ? "rotate-180 text-amber-600" : ""}`}
          />
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 cursor-default"
            />
            <motion.ul
              role="listbox"
              aria-multiselectable="true"
              aria-labelledby={labelId}
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 max-h-56 overflow-y-auto rounded-xl border border-gold-500/25 bg-navy-900/85 p-1.5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.75)] backdrop-blur-xl"
            >
              {options.length === 0 && (
                <li className="px-3 py-2.5 text-[13px] text-ink-500">{emptyMessage}</li>
              )}
              {options.map((opt) => {
                const isSelected = values.includes(opt.value);
                return (
                  <li
                    key={opt.value}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => toggle(opt.value)}
                    className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-[13.5px] transition-colors ${
                      isSelected ? "bg-gold-500/15 text-amber-700" : "text-ink-200 hover:bg-navy-800/80 hover:text-ink-100"
                    }`}
                  >
                    <span className="flex items-center gap-2.5 truncate">
                      <span
                        aria-hidden="true"
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                          isSelected ? "border-gold-400 bg-gold-500/25" : "border-gold-500/30"
                        }`}
                      >
                        {isSelected && <CheckIcon />}
                      </span>
                      <span className="truncate">{opt.label}</span>
                    </span>
                  </li>
                );
              })}
            </motion.ul>
          </>
        )}
      </AnimatePresence>

      {error && <p className="mt-1.5 pl-1 text-[12.5px] text-crimson-500">{error}</p>}
    </div>
  );
}
