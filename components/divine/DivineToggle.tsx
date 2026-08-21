"use client";

type DivineToggleProps = {
  label?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Text shown beside the switch for each state — defaults to Active/Inactive. Nakshathiram's "Main Flag" uses Yes/No instead. */
  onLabel?: string;
  offLabel?: string;
};

/**
 * Sliding switch for a record's Active/Inactive status — every other master
 * expresses status as a DivineListbox (Active/Inactive options) inside its
 * form, but Service Master's reference screenshot shows a true toggle, so
 * this is the one new atom that pattern needed.
 */
export default function DivineToggle({ label, checked, onChange, onLabel = "Active", offLabel = "Inactive" }: DivineToggleProps) {
  return (
    <div className="w-full">
      {label && <p className="mb-2 text-[11px] uppercase tracking-wide text-amber-600">{label}</p>}
      <div className="flex items-center gap-3">
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
        <span className="text-[13.5px] text-ink-100">{checked ? onLabel : offLabel}</span>
      </div>
    </div>
  );
}
