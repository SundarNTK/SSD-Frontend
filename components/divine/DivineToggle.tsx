"use client";

type DivineToggleProps = {
  label?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Text shown beside the switch for each state — defaults to Active/Inactive. Nakshathiram's "Main Flag" uses Yes/No instead. */
  onLabel?: string;
  offLabel?: string;
  /** Same bordered box every DivineInput/DivineListbox/boxed DivineRadioGroup
   *  uses, so a toggle sitting in a grid row next to those comes out to the
   *  same height. Off by default so every existing call site is unaffected. */
  boxed?: boolean;
};

/**
 * Sliding switch for a record's Active/Inactive status — every other master
 * expresses status as a DivineListbox (Active/Inactive options) inside its
 * form, but Service Master's reference screenshot shows a true toggle, so
 * this is the one new atom that pattern needed.
 */
export default function DivineToggle({ label, checked, onChange, onLabel = "Active", offLabel = "Inactive", boxed = false }: DivineToggleProps) {
  const switchButton = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
        checked ? "bg-gradient-to-b from-crimson-500 to-crimson-600" : "bg-ink-500/30"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.35)] transition-transform duration-200 ${
          checked ? "translate-x-[20px]" : "translate-x-0"
        }`}
      />
    </button>
  );

  if (boxed) {
    return (
      <div className="h-full w-full rounded-xl bg-gradient-to-r from-crimson-500 to-flame-500 p-[1.5px]">
        <div className="flex h-full w-full flex-col justify-center rounded-[10px] bg-white px-4 pt-6 pb-2.5">
          <div className="relative w-full">
            {label && (
              <span className="pointer-events-none absolute -top-[22px] left-0 right-0 truncate text-[11px] tracking-wide text-gray-700">
                {label}
              </span>
            )}
            <div className="flex items-center gap-3">
              {switchButton}
              <span className="text-[13.5px] text-ink-100">{checked ? onLabel : offLabel}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {label && <p className="mb-2 text-[11px] uppercase tracking-wide text-gray-700">{label}</p>}
      <div className="flex items-center gap-3">
        {switchButton}
        <span className="text-[13.5px] text-ink-100">{checked ? onLabel : offLabel}</span>
      </div>
    </div>
  );
}
