"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CheckIcon, ChevronIcon, CloseIcon, SearchIcon } from "./icons";
import { FORM_CONTROL_ERROR, FORM_CONTROL_FOCUS, FORM_CONTROL_SHELL, FORM_LABEL, FORM_MUTED } from "./formFieldStyles";

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
  disabled?: boolean;
  /** Extra classes appended to the trigger button — e.g. a page that wants
   *  this field to carry a themed border/shadow at rest, not just on focus.
   *  Empty by default, so every existing call site is unaffected. */
  containerClassName?: string;
  /** Leading colored icon badge — a pre-styled element, the same convention
   *  DivineInput's `icon` prop uses. */
  icon?: ReactNode;
  /** Set false to hide the clear (×) button even once a value is selected —
   *  for a field like "Rows per page" where every state is a real page size
   *  and there's no meaningful "cleared" state to fall back to. On by
   *  default so every existing call site keeps its current behavior. */
  clearable?: boolean;
  /** Custom content for an option row in the panel, in place of the plain
   *  label — e.g. a leading status dot. Falls back to `opt.label` when
   *  omitted, so every existing call site is unaffected. */
  renderOption?: (option: ListboxOption) => ReactNode;
  /** Closed-field content. Status uses this so the color dot shows in the box, not only in the menu. */
  renderValue?: (option: ListboxOption | undefined) => ReactNode;
  /** Peach-border h-10 field without a visible label — for table rows (item/service category details). */
  formChrome?: boolean;
};

type PanelPosition = { left: number; width: number; maxHeight: number; upward: boolean; top?: number; bottom?: number };

const PANEL_MAX_HEIGHT = 288; // matches max-h-72 below — a little taller than before to still show a few rows under the search bar
const GAP = 8;
/** Below this, scanning beats typing — the search bar would just be one more thing to click past. */
const SEARCH_THRESHOLD = 7;

/**
 * A native <select>'s dropdown popup is OS chrome — no border-radius,
 * backdrop-blur, or theme color reaches it in most browsers, so it always
 * rendered as a plain white/black system list no matter what CSS was on
 * the <select> itself. This renders the whole thing (trigger + panel) as
 * real DOM instead, styled like every other divine input, so the dropdown
 * finally matches the rest of the page.
 *
 * Every list of any real length (GL Group's chart of accounts, Item's
 * General Ledger picker, Category, ...) grows past what's comfortable to
 * scan by eye, so any listbox with more than a handful of options gets a
 * search box pinned to the top of the panel that filters by label as you
 * type — the same behaviour everywhere a dropdown appears, not something
 * each master had to opt into separately.
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
  disabled = false,
  containerClassName = "",
  icon,
  clearable = true,
  renderOption,
  renderValue,
  formChrome = false,
}: DivineListboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [panel, setPanel] = useState<PanelPosition | null>(null);
  const [hoveredValue, setHoveredValue] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const triggerId = useId();
  const selected = options.find((o) => o.value === value);
  const searchable = options.length > SEARCH_THRESHOLD;
  const useFormChrome = Boolean(label) || formChrome;

  const filtered = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, searchable]);

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

  // Fresh search every time the panel opens, and the search box is what the
  // person almost certainly wants to type into immediately.
  useEffect(() => {
    if (open) {
      setQuery("");
      if (searchable) requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open, searchable]);

  function pick(v: string) {
    onChange(v);
    setOpen(false);
  }

  function clear(e: MouseEvent) {
    e.stopPropagation();
    onChange("");
    setOpen(false);
  }

  return (
    <div className={`relative ${className || "w-full"}`}>
      {label && (
        <label htmlFor={triggerId} className={FORM_LABEL}>
          {label}
        </label>
      )}
      <div
        className={
          useFormChrome
            ? `${FORM_CONTROL_SHELL} ${
                disabled
                  ? "cursor-not-allowed opacity-60"
                  : error
                    ? FORM_CONTROL_ERROR
                    : open
                      ? FORM_CONTROL_FOCUS
                      : ""
              }`
            : `rounded-md p-[1.5px] transition-[box-shadow] duration-300 ${
                disabled
                  ? "cursor-not-allowed bg-gold-500/15 opacity-60"
                  : error
                    ? "bg-crimson-500"
                    : open
                      ? "bg-gradient-to-r from-crimson-500 to-flame-500 shadow-[0_0_0_3px_rgba(212,175,55,0.2)]"
                      : "bg-gradient-to-r from-crimson-500 to-flame-500"
              }`
        }
      >
        <button
          ref={triggerRef}
          type="button"
          id={triggerId}
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-disabled={disabled}
          className={`group relative w-full bg-white text-left leading-none ${useFormChrome ? "rounded-lg" : "rounded-[4px]"} ${disabled ? "cursor-not-allowed" : ""} ${containerClassName}`}
        >
        {useFormChrome ? (
          <div className="flex h-10 items-center gap-2 px-3">
            {renderValue ? (
              <span className="flex min-w-0 flex-1 items-center gap-2">{renderValue(selected)}</span>
            ) : (
              <>
                {icon && <span className="flex shrink-0 items-center">{icon}</span>}
                <span className={`block min-w-0 flex-1 truncate font-body text-[14px] leading-5 ${selected ? "text-ink-100" : FORM_MUTED}`}>
                  {selected?.label ?? placeholder}
                </span>
              </>
            )}
            {selected && !disabled && clearable && (
              <span
                role="button"
                aria-label="Clear selection"
                onClick={clear}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-crimson-500/10 hover:text-crimson-500"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronIcon className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform duration-200 ${open ? "rotate-180 text-[#e8590c]" : ""}`} />
          </div>
        ) : (
          <div className="flex items-center gap-2 px-4 py-2.5">
            {icon && <span className="shrink-0">{icon}</span>}
            <span className={`block flex-1 truncate font-body text-[13.5px] ${selected ? "text-ink-100" : "text-ink-500"}`}>
              {selected?.label ?? placeholder}
            </span>
            {selected && !disabled && clearable && (
              <span
                role="button"
                aria-label="Clear selection"
                onClick={clear}
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-crimson-500/10 hover:text-crimson-500"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronIcon className={`shrink-0 text-ink-500 transition-transform duration-200 ${open ? "rotate-180 text-amber-600" : ""}`} />
          </div>
        )}
        </button>
      </div>

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
              <motion.div
                initial={{ opacity: 0, y: panel.upward ? 6 : -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: panel.upward ? 6 : -6, scale: 0.98 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                style={{ left: panel.left, width: panel.width, maxHeight: panel.maxHeight, top: panel.top, bottom: panel.bottom }}
                className="fixed z-[61] flex flex-col overflow-hidden rounded-md border border-crimson-500/25 bg-navy-900/90 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.75)] backdrop-blur-xl"
              >
                {searchable && (
                  <div className="flex shrink-0 items-center gap-2 border-b border-crimson-500/15 px-3 py-2">
                    <span className="text-ink-500">
                      <SearchIcon />
                    </span>
                    <input
                      ref={searchRef}
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && filtered.length === 1) pick(filtered[0].value);
                      }}
                      placeholder="Search…"
                      className="w-full bg-transparent font-body text-[13.5px] text-ink-100 outline-none placeholder:text-ink-500"
                    />
                  </div>
                )}
                <ul role="listbox" aria-labelledby={triggerId} className="min-h-0 flex-1 overflow-y-auto p-1.5">
                  {filtered.length === 0 && (
                    <li className="px-3 py-2.5 text-[13px] text-ink-500">
                      {options.length === 0 ? "No options" : "No matches"}
                    </li>
                  )}
                  {filtered.map((opt) => {
                    const isSelected = opt.value === value;
                    const isHoveredOnly = !isSelected && opt.value === hoveredValue;
                    return (
                      <li
                        key={opt.value}
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => pick(opt.value)}
                        onMouseEnter={() => setHoveredValue(opt.value)}
                        onMouseLeave={() => setHoveredValue((v) => (v === opt.value ? null : v))}
                        className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-[13.5px] ${
                          isSelected
                            ? "bg-[#e70000] font-medium text-white"
                            : isHoveredOnly
                              ? "bg-[#e70000]/15 text-ink-100"
                              : "text-ink-100"
                        }`}
                      >
                        {renderOption ? renderOption(opt) : <span className="truncate">{opt.label}</span>}
                        {isSelected && <CheckIcon className="h-3.5 w-3.5 shrink-0 text-white" />}
                      </li>
                    );
                  })}
                </ul>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}

      {error && <p className="mt-1.5 pl-1 text-[12.5px] text-crimson-500">{error}</p>}
    </div>
  );
}
