"use client";

import { useEffect, useState, type ReactNode } from "react";
import DataTable, { type DataTableColumn } from "./DataTable";
import FormDrawer from "./FormDrawer";
import DivineListbox, { type ListboxOption } from "../divine/DivineListbox";
import DivineButton from "../divine/DivineButton";
import DivineInput from "../divine/DivineInput";
import { EyeIcon } from "../divine/icons";
import { api, unwrap, extractErrorMessage, type ApiEnvelope } from "../../lib/api";
import { useApiResource } from "../../lib/useApiResource";
import { formatTempleDateTime } from "../../lib/datetime";
import { toast } from "../../lib/toastStore";
import { MODULES, usePermissions } from "../../lib/permissions";

type PaymentStatus = "paid" | "partial" | "pending";

type BookingListItem = {
  _id: string;
  bookingNumber: string;
  receiptNo: string | null;
  orderNumber: string | null;
  customer: { _id: string; customerCode: string; name: string } | null;
  lineType: string;
  paymentModeName: string;
  subtotal: number;
  gstAmount: number;
  grandTotal: number;
  paymentStatus: PaymentStatus;
  amountPaid: number;
  balanceAmount: number;
  bookingStatus: "confirmed" | "cancelled";
  portal: "admin" | "pos" | "customer";
  bookedAt: string;
};

type DeityRef = { _id: string; name: string };
type Devotee = { name: string; nakshatra: string };

// One row per payment collected against the booking — oldest first. A
// fully-paid-at-confirm booking still has exactly one row here; a
// partial-payment booking accumulates one row per installment.
type TransactionRow = {
  _id: string;
  receiptNo: string;
  amount: number;
  paymentStatus: string;
  paymentModeName: string;
  transactionDate: string;
  processedBy: { _id: string; name: string; email: string } | null;
};

type BookingDetail = {
  _id: string;
  bookingNumber: string;
  orderId: { _id: string; orderNumber: string; orderStatus: string } | null;
  customer: { _id: string; customerCode: string; name: string; email: string; mobileNumber: string | null } | null;
  lines: {
    refType: "Item" | "Service";
    refId: string;
    name: string;
    code: string;
    quantity: number;
    unitPrice: number;
    deities: DeityRef[];
    devotees: Devotee[];
    lineTotal: number;
  }[];
  subtotal: number;
  gstAmount: number;
  grandTotal: number;
  paymentMode: { _id: string; name: string } | null;
  paymentModeName: string;
  paymentStatus: PaymentStatus;
  bookingStatus: "confirmed" | "cancelled";
  portal: "admin" | "pos" | "customer";
  bookedBy: { _id: string; name: string; email: string } | null;
  bookedAt: string;
  // Full payment history — see TransactionRow above.
  transactions: TransactionRow[];
  amountPaid: number;
  balanceAmount: number;
};

function formatCurrency(v: number) {
  return `$${v.toFixed(2)}`;
}

function BookingStatusPill({ status }: { status: "confirmed" | "cancelled" }) {
  return status === "confirmed" ? (
    <span className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11.5px] font-medium text-emerald-700">
      Completed
    </span>
  ) : (
    <span className="inline-flex items-center rounded-md border border-crimson-500/30 bg-crimson-500/10 px-2 py-0.5 text-[11.5px] font-medium text-crimson-600">
      Cancelled
    </span>
  );
}

function PortalPill({ portal }: { portal: "admin" | "pos" | "customer" }) {
  if (portal === "admin") {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-md border border-gold-500/30 bg-gold-500/10 px-2 py-0.5 text-[11.5px] font-medium text-amber-700">
        Admin Panel
      </span>
    );
  }
  if (portal === "pos") {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[11.5px] font-medium text-violet-700">
        POS Counter
      </span>
    );
  }
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11.5px] font-medium text-sky-700">
      Customer
    </span>
  );
}

function PaymentStatusPill({ status }: { status: PaymentStatus }) {
  if (status === "paid") {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11.5px] font-medium text-emerald-700">
        Paid
      </span>
    );
  }
  if (status === "partial") {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11.5px] font-medium text-amber-700">
        Partial
      </span>
    );
  }
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-md border border-slate-400/30 bg-slate-100 px-2 py-0.5 text-[11.5px] font-medium text-slate-500">
      Pending
    </span>
  );
}

const STATUS_FILTER_OPTIONS: ListboxOption[] = [
  { value: "", label: "All Status" },
  { value: "confirmed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const PAYMENT_STATUS_FILTER_OPTIONS: ListboxOption[] = [
  { value: "", label: "All Payments" },
  { value: "paid", label: "Paid" },
  { value: "partial", label: "Partial" },
  { value: "pending", label: "Pending" },
];

const PORTAL_FILTER_OPTIONS: ListboxOption[] = [
  { value: "", label: "All Portals" },
  { value: "admin", label: "Admin Panel" },
  { value: "pos", label: "POS Counter" },
  { value: "customer", label: "Customer" },
];

const COLUMNS: DataTableColumn<BookingListItem>[] = [
  {
    key: "orderNumber",
    label: "Transaction No",
    render: (b) => <span className="font-medium tabular-nums text-amber-700">{b.orderNumber ?? "—"}</span>,
  },
  {
    key: "receiptNo",
    label: "Receipt No",
    render: (b) => <span className="tabular-nums">{b.receiptNo ?? "—"}</span>,
  },
  { key: "customer", label: "Customer", render: (b) => b.customer?.name ?? "—" },
  { key: "lineType", label: "Type", render: (b) => <span className="text-ink-500">{b.lineType}</span> },
  { key: "paymentMode", label: "Payment Mode", render: (b) => b.paymentModeName },
  {
    key: "grossAmount",
    label: "Gross Amount",
    render: (b) => <span className="tabular-nums">{formatCurrency(b.subtotal)}</span>,
  },
  { key: "gst", label: "GST", render: (b) => <span className="tabular-nums">{formatCurrency(b.gstAmount)}</span> },
  { key: "paymentStatus", label: "Payment", render: (b) => <PaymentStatusPill status={b.paymentStatus} /> },
  {
    key: "balanceAmount",
    label: "Balance Due",
    render: (b) => (
      <span className={`tabular-nums ${b.balanceAmount > 0 ? "font-semibold text-crimson-500" : "text-ink-500"}`}>
        {formatCurrency(b.balanceAmount)}
      </span>
    ),
  },
  { key: "status", label: "Status", render: (b) => <BookingStatusPill status={b.bookingStatus} /> },
  { key: "portal", label: "Portal", render: (b) => <PortalPill portal={b.portal} /> },
  {
    key: "bookedAt",
    label: "Date & Time",
    render: (b) => <span className="text-ink-500">{formatTempleDateTime(b.bookedAt)}</span>,
  },
];

const DEFAULT_PAGE_SIZE = 10;

/**
 * Read-only ledger of every confirmed/cancelled booking (see
 * GET /pos/booking/bookings) — mirrors Inventory History's shape: search +
 * filters + pagination, no create/edit/delete of its own. "Portal" defaults
 * to unfiltered (shows all three) — "Admin Panel" and "POS Counter" both
 * happen today (stamped server-side from which route tree took the
 * request, see controllers/pos/index.js's setPortal()); "Customer" is
 * forward-looking infrastructure for the Customer Portal's eventual
 * self-service booking flow.
 */
type PaymentMode = { _id: string; name: string };

export default function PosTransactionsPage() {
  const { items, total, list } = useApiResource<BookingListItem>(api, "/pos/booking/bookings");
  const { can } = usePermissions();
  const canRecordPayment = can(MODULES.posTransactions, "fullAccess");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [portalFilter, setPortalFilter] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // Every active payment mode — an installment doesn't have to come in the
  // same way the booking itself was opened with (e.g. booked on Cash,
  // balance later topped up via PayNow). See requirePaymentModeAccess() on
  // the backend for why this lookup is reachable with just pos-transactions
  // view, not admin-booking.
  const [paymentModes, setPaymentModes] = useState<PaymentMode[]>([]);
  useEffect(() => {
    api
      .get<ApiEnvelope<{ items: PaymentMode[] }>>("/pos/booking/payment-modes")
      .then((r) => setPaymentModes(unwrap(r).items))
      .catch(() => {});
  }, []);

  const [detail, setDetail] = useState<BookingDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  // ── record payment (collect the rest of a partial payment) ────────────────
  const [paymentAmountInput, setPaymentAmountInput] = useState("");
  const [paymentModeIdInput, setPaymentModeIdInput] = useState("");
  const [recordingPayment, setRecordingPayment] = useState(false);

  function refreshList() {
    list.run({
      page,
      pageSize,
      search: search || undefined,
      status: statusFilter || undefined,
      portal: portalFilter || undefined,
      paymentStatus: paymentStatusFilter || undefined,
    });
  }

  useEffect(() => {
    refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, search, statusFilter, portalFilter, paymentStatusFilter]);

  async function openDetail(id: string) {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    setPaymentAmountInput("");
    try {
      const r = await api.get<ApiEnvelope<BookingDetail>>(`/pos/booking/bookings/${id}`);
      const data = unwrap(r);
      setDetail(data);
      setPaymentAmountInput(data.balanceAmount > 0 ? data.balanceAmount.toFixed(2) : "");
      // Defaults to the booking's own mode — free to switch to any other
      // active mode (e.g. booked on Cash, balance topped up via PayNow).
      setPaymentModeIdInput(data.paymentMode?._id ?? "");
    } catch (err) {
      toast.error(extractErrorMessage(err));
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleRecordPayment() {
    if (!detail) return;
    const amount = Number(paymentAmountInput);
    if (paymentAmountInput === "" || Number.isNaN(amount) || amount <= 0) {
      toast.error("Enter a payment amount greater than $0.00.");
      return;
    }
    if (amount > detail.balanceAmount + 0.005) {
      toast.error(`Amount cannot exceed the outstanding balance of ${formatCurrency(detail.balanceAmount)}.`);
      return;
    }
    if (!paymentModeIdInput) {
      toast.error("Select a payment mode.");
      return;
    }

    setRecordingPayment(true);
    try {
      await api.post(`/pos/booking/bookings/${detail._id}/payments`, { amount, paymentModeId: paymentModeIdInput });
      toast.created("Payment recorded.");
      await openDetail(detail._id);
      refreshList();
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setRecordingPayment(false);
    }
  }

  return (
    <>
      <DataTable
        title="POS Transactions"
        subtitle="View and manage counter transactions."
        columns={COLUMNS}
        rows={items}
        rowKey={(b) => b._id}
        loading={list.submitting}
        search={search}
        onSearchChange={(v) => {
          setPage(1);
          setSearch(v);
        }}
        searchPlaceholder="Search by receipt no. or customer…"
        extraFilters={
          <>
            <DivineListbox
              value={statusFilter}
              onChange={(v) => {
                setPage(1);
                setStatusFilter(v);
              }}
              options={STATUS_FILTER_OPTIONS}
              className="w-40"
            />
            <DivineListbox
              value={portalFilter}
              onChange={(v) => {
                setPage(1);
                setPortalFilter(v);
              }}
              options={PORTAL_FILTER_OPTIONS}
              className="w-40"
            />
            <DivineListbox
              value={paymentStatusFilter}
              onChange={(v) => {
                setPage(1);
                setPaymentStatusFilter(v);
              }}
              options={PAYMENT_STATUS_FILTER_OPTIONS}
              className="w-40"
            />
          </>
        }
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPage(1);
          setPageSize(size);
        }}
        emptyMessage="No transactions yet."
        rowActions={(b) => (
          <button
            onClick={() => openDetail(b._id)}
            aria-label={`View ${b.bookingNumber}`}
            className="text-ink-300 hover:text-ink-100"
          >
            <EyeIcon />
          </button>
        )}
      />

      <FormDrawer
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={detail ? `Booking ${detail.bookingNumber}` : "Booking Details"}
        maxWidthClassName="max-w-4xl"
        footer={
          <div className="flex justify-end">
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={() => setDetailOpen(false)}>
              Close
            </DivineButton>
          </div>
        }
      >
        {detailLoading && <p className="py-8 text-center text-[13px] text-ink-500">Loading…</p>}

        {!detailLoading && detail && (
          <div className="space-y-5 text-[13.5px]">
            {/* ── Receipt masthead: Order No. / Receipt No. get real weight ── */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-gold-500/15 bg-ivory-100 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-ink-500">Order No.</p>
                <p className="mt-0.5 text-[15px] font-bold tabular-nums text-ink-100">
                  {detail.orderId?.orderNumber ?? "—"}
                </p>
              </div>
              <div className="rounded-xl border border-gold-500/15 bg-ivory-100 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-ink-500">Receipt No.</p>
                <p className="mt-0.5 text-[15px] font-bold tabular-nums text-ink-100">
                  {detail.transactions[0]?.receiptNo ?? "—"}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-gold-500/15 bg-white px-4 py-3.5">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-amber-600">Booking Details</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                <DetailRow label="Status" value={<BookingStatusPill status={detail.bookingStatus} />} />
                <DetailRow label="Portal" value={<PortalPill portal={detail.portal} />} />
                <DetailRow label="Date & Time" value={formatTempleDateTime(detail.bookedAt)} />
                <DetailRow label="Booked By" value={detail.bookedBy?.name ?? "—"} />
              </div>
            </div>

            <div className="rounded-xl border border-gold-500/15 bg-white px-4 py-3.5">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-600">Customer</p>
              <p className="font-medium text-ink-100">{detail.customer?.name ?? "—"}</p>
              <p className="mt-0.5 text-[12px] text-ink-500">
                {detail.customer?.customerCode}
                {detail.customer?.email ? ` · ${detail.customer.email}` : ""}
                {detail.customer?.mobileNumber ? ` · ${detail.customer.mobileNumber}` : ""}
              </p>
            </div>

            <div>
              <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-amber-600">Line Items</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {detail.lines.map((line, idx) => (
                  <div key={idx} className="rounded-xl border border-gold-500/15 bg-white px-4 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-ink-100">{line.name}</p>
                        <p className="mt-0.5 text-[11.5px] text-ink-500">
                          {line.refType} · {line.code} · Qty {line.quantity} &times; {formatCurrency(line.unitPrice)}
                        </p>
                        {line.deities.length > 0 && (
                          <p className="mt-1 text-[11.5px] text-ink-500">
                            Deities: {line.deities.map((d) => d.name).join(", ")}
                          </p>
                        )}
                        {line.devotees.length > 0 && (
                          <p className="text-[11.5px] text-ink-500">
                            Devotees: {line.devotees.map((d) => `${d.name}${d.nakshatra ? ` (${d.nakshatra})` : ""}`).join(", ")}
                          </p>
                        )}
                      </div>
                      <span className="whitespace-nowrap font-semibold text-amber-600">{formatCurrency(line.lineTotal)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-gold-500/15 bg-white px-4 py-3.5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">Payment</p>
                <PaymentStatusPill status={detail.paymentStatus} />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-ink-500">Payment Mode</span>
                  <span className="font-medium text-ink-100">{detail.paymentModeName}</span>
                </div>
                <div className="flex items-center justify-between border-t border-gold-500/10 pt-1.5">
                  <span className="text-ink-500">Sub Total</span>
                  <span className="text-ink-100">{formatCurrency(detail.subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-[15px] font-bold">
                  <span className="flex items-center gap-1.5 text-ink-100">
                    Total Payable Amount
                    <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-emerald-700">
                      GST Inclusive
                    </span>
                  </span>
                  <span className="text-amber-600">{formatCurrency(detail.grandTotal)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-gold-500/10 pt-1.5">
                  <span className="text-ink-500">Amount Paid</span>
                  <span className="font-medium text-emerald-600">{formatCurrency(detail.amountPaid)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-500">Balance Due</span>
                  <span className={`font-bold ${detail.balanceAmount > 0 ? "text-crimson-500" : "text-ink-100"}`}>
                    {formatCurrency(detail.balanceAmount)}
                  </span>
                </div>
              </div>

              {/* Payment history — every installment collected against this
                  booking, oldest first. A fully-paid-at-confirm booking still
                  shows exactly one row here. */}
              {detail.transactions.length > 0 && (
                <div className="mt-3 space-y-1.5 border-t border-gold-500/10 pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Payment History</p>
                  {detail.transactions.map((t) => (
                    <div key={t._id} className="flex items-center justify-between text-[12.5px]">
                      <span className="text-ink-500">
                        {t.receiptNo} · {t.paymentModeName} · {formatTempleDateTime(t.transactionDate)}
                      </span>
                      <span className="font-medium text-ink-100">{formatCurrency(t.amount)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Record another installment — only while something is still
                  owed on a confirmed booking, and only for staff with
                  fullAccess on POS Transactions. */}
              {detail.bookingStatus === "confirmed" && detail.balanceAmount > 0 && (
                <div className="mt-3 space-y-2 border-t border-gold-500/10 pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">Record Payment</p>
                  {canRecordPayment ? (
                    <>
                      <DivineInput
                        label={`Amount to Collect (max ${formatCurrency(detail.balanceAmount)})`}
                        type="number"
                        min={0.01}
                        max={detail.balanceAmount}
                        step="0.01"
                        inputMode="decimal"
                        value={paymentAmountInput}
                        onChange={(e) => setPaymentAmountInput(e.target.value)}
                      />
                      {/* Doesn't have to be the booking's original mode — a
                          balance can be paid off in a different mode than it
                          was opened with (e.g. Cash at booking, PayNow for
                          the top-up). */}
                      <DivineListbox
                        value={paymentModeIdInput}
                        onChange={setPaymentModeIdInput}
                        options={paymentModes.map((m) => ({ value: m._id, label: m.name }))}
                        placeholder="Payment mode"
                      />
                      <DivineButton fullWidth={false} type="button" loading={recordingPayment} onClick={handleRecordPayment}>
                        Record Payment
                      </DivineButton>
                    </>
                  ) : (
                    <p className="text-[12.5px] text-ink-500">
                      You have view-only access — recording a payment requires full access on POS Transactions.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </FormDrawer>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-0.5">
      <span className="text-[11px] uppercase tracking-wide text-ink-500">{label}</span>
      <span className="font-medium text-ink-100">{value}</span>
    </div>
  );
}
