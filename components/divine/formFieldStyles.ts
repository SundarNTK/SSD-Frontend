/** Shared admin form field chrome — maroon labels, peach borders, grey placeholders. */

export const FORM_LABEL =
  "mb-1.5 block text-[13px] font-semibold leading-none text-maroon";

/** Border + hover only — use on textareas and other multi-line boxes. */
export const FORM_CONTROL_SHELL =
  "w-full rounded-lg border border-[#f0b4a0] bg-white transition-colors hover:border-[#e8a090] focus-within:border-[#e8590c]";

/** Single-line control — same height for text inputs and dropdowns. */
export const FORM_CONTROL =
  `flex h-10 items-center gap-2 px-3 ${FORM_CONTROL_SHELL}`;

export const FORM_CONTROL_MULTILINE =
  `flex min-h-[120px] items-start gap-2 px-3.5 py-3 ${FORM_CONTROL_SHELL}`;

export const FORM_CONTROL_ERROR = "!border-crimson-500";

export const FORM_CONTROL_FOCUS = "!border-[#e8590c] shadow-[0_0_0_3px_rgba(232,89,12,0.12)]";

export const FORM_PLACEHOLDER = "placeholder:text-gray-400";

export const FORM_HINT_TEXT = "text-[15px] font-body text-ink-100";

export const FORM_MUTED = "text-gray-400";

export function defaultEnterPlaceholder(label: string) {
  const text = label.replace(/[.…]+$/, "").trim();
  return `Enter ${text.toLowerCase()}`;
}
