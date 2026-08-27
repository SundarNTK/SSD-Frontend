"use client";

import type { ReactNode } from "react";

type DivineRadioGroupProps = {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  /** Wraps the field in the same bordered box every DivineInput/DivineListbox
   *  uses, so a radio field sitting in a grid row next to those lines up with
   *  them instead of floating at a different height. Off by default so every
   *  existing call site keeps its current bare look until it opts in. */
  boxed?: boolean;
  /** Leading colored icon badge (boxed only) — a pre-styled element, e.g.
   *  `<span className="... bg-flame-500/15 text-flame-600"><BoxIcon /></span>`,
   *  the same convention DivineInput's `icon` prop uses. */
  icon?: ReactNode;
};

/**
 * A Yes/No radio pair — matches Item Master's "Deity Mapping Required" /
 * "Inventory Applicable" / etc. fields in the reference screenshots.
 */
export default function DivineRadioGroup({ label, value, onChange, boxed = false, icon }: DivineRadioGroupProps) {
  const options = [
    { label: "Yes", checked: value === true },
    { label: "No", checked: value === false },
  ];

  const radioRow = (
    <div className="flex items-center gap-6">
      {options.map((option) => (
        <label key={option.label} className="flex cursor-pointer items-center gap-2 text-[14px] text-ink-100">
          <span
            className={`flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 transition-colors ${
              option.checked ? "border-flame-500 bg-flame-500" : "border-gray-300 bg-white"
            }`}
          >
            {option.checked && <span className="h-2 w-2 rounded-full bg-white" />}
          </span>
          <input type="radio" className="hidden" checked={option.checked} onChange={() => onChange(option.label === "Yes")} />
          {option.label}
        </label>
      ))}
    </div>
  );

  if (boxed) {
    // Same box shell as DivineInput/DivineListbox — px-4 pt-5 pb-2, label
    // absolutely positioned above the content rather than stacked in flow —
    // so a boxed radio field sitting in a grid row next to an input or
    // dropdown comes out to the exact same height as they do, not taller.
    return (
      <div className="h-full w-full rounded-xl bg-gradient-to-r from-crimson-500 to-flame-500 p-[1.5px]">
        <div className="flex h-full w-full items-center gap-3 rounded-[10px] bg-white px-4 pt-6 pb-2.5">
          {icon && <span className="shrink-0">{icon}</span>}
          <div className="relative w-full">
            <span className="pointer-events-none absolute -top-[22px] left-0 right-0 truncate text-[11px] tracking-wide text-gray-700">
              {label}
            </span>
            {radioRow}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <p className="mb-2 text-[11px] uppercase tracking-wide text-gray-700">{label}</p>
      {radioRow}
    </div>
  );
}
