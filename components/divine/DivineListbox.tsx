"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CheckIcon, ChevronIcon } from "./icons";

export type ListboxOption = { value: string; label: string };

type DivineListboxProps = {
  /** Omit for a compact toolbar filter (no floating label, shorter box) — see DataTable's status filter. */
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: ListboxOption[];
  error?: string;
  placeholder?: string;
  className?: string;
};

type PanelPosition = { left: number; width: number; maxHeight: number; upward: boolean; top?: number; bottom?: number };

const PANEL_MAX_HEIGHT = 256; // matches max-h-64 below
const GAP = 8;

/**
 * A native <select>'s dropdown popup is OS chrome — no border-radius,
 * backdrop-blur, or theme color reaches it in most browsers, so it always
 * rendered as a plain white/black system list no matter what CSS was on
 * the <select> itself. This renders the whole thing (trigger + panel) as
 * real DOM instead, styled like every other divine input, so the dropdown
 * finally matches the rest of the page.
 *
 * The panel renders through a portal at a fixed position rather than
 * inline. Listboxes sit inside a FormDrawer's scrolling body, and an
 * absolutely positioned panel there gets clipped by that scroll container
 * once the trigger nears the bottom of the form — a portal escapes it, and
 * flips the panel above the trigger when there isn't room below (same
 * pattern as DivineDatePicker).
 */
export default function DivineListbox({
  label,
  value,
  onChange,
  options,
  error,
  placeholder = "Select…",
  className = "",
}: DivineListboxProps) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<PanelPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const triggerId = useId();
  const selected = options.find((o) => o.value === value);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;

    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const upward = spaceBelow < PANEL_MAX_HEIGHT + GAP && spaceAbove > spaceBelow;
      const maxHeight = Math.min(PANEL_MAX_HEIGHT, (upward ? spaceAbove : spaceBelow) - GAP * 2);

      setPanel({
        left: rect.left,
        width: rect.width,
        maxHeight,
        upward,
        top: upward ? undefined : rect.bottom + GAP,
        bottom: upward ? window.innerHeight - rect.top + GAP : undefined,
      });
    };

    place();
    window.addEventListener("resize", place);
    // `true` captures scrolling inside the drawer, not just the window.
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  return (
    <div className={`relative ${className || "w-full"}`}>
      <button
        ref={triggerRef}
        type="button"
        id={triggerId}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`group relative w-full rounded-xl border bg-white text-left transition-colors duration-300 ${
          error
            ? "border-crimson-500/70"
            : open
              ? "border-gold-400/80 shadow-[0_0_0_3px_rgba(212,175,55,0.15)]"
              : "border-gold-500/20 hover:border-gold-400/40"
        }`}
      >
        {label ? (
          <div className="flex items-center gap-2 px-4 pt-5 pb-2">
            <div className="relative w-full">
              <span className="pointer-events-none absolute -top-[18px] left-0 text-[11px] tracking-wide text-amber-600">
                {label}
              </span>
              <span className={`block truncate font-body text-[15px] ${selected ? "text-ink-100" : "text-ink-500"}`}>
                {selected?.label ?? placeholder}
              </span>
            </div>
            <ChevronIcon className={`shrink-0 text-ink-500 transition-transform duration-200 ${open ? "rotate-180 text-amber-600" : ""}`} />
          </div>
        ) : (
          <div className="flex items-center gap-2 px-4 py-2.5">
            <span className={`block flex-1 truncate font-body text-[13.5px] ${selected ? "text-ink-100" : "text-ink-500"}`}>
              {selected?.label ?? placeholder}
            </span>
            <ChevronIcon className={`shrink-0 text-ink-500 transition-transform duration-200 ${open ? "rotate-180 text-amber-600" : ""}`} />
          </div>
        )}
      </button>

      {createPortal(
        <AnimatePresence>
          {open && panel && (
            <>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="fixed inset-0 z-[60] cursor-default"
              />
              <motion.ul
                role="listbox"
                aria-labelledby={triggerId}
                initial={{ opacity: 0, y: panel.upward ? 6 : -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: panel.upward ? 6 : -6, scale: 0.98 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                style={{ left: panel.left, width: panel.width, maxHeight: panel.maxHeight, top: panel.top, bottom: panel.bottom }}
                className="fixed z-[61] overflow-y-auto rounded-xl border border-gold-500/25 bg-navy-900/80 p-1.5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.75)] backdrop-blur-xl"
              >
                {options.length === 0 && <li className="px-3 py-2.5 text-[13px] text-ink-500">No options</li>}
                {options.map((opt) => {
                  const isSelected = opt.value === value;
                  return (
                    <li
                      key={opt.value}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onChange(opt.value);
                        setOpen(false);
                      }}
                      className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-[13.5px] transition-colors ${
                        isSelected ? "bg-gold-500/15 text-amber-700" : "text-ink-200 hover:bg-navy-800/80 hover:text-ink-100"
                      }`}
                    >
                      <span className="truncate">{opt.label}</span>
                      {isSelected && <CheckIcon />}
                    </li>
                  );
                })}
              </motion.ul>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}

      {error && <p className="mt-1.5 pl-1 text-[12.5px] text-crimson-500">{error}</p>}
    </div>
  );
}
