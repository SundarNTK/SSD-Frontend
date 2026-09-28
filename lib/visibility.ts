export const VISIBILITY_POS = "pos";
export const VISIBILITY_CUSTOMER_PORTAL = "customerPortal";
export const VISIBILITY_ADMIN_BOOKING = "adminBooking";

export const VISIBILITY_OPTIONS = [
  { value: VISIBILITY_POS, label: "Temple POS" },
  { value: VISIBILITY_CUSTOMER_PORTAL, label: "Customer POS" },
  { value: VISIBILITY_ADMIN_BOOKING, label: "Admin Booking" },
];

// General Item has no Customer Portal presence — POS + Admin Booking only.
export const VISIBILITY_OPTIONS_NO_PORTAL = VISIBILITY_OPTIONS.filter(
  (o) => o.value !== VISIBILITY_CUSTOMER_PORTAL
);

export const DEFAULT_VISIBILITY = [VISIBILITY_POS, VISIBILITY_CUSTOMER_PORTAL, VISIBILITY_ADMIN_BOOKING];

/**
 * Missing pos/portal flags (older records) count as visible. `adminBooking`
 * is left out of the returned values entirely when the caller doesn't pass
 * it (e.g. PaymentModePage, which has no adminBookingVisibility field) —
 * only masters that actually carry the flag should offer it as an option.
 */
export function flagsToVisibility(
  pos: boolean | undefined,
  portal: boolean | undefined,
  adminBooking?: boolean
): string[] {
  const values: string[] = [];
  if (pos !== false) values.push(VISIBILITY_POS);
  if (portal !== false) values.push(VISIBILITY_CUSTOMER_PORTAL);
  if (adminBooking !== undefined && adminBooking !== false) values.push(VISIBILITY_ADMIN_BOOKING);
  return values;
}

export function visibilityToFlags(values: string[]) {
  return {
    pos: values.includes(VISIBILITY_POS),
    portal: values.includes(VISIBILITY_CUSTOMER_PORTAL),
    adminBooking: values.includes(VISIBILITY_ADMIN_BOOKING),
  };
}
