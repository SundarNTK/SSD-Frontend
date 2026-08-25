"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CheckIcon, ChevronIcon, SearchIcon } from "./icons";
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

type PanelPosition = { left: number; width: number; maxHeight: number; upward: boolean; top?: number; bottom?: number };

const PANEL_MAX_HEIGHT = 300; // room for the search bar, a few rows, and the Cancel/OK footer
const GAP = 8;
/** Below this, scanning beats typing — the search bar would just be one more thing to click past. */
const SEARCH_THRESHOLD = 7;

/**
 * Multi-select in the same visual language as DivineListbox, for fields
 * where several values are legitimate at once (a user's roles today; item
 * categories and event tags later) — including the same search-to-filter
 * behaviour once a list is long enough to be worth typing into instead of
 * scanning by eye.
 *
 * The panel stays open while ticking — closing after each choice is the
 * usual mistake in multi-selects, and it forces a reopen per selection. The
 * search query survives across picks for the same reason: someone searching
 * "pooja" almost certainly wants to tick several matches in a row, not
 * re-type the search after every one.
 *
 * Ticks land in a local draft, not straight onto `values` — Cancel (or
 * Escape, or clicking outside) discards the draft and leaves the committed
 * selection untouched; OK is the only path that calls `onChange`. Without
 * that staging step every tick was already "saved", so "Cancel" only ever
 * closed the panel — it couldn't undo anything.
 *
 * Like DivineListbox, the panel renders through a portal at a fixed
 * position and flips above the trigger when there isn't room below —
 * inline absolute positioning gets clipped by the FormDrawer's scrolling
 * body once the trigger nears the bottom of the form.
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
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<string[]>(values);
  const [panel, setPanel] = useState<PanelPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const labelId = useId();
  const searchable = options.length > SEARCH_THRESHOLD;

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
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) {
      setDraft(values);
      setQuery("");
      if (searchable) requestAnimationFrame(() => searchRef.current?.focus());
    }
    // `values` deliberately excluded — re-syncing the draft is only wanted
    // at the moment the panel opens, not on every parent re-render while
    // it's already open ticking away.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, searchable]);

  const selectedOptions = options.filter((o) => values.includes(o.value));

  function toggle(value: string) {
    setDraft((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  function applyDraft() {
    onChange(draft);
    setOpen(false);
  }

  return (
    <div className="relative w-full">
      <button
        ref={triggerRef}
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
            <span
              id={labelId}
              className="pointer-events-none absolute -top-[18px] left-0 right-0 truncate text-[11px] tracking-wide text-amber-600"
            >
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
                        onChange(values.filter((v) => v !== o.value));
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
                className="fixed z-[61] flex flex-col overflow-hidden rounded-xl border border-gold-500/25 bg-navy-900/85 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.75)] backdrop-blur-xl"
              >
                {searchable && (
                  <div className="flex shrink-0 items-center gap-2 border-b border-gold-500/15 px-3 py-2">
                    <span className="text-ink-500">
                      <SearchIcon />
                    </span>
                    <input
                      ref={searchRef}
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search…"
                      className="w-full bg-transparent font-body text-[13.5px] text-ink-100 outline-none placeholder:text-ink-500"
                    />
                  </div>
                )}
                <ul
                  role="listbox"
                  aria-multiselectable="true"
                  aria-labelledby={labelId}
                  className="min-h-0 flex-1 overflow-y-auto p-1.5"
                >
                  {filtered.length === 0 && (
                    <li className="px-3 py-2.5 text-[13px] text-ink-500">
                      {options.length === 0 ? emptyMessage : "No matches"}
                    </li>
                  )}
                  {filtered.map((opt) => {
                    const isSelected = draft.includes(opt.value);
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
                </ul>
                <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gold-500/15 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-3 py-1.5 text-[12.5px] text-ink-300 transition-colors hover:text-ink-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={applyDraft}
                    className="rounded-lg border border-gold-600/25 bg-gradient-to-b from-gold-300 via-gold-500 to-gold-600 px-3.5 py-1.5 text-[12.5px] font-semibold text-navy-950 shadow-[0_1px_4px_-1px_rgba(0,0,0,0.08)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_16px_-4px_rgba(184,137,42,0.55)] active:translate-y-0"
                  >
                    OK
                  </button>
                </div>
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
