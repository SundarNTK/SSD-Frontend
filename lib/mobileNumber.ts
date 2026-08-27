/** Singapore mobile numbers: 8 digits, starting with 8 or 9 (landlines start with 6 and aren't mobile). */
export const SG_MOBILE_REGEX = /^[89]\d{7}$/;

/** Strips non-digits and caps at 8 characters — wire into onChange to keep the field Singapore-mobile-shaped as the user types. */
export function sanitizeMobileInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, 8);
}

export function isValidSgMobile(value: string): boolean {
  return SG_MOBILE_REGEX.test(value);
}

export const SG_MOBILE_ERROR = "Enter a valid 8-digit Singapore mobile number starting with 8 or 9";
