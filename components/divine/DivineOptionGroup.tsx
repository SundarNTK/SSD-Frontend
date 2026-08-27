"use client";

export type OptionGroupOption = { value: string; label: string };

type DivineOptionGroupProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: OptionGroupOption[];
  error?: string;
  /** Same bordered box every DivineInput/DivineListbox/boxed DivineRadioGroup
   *  uses, so this field sitting in a grid row next to those lines up with
   *  them instead of floating at a different height. Off by default so every
   *  existing call site keeps its current bare look until it opts in. */
  boxed?: boolean;
};

/**
 * Same visual language as DivineRadioGroup's Yes/No pair, generalised to any
 * fixed set of string options — Event Master's "GST Classification"
 * (Applicable / Exempted / Out of Scope) needs a third choice a boolean
 * radio group can't express.
 */
export default function DivineOptionGroup({ label, value, onChange, options, error, boxed = false }: DivineOptionGroupProps) {
  const optionRow = (
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
  );

  if (boxed) {
    // The gradient box stays at its natural (unstretched) height — same as
    // DivineInput's bordered box — so a trailing error message never has to
    // compete with a forced h-full for space inside it. Any extra height a
    // grid row's stretch gives this field's outer wrapper just becomes
    // invisible blank space below, exactly like every other divine field.
    return (
      <div className="w-full">
        <div className="w-full rounded-xl bg-gradient-to-r from-crimson-500 to-flame-500 p-[1.5px]">
          <div className="w-full rounded-[10px] bg-white px-4 pt-6 pb-2.5">
            <div className="relative w-full">
              <span className="pointer-events-none absolute -top-[22px] left-0 right-0 truncate text-[11px] tracking-wide text-gray-700">
                {label}
              </span>
              {optionRow}
            </div>
          </div>
        </div>
        {error && <p className="mt-1.5 pl-1 text-[12.5px] text-crimson-500">{error}</p>}
      </div>
    );
  }

  return (
    <div className="w-full">
      <p className="mb-2 text-[11px] uppercase tracking-wide text-gray-700">{label}</p>
      {optionRow}
      {error && <p className="mt-1.5 pl-1 text-[12.5px] text-crimson-500">{error}</p>}
    </div>
  );
}
