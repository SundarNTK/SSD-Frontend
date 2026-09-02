"use client";

import DivineListbox from "./DivineListbox";

type DivineToggleProps = {
  label?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  onLabel?: string;
  offLabel?: string;
  boxed?: boolean;
};

/**
 * Boolean field as a dropdown (Yes/No or Active/Inactive), matching the
 * other master selects. `boxed` is unused but kept for existing call sites.
 */
export default function DivineToggle({
  label = "Status",
  checked,
  onChange,
  onLabel = "Active",
  offLabel = "Inactive",
}: DivineToggleProps) {
  return (
    <DivineListbox
      label={label}
      value={checked ? "1" : "0"}
      onChange={(v) => onChange(v === "1")}
      options={[
        { value: "1", label: onLabel },
        { value: "0", label: offLabel },
      ]}
    />
  );
}
