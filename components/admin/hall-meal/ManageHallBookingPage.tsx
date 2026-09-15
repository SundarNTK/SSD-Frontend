"use client";

import { useEffect, useState } from "react";
import FormDrawer from "../FormDrawer";
import ConfirmDialog from "../ConfirmDialog";
import DivineListbox from "../../divine/DivineListbox";
import DivineInput from "../../divine/DivineInput";
import DivineTextarea from "../../divine/DivineTextarea";
import DivineDatePicker from "../../divine/DivineDatePicker";
import DivineTimePicker from "../../divine/DivineTimePicker";
import DivineButton from "../../divine/DivineButton";
import { EmblemLoader } from "../../divine/EmblemLoader";
import { api, unwrap, type ApiEnvelope } from "../../../lib/api";
import { useApiResource } from "../../../lib/useApiResource";
import { useAsyncAction } from "../../../lib/useAsyncAction";
import { toast } from "../../../lib/toastStore";
import { startOfToday, toISODateString } from "../../../lib/datetime";

type Ref = { _id: string; name: string };

type HallBookingDetail = {
  _id: string;
  bookingNumber: string;
  customerInfo: { name: string; email: string; mobileNo: string | null };
  bookingType: "individual" | "package";
  hallName: string | null;
  hallPackageName: string | null;
  hallPurposeName: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  foodRequired: boolean;
  foodPackageName: string | null;
  paxCount: number | null;
  additionalServices: { name: string }[];
  remarks: string;
  discountPercentage: number;
  hallAmount: number;
  foodAmount: number;
  foodAdjustmentAmount: number;
  additionalHourAmount: number;
  subtotalAmount: number;
  discountAmount: number;
  gstPercentage: number;
  gstAmount: number;
  finalAmount: number;
  depositAmount: number;
  bookingStatus: "confirmed" | "completed" | "cancelled";
  paymentStatus: "unpaid" | "partial" | "paid";
  rescheduleHistory: { previousEventDate: string; previousStartTime: string; previousEndTime: string; reason: string; rescheduledAt: string }[];
  cancellation: { reason: string; cancelledAt: string; cancellationCharge: number; refundableAmount: number } | null;
  refund: { status: "pending" | "processed"; amount: number; mode: string; reference: string } | null;
  depositSettlement: { depositPaid: number; deduction: number; refundableDeposit: number; status: "pending" | "returned" } | null;
};

type Payment = {
  _id: string;
  receiptNo: string;
  paymentType: "deposit" | "advance" | "balance";
  amount: number;
  paymentModeName: string;
  paymentSubtype: string;
  referenceNo: string;
  paymentDate: string;
};

type DetailResponse = { booking: HallBookingDetail; payments: Payment[]; amountPaid: number; balanceAmount: number };

const BOOKING_STATUS_STYLE: Record<string, string> = {
  confirmed: "border-indigo-500/30 bg-indigo-500/10 text-indigo-700",
  completed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  cancelled: "border-crimson-500/30 bg-crimson-500/10 text-crimson-600",
};
const PAYMENT_STATUS_STYLE: Record<string, string> = {
  paid: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700",
  partial: "border-amber-500/30 bg-amber-500/10 text-amber-700",
  unpaid: "border-slate-400/30 bg-slate-100 text-slate-500",
};

function Chip({ value, styles }: { value: string; styles: Record<string, string> }) {
  return <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[12px] font-medium capitalize ${styles[value] ?? ""}`}>{value}</span>;
}

function Row({ label, value, bold }: { label: string; value: string | number; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between text-[13.5px] ${bold ? "font-semibold text-ink-100" : "text-ink-500"}`}>
      <span>{label}</span>
      <span className="tabular-nums">{typeof value === "number" ? value.toFixed(2) : value}</span>
    </div>
  );
}

export default function ManageHallBookingPage({ bookingId }: { bookingId: string }) {
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const paymentModeResource = useApiResource<Ref>(api, "/masters/payment-modes");

  // Routed through useAsyncAction (same helper every master form already
  // uses) rather than a hand-rolled setLoading/try-catch — that also means
  // the initial fetch below is a call into another module's hook, not a
  // same-file function whose own body opens with a synchronous setState,
  // which is what every other page's effect-triggered `list.run(...)` call
  // already relies on to stay clear of the "no setState at the top of an
  // effect" lint rule.
  const detailAction = useAsyncAction(async () => {
    const res = await api.get<ApiEnvelope<DetailResponse>>(`/hall-meal/hall-bookings/${bookingId}`);
    setDetail(unwrap(res));
  });
  const loading = detailAction.submitting && !detail;

  function reload() {
    detailAction.run();
  }

  useEffect(() => {
    reload();
    paymentModeResource.list.run({ status: 1, pageSize: 100 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  const [activeModal, setActiveModal] = useState<"payment" | "reschedule" | "cancel" | "refund" | "deposit" | "complete" | null>(null);

  if (loading || !detail) {
    return (
      <div className="flex h-64 items-center justify-center">
        <EmblemLoader size="md" label="Loading…" />
      </div>
    );
  }

  const { booking, payments, amountPaid, balanceAmount } = detail;
  const canManage = booking.bookingStatus === "confirmed";
  const canRefund = booking.bookingStatus === "cancelled" && booking.cancellation && booking.refund?.status !== "processed";
  const canSettleDeposit = booking.depositAmount > 0 && booking.depositSettlement?.status !== "returned";

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-bold text-ink-100">{booking.bookingNumber}</h1>
          <p className="mt-1 text-[13px] text-ink-500">{booking.customerInfo.name} · {[booking.customerInfo.mobileNo, booking.customerInfo.email].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex gap-2">
          <Chip value={booking.bookingStatus} styles={BOOKING_STATUS_STYLE} />
          <Chip value={booking.paymentStatus} styles={PAYMENT_STATUS_STYLE} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-2 rounded-2xl border border-gold-500/20 bg-white p-5">
          <p className="mb-1 font-display text-[16px] font-bold text-maroon">Booking Details</p>
          <Row label="Hall / Package" value={booking.hallPackageName || booking.hallName || "—"} />
          <Row label="Hall Purpose" value={booking.hallPurposeName} />
          <Row label="Event Date" value={booking.eventDate.slice(0, 10)} />
          <Row label="Time" value={`${booking.startTime}–${booking.endTime}`} />
          {booking.foodRequired && <Row label="Food Package" value={`${booking.foodPackageName} (${booking.paxCount} pax)`} />}
          {booking.additionalServices.length > 0 && <Row label="Additional Services" value={booking.additionalServices.map((s) => s.name).join(", ")} />}
          {booking.remarks && <Row label="Remarks" value={booking.remarks} />}
        </div>

        <div className="space-y-1.5 rounded-2xl border border-gold-500/20 bg-white p-5">
          <p className="mb-1 font-display text-[16px] font-bold text-maroon">Amount</p>
          <Row label="Hall / Package Amount" value={booking.hallAmount} />
          {booking.additionalHourAmount > 0 && <Row label="Additional Hour Amount" value={booking.additionalHourAmount} />}
          {booking.foodRequired && <Row label="Food Amount" value={booking.foodAmount} />}
          {booking.foodAdjustmentAmount > 0 && <Row label="Additional Food Amount" value={booking.foodAdjustmentAmount} />}
          {booking.discountAmount > 0 && <Row label={`Discount (${booking.discountPercentage}%)`} value={-booking.discountAmount} />}
          {booking.gstAmount > 0 && <Row label={`GST (${booking.gstPercentage}%)`} value={booking.gstAmount} />}
          <div className="my-1.5 border-t border-gold-500/20" />
          <Row label="Final Booking Amount" value={booking.finalAmount} bold />
          <Row label="Total Paid" value={amountPaid} />
          <Row label="Outstanding" value={balanceAmount} bold />
          {booking.depositAmount > 0 && <Row label="Deposit" value={booking.depositAmount} />}
        </div>
      </div>

      {booking.cancellation && (
        <div className="space-y-1.5 rounded-2xl border border-crimson-500/25 bg-crimson-500/5 p-5">
          <p className="mb-1 font-display text-[16px] font-bold text-crimson-600">Cancellation</p>
          <Row label="Reason" value={booking.cancellation.reason} />
          <Row label="Cancellation Charge" value={booking.cancellation.cancellationCharge} />
          <Row label="Refundable Amount" value={booking.cancellation.refundableAmount} bold />
          {booking.refund && (
            <>
              <div className="my-1.5 border-t border-crimson-500/20" />
              <Row label="Refund Status" value={booking.refund.status} />
              <Row label="Refund Amount" value={booking.refund.amount} />
            </>
          )}
        </div>
      )}

      {booking.depositSettlement && (
        <div className="space-y-1.5 rounded-2xl border border-gold-500/20 bg-white p-5">
          <p className="mb-1 font-display text-[16px] font-bold text-maroon">Deposit Settlement</p>
          <Row label="Deposit Paid" value={booking.depositSettlement.depositPaid} />
          <Row label="Deduction" value={booking.depositSettlement.deduction} />
          <Row label="Refundable Deposit" value={booking.depositSettlement.refundableDeposit} bold />
          <Row label="Status" value={booking.depositSettlement.status} />
        </div>
      )}

      {booking.rescheduleHistory.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-gold-500/20 bg-white p-5">
          <p className="mb-1 font-display text-[16px] font-bold text-maroon">Reschedule History</p>
          {booking.rescheduleHistory.map((r, i) => (
            <p key={i} className="text-[13px] text-ink-500">
              {r.previousEventDate.slice(0, 10)} · {r.previousStartTime}–{r.previousEndTime}
              {r.reason ? ` — ${r.reason}` : ""}
            </p>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-gold-500/20 bg-white p-5">
        <p className="mb-3 font-display text-[16px] font-bold text-maroon">Payment History</p>
        {payments.length === 0 ? (
          <p className="text-[13px] text-ink-500">No payments recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {payments.map((p) => (
              <div key={p._id} className="flex items-center justify-between rounded-lg border border-gold-500/15 px-3.5 py-2 text-[13px]">
                <span>
                  <span className="tabular-nums text-amber-700">{p.receiptNo}</span> · {p.paymentType} · {p.paymentModeName}
                  {p.paymentSubtype ? ` (${p.paymentSubtype})` : ""}
                </span>
                <span className="tabular-nums font-medium">{p.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {canManage && (
          <>
            {balanceAmount > 0.005 && (
              <DivineButton variant="flame" fullWidth={false} type="button" onClick={() => setActiveModal("payment")}>
                Collect Payment
              </DivineButton>
            )}
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={() => setActiveModal("reschedule")}>
              Reschedule
            </DivineButton>
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={() => setActiveModal("complete")}>
              Mark Completed
            </DivineButton>
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={() => setActiveModal("cancel")}>
              Cancel Booking
            </DivineButton>
          </>
        )}
        {canRefund && (
          <DivineButton variant="flame" fullWidth={false} type="button" onClick={() => setActiveModal("refund")}>
            Process Refund
          </DivineButton>
        )}
        {canSettleDeposit && (
          <DivineButton variant="ghost" fullWidth={false} type="button" onClick={() => setActiveModal("deposit")}>
            Settle Deposit
          </DivineButton>
        )}
      </div>

      {activeModal === "payment" && (
        <CollectPaymentModal
          bookingId={bookingId}
          balanceAmount={balanceAmount}
          paymentModeOptions={paymentModeResource.items.map((m) => ({ value: m._id, label: m.name }))}
          paymentModes={paymentModeResource.items}
          onClose={() => setActiveModal(null)}
          onDone={() => { setActiveModal(null); reload(); }}
        />
      )}
      {activeModal === "reschedule" && (
        <RescheduleModal booking={booking} onClose={() => setActiveModal(null)} onDone={() => { setActiveModal(null); reload(); }} />
      )}
      {activeModal === "cancel" && (
        <CancelModal bookingId={bookingId} amountPaid={amountPaid} onClose={() => setActiveModal(null)} onDone={() => { setActiveModal(null); reload(); }} />
      )}
      {activeModal === "refund" && booking.cancellation && (
        <RefundModal bookingId={bookingId} refundableAmount={booking.cancellation.refundableAmount} onClose={() => setActiveModal(null)} onDone={() => { setActiveModal(null); reload(); }} />
      )}
      {activeModal === "deposit" && (
        <DepositSettlementModal bookingId={bookingId} onClose={() => setActiveModal(null)} onDone={() => { setActiveModal(null); reload(); }} />
      )}
      {activeModal === "complete" && (
        <ConfirmDialog
          open
          title="Mark this event completed?"
          message="The booking will move to Completed and Hall/Date/Time can no longer be changed."
          confirmLabel="Mark Completed"
          onCancel={() => setActiveModal(null)}
          onConfirm={async () => {
            try {
              await api.post(`/hall-meal/hall-bookings/${bookingId}/complete`);
              toast.updated("Booking marked as completed.");
              setActiveModal(null);
              reload();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not complete the booking.");
            }
          }}
        />
      )}
    </div>
  );
}

// ─── Collect Payment ──────────────────────────────────────────────────────────

function CollectPaymentModal({
  bookingId,
  balanceAmount,
  paymentModeOptions,
  paymentModes,
  onClose,
  onDone,
}: {
  bookingId: string;
  balanceAmount: number;
  paymentModeOptions: { value: string; label: string }[];
  paymentModes: Ref[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(balanceAmount);
  const [paymentModeId, setPaymentModeId] = useState("");
  const [paymentSubtype, setPaymentSubtype] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modeName = paymentModes.find((m) => m._id === paymentModeId)?.name ?? "";

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      await api.post(`/hall-meal/hall-bookings/${bookingId}/payments`, { amount, paymentModeId, paymentSubtype, referenceNo, remarks });
      toast.updated("Payment recorded successfully.");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record the payment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDrawer
      open
      onClose={onClose}
      title="Collect Payment"
      subtitle={`Outstanding: ${balanceAmount.toFixed(2)}`}
      error={error}
      footer={
        <div className="flex justify-end gap-3">
          <DivineButton variant="ghost" fullWidth={false} type="button" onClick={onClose}>Cancel</DivineButton>
          <DivineButton variant="flame" fullWidth={false} type="button" loading={submitting} disabled={!amount || !paymentModeId} onClick={submit}>Record Payment</DivineButton>
        </div>
      }
    >
      <div className="space-y-4">
        <DivineInput staticLabel label="Payment Amount" type="number" min={0} max={balanceAmount} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        <DivineListbox label="Payment Mode" value={paymentModeId} onChange={setPaymentModeId} options={paymentModeOptions} placeholder="Select a mode…" />
        {modeName === "NETS" && (
          <DivineListbox
            label="NETS Type"
            value={paymentSubtype}
            onChange={setPaymentSubtype}
            options={[{ value: "QR", label: "QR" }, { value: "Debit Card", label: "Debit Card" }, { value: "Credit Card", label: "Credit Card" }]}
          />
        )}
        <DivineInput staticLabel label="Transaction / Reference No." value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} />
        <DivineTextarea staticLabel label={modeName === "Other" ? "Remarks (required for Other)" : "Remarks"} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      </div>
    </FormDrawer>
  );
}

// ─── Reschedule ─────────────────────────────────────────────────────────────

function RescheduleModal({ booking, onClose, onDone }: { booking: HallBookingDetail; onClose: () => void; onDone: () => void }) {
  const [eventDate, setEventDate] = useState(toISODateString(startOfToday()));
  const [startTime, setStartTime] = useState(booking.startTime);
  const [endTime, setEndTime] = useState(booking.endTime);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      await api.post(`/hall-meal/hall-bookings/${booking._id}/reschedule`, { eventDate, startTime, endTime, reason });
      toast.updated("Booking rescheduled successfully.");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reschedule — the new slot may not be available.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDrawer
      open
      onClose={onClose}
      title="Reschedule Booking"
      subtitle={`Currently ${booking.eventDate.slice(0, 10)} · ${booking.startTime}–${booking.endTime}`}
      error={error}
      footer={
        <div className="flex justify-end gap-3">
          <DivineButton variant="ghost" fullWidth={false} type="button" onClick={onClose}>Cancel</DivineButton>
          <DivineButton variant="flame" fullWidth={false} type="button" loading={submitting} onClick={submit}>Reschedule</DivineButton>
        </div>
      }
    >
      <div className="space-y-4">
        <DivineDatePicker staticLabel label="New Event Date" value={eventDate} onChange={setEventDate} minDate={startOfToday()} />
        <div className="grid grid-cols-2 gap-4">
          <DivineTimePicker staticLabel label="New Start Time" value={startTime} onChange={setStartTime} />
          <DivineTimePicker staticLabel label="New End Time" value={endTime} onChange={setEndTime} />
        </div>
        <DivineTextarea staticLabel label="Reschedule Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </FormDrawer>
  );
}

// ─── Cancel ─────────────────────────────────────────────────────────────────

function CancelModal({ bookingId, amountPaid, onClose, onDone }: { bookingId: string; amountPaid: number; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [cancellationCharge, setCancellationCharge] = useState(0);
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      await api.post(`/hall-meal/hall-bookings/${bookingId}/cancel`, { reason, cancellationCharge, remarks });
      toast.deleted("Booking cancelled successfully.");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel the booking.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDrawer
      open
      onClose={onClose}
      title="Cancel Booking"
      subtitle={`Amount paid so far: ${amountPaid.toFixed(2)}`}
      error={error}
      footer={
        <div className="flex justify-end gap-3">
          <DivineButton variant="ghost" fullWidth={false} type="button" onClick={onClose}>Back</DivineButton>
          <DivineButton variant="flame" fullWidth={false} type="button" loading={submitting} disabled={!reason.trim()} onClick={submit}>Cancel Booking</DivineButton>
        </div>
      }
    >
      <div className="space-y-4">
        <DivineTextarea staticLabel label="Cancellation Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        <DivineInput staticLabel label="Cancellation Charge / Deduction" type="number" min={0} max={amountPaid} value={cancellationCharge || ""} onChange={(e) => setCancellationCharge(Number(e.target.value))} />
        <DivineTextarea staticLabel label="Remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      </div>
    </FormDrawer>
  );
}

// ─── Refund ─────────────────────────────────────────────────────────────────

function RefundModal({ bookingId, refundableAmount, onClose, onDone }: { bookingId: string; refundableAmount: number; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState(refundableAmount);
  const mode = "Cash";
  const [reference, setReference] = useState("");
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      await api.post(`/hall-meal/hall-bookings/${bookingId}/refund`, { amount, mode, reference, remarks, status: "processed" });
      toast.updated("Refund recorded successfully.");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not process the refund.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDrawer
      open
      onClose={onClose}
      title="Process Refund"
      subtitle={`Eligible refundable amount: ${refundableAmount.toFixed(2)}`}
      error={error}
      footer={
        <div className="flex justify-end gap-3">
          <DivineButton variant="ghost" fullWidth={false} type="button" onClick={onClose}>Cancel</DivineButton>
          <DivineButton variant="flame" fullWidth={false} type="button" loading={submitting} disabled={!amount} onClick={submit}>Process Refund</DivineButton>
        </div>
      }
    >
      <div className="space-y-4">
        <DivineInput staticLabel label="Refund Amount" type="number" min={0} max={refundableAmount} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        <DivineInput staticLabel label="Refund Mode" value={mode} disabled readOnly />
        <DivineInput staticLabel label="Refund Reference" value={reference} onChange={(e) => setReference(e.target.value)} />
        <DivineTextarea staticLabel label="Remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      </div>
    </FormDrawer>
  );
}

// ─── Deposit Settlement ───────────────────────────────────────────────────────

function DepositSettlementModal({ bookingId, onClose, onDone }: { bookingId: string; onClose: () => void; onDone: () => void }) {
  const [deduction, setDeduction] = useState(0);
  const [returnDate, setReturnDate] = useState(toISODateString(startOfToday()));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      await api.post(`/hall-meal/hall-bookings/${bookingId}/deposit-settlement`, { deduction, returnDate });
      toast.updated("Deposit settled successfully.");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not settle the deposit.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDrawer
      open
      onClose={onClose}
      title="Settle Deposit"
      error={error}
      footer={
        <div className="flex justify-end gap-3">
          <DivineButton variant="ghost" fullWidth={false} type="button" onClick={onClose}>Cancel</DivineButton>
          <DivineButton variant="flame" fullWidth={false} type="button" loading={submitting} onClick={submit}>Settle Deposit</DivineButton>
        </div>
      }
    >
      <div className="space-y-4">
        <DivineInput staticLabel label="Deduction" type="number" min={0} value={deduction || ""} onChange={(e) => setDeduction(Number(e.target.value))} />
        <DivineDatePicker staticLabel label="Deposit Return Date" value={returnDate} onChange={setReturnDate} />
      </div>
    </FormDrawer>
  );
}
