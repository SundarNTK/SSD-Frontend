"use client";

import DivineListbox from "./DivineListbox";
import type { ReactNode } from "react";

type DivineRadioGroupProps = {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  boxed?: boolean;
  icon?: ReactNode;
};

const YES_NO = [
  { value: "1", label: "Yes" },
  { value: "0", label: "No" },
];

/**
 * Yes/No field as a dropdown — same chrome as other master selects.
 * `boxed` / `icon` are kept so existing call sites compile; they no longer
 * change the look.
 */
export default function DivineRadioGroup({ label, value, onChange }: DivineRadioGroupProps) {
  return (
    <DivineListbox
      label={label}
      value={value ? "1" : "0"}
      onChange={(v) => onChange(v === "1")}
      options={YES_NO}
    />
  );
}
