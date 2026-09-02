"use client";

import DivineListbox from "./DivineListbox";

export type OptionGroupOption = { value: string; label: string };

type DivineOptionGroupProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: OptionGroupOption[];
  error?: string;
  boxed?: boolean;
};

/**
 * Fixed set of string options as a dropdown — used for Event Master's
 * GST Classification (Applicable / Exempted / Out of Scope).
 */
export default function DivineOptionGroup({ label, value, onChange, options, error }: DivineOptionGroupProps) {
  return (
    <DivineListbox
      label={label}
      value={value}
      onChange={onChange}
      options={options}
      error={error}
      placeholder="Select…"
    />
  );
}
