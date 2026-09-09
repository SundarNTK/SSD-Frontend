export const GST_TYPES = ["Standard Rated", "Zero-Rated", "Exempt", "Out of Scope", "NA"] as const;
export const ZERO_RATE_TYPES = ["Zero-Rated", "Exempt", "Out of Scope", "NA"] as const;

export const GST_TYPE_OPTIONS = GST_TYPES.map((value) => ({ value, label: value }));

export const GST_TYPE_HELP: Record<(typeof GST_TYPES)[number], string> = {
  "Standard Rated": "GST is applicable. Configure the GST rate (for example 9%). The system calculates GST during transactions.",
  Exempt: "GST is not applicable. Rate is fixed at 0% and GST amount is zero.",
  "Zero-Rated": "GST is applicable at 0%. GST amount is zero.",
  "Out of Scope": "Outside GST calculation. GST is not calculated. Rate is fixed at 0%.",
  NA: "Not applicable — no GST concept for this GL/account. Rate is fixed at 0% and GST amount is zero.",
};

export function canonicalGstType(type: string) {
  if (type === "Standard GST") return "Standard Rated";
  return type;
}

export function isZeroRateType(type: string) {
  return (ZERO_RATE_TYPES as readonly string[]).includes(canonicalGstType(type));
}

export function isOfficialType(type: string) {
  return (GST_TYPES as readonly string[]).includes(canonicalGstType(type));
}
