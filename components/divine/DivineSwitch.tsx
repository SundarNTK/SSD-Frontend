"use client";

type DivineSwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  onLabel?: string;
  offLabel?: string;
  ariaLabel?: string;
};

/**
 * A genuine sliding on/off switch — checked = green knob to the right,
 * unchecked = gray knob to the left. Used where a boolean needs a single
 * tap to flip (e.g. StatusToggleCell in DataTable), unlike DivineToggle
 * (despite its name, a Yes/No dropdown) which stays a dropdown for form
 * fields that sit among other dropdown-style inputs.
 */
export default function DivineSwitch({
  checked,
  onChange,
  disabled,
  onLabel = "Active",
  offLabel = "Inactive",
  ariaLabel,
}: DivineSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel ?? (checked ? onLabel : offLabel)}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`inline-flex items-center gap-2 ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
    >
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
          checked ? "bg-emerald-500" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
      <span className={`text-[12.5px] font-medium ${checked ? "text-emerald-700" : "text-slate-500"}`}>
        {checked ? onLabel : offLabel}
      </span>
    </button>
  );
}
