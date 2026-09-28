"use client";

import DivineMultiSelect from "./DivineMultiSelect";
import { VISIBILITY_OPTIONS } from "../../lib/visibility";

type DivineVisibilitySelectProps = {
  values: string[];
  onChange: (values: string[]) => void;
  error?: string;
  label?: string;
  options?: { value: string; label: string }[];
};

export default function DivineVisibilitySelect({
  values,
  onChange,
  error,
  label = "Visibility",
  options = VISIBILITY_OPTIONS,
}: DivineVisibilitySelectProps) {
  return (
    <DivineMultiSelect
      label={label}
      values={values}
      onChange={onChange}
      options={options}
      placeholder="Select where this appears…"
      error={error}
    />
  );
}
