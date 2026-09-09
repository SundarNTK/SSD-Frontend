export const POS_DISPLAY_CODE_KEY = "ssd_pos_display_code";
export const POS_DISPLAY_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{6}$/;

export type PosDisplayLine = {
  name: string;
  quantity: number;
  lineTotal: number;
};

/** One payment actually collected against this booking so far — Cash for
 * the first installment, PayNow for the second, etc. Session-local (see
 * PosPortalPage's BookingSuccessView): built up as each payment lands
 * during this checkout, not fetched from the booking's full server-side
 * history, so it's accurate for the common case (one cashier session
 * collecting installments) but won't backfill payments from before this
 * screen was open. */
export type PosDisplayPaymentEntry = {
  mode: string;
  amount: number;
};

export type PosDisplayPayload = {
  phase: "idle" | "cart" | "collecting" | "paynow" | "terminal" | "done";
  customerName?: string | null;
  lines: PosDisplayLine[];
  grandTotal: number;
  payingNow: number;
  balanceDue: number;
  amountPaid?: number;
  mode?: string | null;
  qrImage?: string | null;
  referenceId?: string | null;
  bookingNumber?: string | null;
  paymentStatus?: "paid" | "partial" | "pending" | null;
  statusMessage?: string | null;
  paymentHistory?: PosDisplayPaymentEntry[];
};

export const IDLE_DISPLAY: PosDisplayPayload = {
  phase: "idle",
  lines: [],
  grandTotal: 0,
  payingNow: 0,
  balanceDue: 0,
};

export function normalizeDisplayCode(raw: string) {
  return raw.trim().toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, 6);
}

export function isLoopbackHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

export function customerDisplayPath(code: string) {
  return `/pos/display?code=${encodeURIComponent(code)}`;
}
