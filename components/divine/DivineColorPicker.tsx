"use client";

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
      <p className="mb-2 text-[11px] uppercase tracking-wide text-amber-600">{label}</p>
      <div className="flex items-center gap-3">
        <label
          className="relative h-11 w-11 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-gold-500/20"
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
          className={`w-full rounded-xl border bg-white px-4 py-2.5 font-body text-[15px] text-ink-100 outline-none placeholder:text-ink-500 transition-colors duration-300 ${
            error ? "border-crimson-500/70" : "border-gold-500/20 hover:border-gold-400/40 focus:border-gold-400/80"
          }`}
        />
      </div>
      {error && <p className="mt-1.5 pl-1 text-[12.5px] text-crimson-500">{error}</p>}
    </div>
  );
}
