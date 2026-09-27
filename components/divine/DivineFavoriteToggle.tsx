"use client";

import { StarIcon } from "./icons";
import { FORM_LABEL } from "./formFieldStyles";

type DivineFavoriteToggleProps = {
  label?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  hint?: string;
};

/**
 * Two-way "Favorite / Not Favorite" chip toggle for the Category, Sub
 * Category, Item, and Service master forms — deliberately its own gold-star
 * look (not the plain Yes/No dropdown DivineRadioGroup gives every other
 * boolean field) since a favourite flag is the one thing on these forms that
 * feeds the POS Portal's own "Favorites" tab. A light, bright yellow-gold
 * fill (Tailwind's amber-300/400), matching that tab, not a gradient.
 * Picking either side sets the boolean outright, the same one-tap semantics
 * as DivineSwitch — there's no third "unset" state to round-trip.
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
      <span className={FORM_LABEL}>{label}</span>
      <div className="flex gap-2">
        <button
          type="button"
          aria-pressed={value}
          disabled={disabled}
          onClick={() => onChange(true)}
          className={`flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border px-3 text-[13.5px] font-semibold transition-all duration-200 ${
            value
              ? "border-amber-400 bg-amber-300 text-[#5b1020] shadow-[0_4px_14px_-4px_rgba(217,158,11,0.45)]"
              : "border-[#f0b4a0] bg-white text-ink-500 hover:border-amber-400 hover:text-amber-700"
          } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
        >
          <StarIcon filled className="h-4 w-4" />
          Favorite
        </button>
        <button
          type="button"
          aria-pressed={!value}
          disabled={disabled}
          onClick={() => onChange(false)}
          className={`flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border px-3 text-[13.5px] font-semibold transition-all duration-200 ${
            !value
              ? "border-slate-300 bg-slate-100 text-slate-600 shadow-inner"
              : "border-[#f0b4a0] bg-white text-ink-500 hover:border-slate-300"
          } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
        >
          <StarIcon className="h-4 w-4" />
          Not Favorite
        </button>
      </div>
      {hint && <p className="mt-1.5 pl-1 text-[11.5px] text-ink-500">{hint}</p>}
    </div>
  );
}
