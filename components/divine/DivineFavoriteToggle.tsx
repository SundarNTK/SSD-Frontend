"use client";

import DivineListbox from "./DivineListbox";

type DivineFavoriteToggleProps = {
  label?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  hint?: string;
};

const YES_NO = [
  { value: "1", label: "Yes" },
  { value: "0", label: "No" },
];

/**
 * Yes/No dropdown for the Category, Sub Category, Item, Service, and
 * General Item master forms — same chrome as every other Yes/No field
 * (DivineRadioGroup), not the earlier gold-star chip pair, so a favourite
 * flag reads the same way as any other boolean field on these forms.
 */
export default function DivineFavoriteToggle({
  label = "Favorite",
  value,
  onChange,
  disabled,
  hint = "Shown under the POS Portal's Favorites tab, ahead of All Categories.",
}: DivineFavoriteToggleProps) {
  return (
    <div>
      <DivineListbox
        label={label}
        value={value ? "1" : "0"}
        onChange={(v) => onChange(v === "1")}
        options={YES_NO}
        disabled={disabled}
      />
      {hint && <p className="mt-1.5 pl-1 text-[11.5px] text-ink-500">{hint}</p>}
    </div>
  );
}
