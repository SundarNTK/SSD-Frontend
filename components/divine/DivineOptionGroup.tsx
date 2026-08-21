"use client";

export type OptionGroupOption = { value: string; label: string };

type DivineOptionGroupProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: OptionGroupOption[];
  error?: string;
};

/**
 * Same visual language as DivineRadioGroup's Yes/No pair, generalised to any
 * fixed set of string options — Event Master's "GST Classification"
 * (Applicable / Exempted / Out of Scope) needs a third choice a boolean
 * radio group can't express.
 */
export default function DivineOptionGroup({ label, value, onChange, options, error }: DivineOptionGroupProps) {
  return (
    <div className="w-full">
      <p className="mb-2 text-[11px] uppercase tracking-wide text-amber-600">{label}</p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <label key={option.value} className="flex cursor-pointer items-center gap-2 text-[14px] text-ink-100">
              <span
                className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors ${
                  checked ? "border-gold-500 bg-gold-500/10" : "border-gold-500/30"
                }`}
              >
                {checked && <span className="h-2.5 w-2.5 rounded-full bg-gold-500" />}
              </span>
              <input type="radio" className="hidden" checked={checked} onChange={() => onChange(option.value)} />
              {option.label}
            </label>
          );
        })}
      </div>
      {error && <p className="mt-1.5 pl-1 text-[12.5px] text-crimson-500">{error}</p>}
    </div>
  );
}
