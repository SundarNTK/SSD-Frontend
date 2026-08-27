"use client";

import { useEffect, useRef, useState } from "react";
import DivineInput from "../divine/DivineInput";
import { translateToTamil, transliterateToTamil } from "../../lib/tamilInput";

type Props = {
  label?: string;
  /** The master's English Name field — drives the whole-name translation suggestion. */
  englishName: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  /** Passed straight through to the underlying DivineInput. */
  staticLabel?: boolean;
};

const LATIN_ONLY = /^[a-zA-Z\s]+$/;

/**
 * Item/Service master's Tamil Name field — two independent, suggestion-only
 * assists, neither ever writes to the field without the admin picking it:
 *
 * 1. Whole-name translation: while this field is empty, typing the English
 *    Name offers its machine translation as a "Suggested: ... [OK]" banner.
 *    Gated on empty so it can never clobber something already here.
 * 2. Live transliteration: typing Latin letters directly into this field
 *    ("kovil") drops down Tamil spelling candidates ("கோவில்", "கோயில்", ...)
 *    to pick from — the same experience as Google's Tamil Input Tools.
 */
export default function TamilNameField({ label = "Tamil Name", englishName, value, onChange, error, staticLabel = false }: Props) {
  const [suggestion, setSuggestion] = useState("");
  const [candidates, setCandidates] = useState<string[]>([]);
  const [showCandidates, setShowCandidates] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derived, not reset: the fetch only runs while the field is empty, and
  // the banner's own render guard (below) hides a stale `suggestion` the
  // moment `value` stops being empty — no need to synchronously clear state
  // for that case, which is the effect antipattern the exhaustive-deps
  // lint rule flags. The old value simply never renders once the guard
  // fails, and a fresh fetch overwrites it if the field empties out again.
  useEffect(() => {
    if (value.trim() !== "") return;
    const trimmed = englishName.trim();
    if (!trimmed) return;
    const timer = setTimeout(async () => {
      try {
        const translated = await translateToTamil(trimmed);
        setSuggestion(translated);
      } catch {
        setSuggestion("");
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [englishName, value]);

  // Same reasoning as above: the dropdown's render guard (below) also
  // checks that `value` still looks like Latin input, so stale candidates
  // simply stop rendering rather than needing a synchronous reset here.
  useEffect(() => {
    const trimmed = value.trim();
    if (!trimmed || !LATIN_ONLY.test(trimmed)) return;
    const timer = setTimeout(async () => {
      try {
        const results = await transliterateToTamil(trimmed);
        setCandidates(results);
        setShowCandidates(results.length > 0);
      } catch {
        setCandidates([]);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [value]);

  const trimmedValue = value.trim();
  const candidatesVisible = showCandidates && candidates.length > 0 && LATIN_ONLY.test(trimmedValue);
  const suggestionVisible = !candidatesVisible && trimmedValue === "" && suggestion !== "";

  function pickCandidate(candidate: string) {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    onChange(candidate);
    setCandidates([]);
    setShowCandidates(false);
  }

  return (
    <div className="relative">
      <DivineInput
        label={label}
        error={error}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => candidates.length > 0 && setShowCandidates(true)}
        onBlur={() => {
          // Give a candidate's onMouseDown a chance to fire before the list unmounts.
          blurTimer.current = setTimeout(() => setShowCandidates(false), 150);
        }}
        autoComplete="off"
        staticLabel={staticLabel}
      />

      {candidatesVisible && (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-48 overflow-y-auto rounded-xl border border-gold-500/20 bg-white shadow-[0_16px_40px_-12px_rgba(0,0,0,0.25)]">
          {candidates.map((c) => (
            <li key={c}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pickCandidate(c);
                }}
                className="block w-full px-3 py-2 text-left text-[14px] text-ink-100 hover:bg-ivory-100"
              >
                {c}
              </button>
            </li>
          ))}
        </ul>
      )}

      {suggestionVisible && (
        <div className="mt-1.5 flex items-center justify-between gap-2 rounded-lg border border-gold-500/20 bg-ivory-100 px-3 py-1.5">
          <span className="truncate text-[12.5px] text-ink-500">
            Suggested: <span className="font-medium text-ink-100">{suggestion}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              onChange(suggestion);
              setSuggestion("");
            }}
            className="shrink-0 rounded-full bg-gradient-to-b from-gold-300 via-gold-500 to-gold-600 px-3 py-1 text-[11px] font-semibold text-navy-950 shadow-[0_2px_5px_-1px_rgba(184,137,42,0.5)] transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0"
          >
            OK
          </button>
        </div>
      )}
    </div>
  );
}
