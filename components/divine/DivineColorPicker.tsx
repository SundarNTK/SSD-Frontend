"use client";

import { FORM_CONTROL, FORM_CONTROL_ERROR, FORM_LABEL, FORM_PLACEHOLDER } from "./formFieldStyles";

type DivineColorPickerProps = {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  error?: string;
};

const HEX_PATTERN = /^#[0-9A-Fa-f]{0,6}$/;

/**
 * Swatch + hex text field, matching the "Category Colour" picker in the
 * reference screenshots. The swatch is a native `<input type="color">` —
 * clicking it opens the browser/OS colour picker — kept in sync with the
 * text field so either one can drive the value.
 */
export default function DivineColorPicker({ label, value, onChange, error }: DivineColorPickerProps) {
  const swatchValue = /^#[0-9A-Fa-f]{6}$/.test(value) ? value : "#942237";

  return (
    <div className="w-full">
      <p className={FORM_LABEL}>{label}</p>
      <div className="flex items-center gap-3">
        <label
          className="relative h-11 w-11 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-[#f0b4a0]"
          style={{ backgroundColor: swatchValue }}
        >
          <input
            type="color"
            value={swatchValue}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label={label}
          />
        </label>
        <input
          value={value}
          onChange={(e) => {
            const next = e.target.value;
            if (HEX_PATTERN.test(next)) onChange(next);
          }}
          placeholder="#942237"
          className={`${FORM_CONTROL} ${FORM_PLACEHOLDER} ${error ? FORM_CONTROL_ERROR : ""}`}
        />
      </div>
      {error && <p className="mt-1.5 pl-1 text-[12.5px] text-crimson-500">{error}</p>}
    </div>
  );
}
