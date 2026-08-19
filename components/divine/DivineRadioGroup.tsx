"use client";

type DivineRadioGroupProps = {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
};

/**
 * A Yes/No radio pair — matches Item Master's "Deity Mapping Required" /
 * "Inventory Applicable" / etc. fields in the reference screenshots.
 */
export default function DivineRadioGroup({ label, value, onChange }: DivineRadioGroupProps) {
  return (
    <div className="w-full">
      <p className="mb-2 text-[11px] uppercase tracking-wide text-amber-600">{label}</p>
      <div className="flex items-center gap-6">
        {[
          { label: "Yes", checked: value === true },
          { label: "No", checked: value === false },
        ].map((option) => (
          <label key={option.label} className="flex cursor-pointer items-center gap-2 text-[14px] text-ink-100">
            <span
              className={`flex h-[18px] w-[18px] items-center justify-center rounded-full border transition-colors ${
                option.checked ? "border-gold-500 bg-gold-500/10" : "border-gold-500/30"
              }`}
            >
              {option.checked && <span className="h-2.5 w-2.5 rounded-full bg-gold-500" />}
            </span>
            <input
              type="radio"
              className="hidden"
              checked={option.checked}
              onChange={() => onChange(option.label === "Yes")}
            />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );
}
