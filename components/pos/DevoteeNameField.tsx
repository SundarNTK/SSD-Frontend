"use client";

import { useEffect, useRef, useState } from "react";
import DivineInput from "../divine/DivineInput";
import { transliterateToTamil } from "../../lib/tamilInput";

const LATIN_ONLY = /^[a-zA-Z\s.'-]+$/;

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  /** Repeat-customer chips shown only while the name field is empty. */
  historyChips?: { name: string; onPick: () => void }[];
};

/**
 * POS devotee name field — cashiers may type English; Tamil phonetic
 * suggestions appear below so they can tap one, or leave the English name
 * as typed. Same transliteration endpoint the masters Tamil Name field uses.
 */
export default function DevoteeNameField({
  label,
  value,
  onChange,
  placeholder = "Enter name (English or Tamil)",
  error,
  historyChips = [],
}: Props) {
  const [candidates, setCandidates] = useState<string[]>([]);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showCandidates, setShowCandidates] = useState(false);

  useEffect(() => {
    const trimmed = value.trim();
    if (!trimmed || !LATIN_ONLY.test(trimmed)) {
      setCandidates([]);
      setShowCandidates(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const results = await transliterateToTamil(trimmed);
        setCandidates(results);
        setShowCandidates(results.length > 0);
      } catch {
        setCandidates([]);
        setShowCandidates(false);
      }
    }, 320);
    return () => clearTimeout(timer);
  }, [value]);

  function pickCandidate(candidate: string) {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    onChange(candidate);
    setCandidates([]);
    setShowCandidates(false);
  }

  const trimmed = value.trim();
  const candidatesVisible =
    showCandidates && candidates.length > 0 && LATIN_ONLY.test(trimmed);
  const historyVisible = historyChips.length > 0 && !trimmed;

  return (
    <div className="relative">
      <DivineInput
        staticLabel
        label={label}
        placeholder={placeholder}
        value={value}
        error={error}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => candidates.length > 0 && setShowCandidates(true)}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setShowCandidates(false), 160);
        }}
        autoComplete="off"
      />

      {candidatesVisible && (
        <div className="mt-1.5 space-y-1">
          <p className="text-[10.5px] font-medium uppercase tracking-wide text-amber-700/80">
            Tamil suggestions — tap to use
          </p>
          <div className="flex flex-wrap gap-1.5">
            {candidates.map((c) => (
              <button
                key={c}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pickCandidate(c);
                }}
                className="rounded-full border border-maroon/25 bg-[#fdf6f0] px-2.5 py-1 text-[12.5px] font-medium text-maroon transition-colors hover:border-maroon/45 hover:bg-[#fceee4]"
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {historyVisible && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {historyChips.map((chip) => (
            <button
              key={chip.name}
              type="button"
              onClick={chip.onPick}
              className="rounded-full border border-gold-500/30 bg-white px-2.5 py-0.5 text-[11.5px] font-medium text-amber-700 transition-colors hover:border-gold-400/60 hover:bg-gold-500/5"
            >
              + {chip.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
