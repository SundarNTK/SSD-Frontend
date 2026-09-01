"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import DataTable, { type DataTableColumn } from "./DataTable";
import FormDrawer from "./FormDrawer";
import DivineListbox, { type ListboxOption } from "../divine/DivineListbox";
import DivineButton from "../divine/DivineButton";
import DivineInput from "../divine/DivineInput";
import { EyeIcon, PrinterIcon } from "../divine/icons";
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
  const [printHost, setPrintHost] = useState<HTMLElement | null>(null);
  const printAfterLoad = useRef(false);

  useEffect(() => {
    setPrintHost(document.body);
  }, []);

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

  async function openDetail(id: string, opts?: { print?: boolean }) {
    printAfterLoad.current = !!opts?.print;
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
      printAfterLoad.current = false;
      toast.error(extractErrorMessage(err));
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    if (!printAfterLoad.current || detailLoading || !detail) return;
    printAfterLoad.current = false;
    const id = window.setTimeout(() => printReceipt(), 300);
    return () => window.clearTimeout(id);
  }, [detail, detailLoading]);

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
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => openDetail(b._id)}
              aria-label={`View receipt ${b.bookingNumber}`}
              className="text-ink-300 hover:text-ink-100"
            >
              <EyeIcon />
            </button>
            <button
              type="button"
              onClick={() => openDetail(b._id, { print: true })}
              aria-label={`Print receipt ${b.bookingNumber}`}
              className="text-ink-300 hover:text-ink-100"
            >
              <PrinterIcon />
            </button>
          </div>
        )}
      />

      <FormDrawer
        open={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          setDetail(null);
        }}
        title={detail ? `Booking ${detail.bookingNumber}` : "Booking Details"}
        maxWidthClassName="max-w-4xl"
        printSheet
        footer={
          <div className="flex justify-end gap-3">
            <DivineButton
              variant="ghost"
              fullWidth={false}
              type="button"
              onClick={() => {
                setDetailOpen(false);
                setDetail(null);
              }}
            >
              Close
            </DivineButton>
            <DivineButton
              fullWidth={false}
              type="button"
              onClick={() => printReceipt()}
              disabled={detailLoading || !detail}
            >
              <span className="inline-flex items-center gap-2">
                <PrinterIcon />
                Print Receipt
              </span>
            </DivineButton>
          </div>
        }
      >
        {detailLoading && <p className="py-8 text-center text-[13px] text-ink-500">Loading…</p>}

        {!detailLoading && detail && (
          <div className="space-y-5">
            <BookingReceiptDocument detail={detail} />
            {detail.bookingStatus === "confirmed" && detail.balanceAmount > 0 && (
              <div className="no-print space-y-2 rounded-xl border border-[#ead9c6] bg-white px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7c1527]">Record Payment</p>
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
        )}
      </FormDrawer>

      {printHost &&
        detailOpen &&
        detail &&
        createPortal(
          <div className="pos-receipt-print-root" aria-hidden="true">
            <BookingReceiptDocument detail={detail} />
          </div>,
          printHost,
        )}
    </>
  );
}

function printReceipt() {
  const root = document.querySelector(".pos-receipt-print-root");
  const images = root ? Array.from(root.querySelectorAll("img")) : [];
  const pending = images.map((img) =>
    img.complete
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        }),
  );
  const previousTitle = document.title;
  document.title = " ";
  const restoreTitle = () => {
    document.title = previousTitle;
    window.removeEventListener("afterprint", restoreTitle);
  };
  window.addEventListener("afterprint", restoreTitle);
  void Promise.all(pending).then(() => {
    window.setTimeout(() => window.print(), 80);
  });
}

function ReceiptSection({
  title,
  children,
  allowTableSplit = false,
  keepTogether = false,
}: {
  title: string;
  children: ReactNode;
  allowTableSplit?: boolean;
  keepTogether?: boolean;
}) {
  return (
    <section
      className={`border-b border-[#1c1917] pb-2.5 ${allowTableSplit ? "receipt-section--table" : ""} ${keepTogether ? "receipt-keep" : ""}`}
    >
      <h3 className="mb-2.5 text-[17px] font-bold text-[#1c1917]">{title}</h3>
      {children}
    </section>
  );
}

function portalLabel(portal: BookingDetail["portal"]) {
  if (portal === "admin") return "Admin Panel";
  if (portal === "pos") return "POS Counter";
  return "Customer";
}

function paymentStatusLabel(status: PaymentStatus) {
  if (status === "paid") return "Paid";
  if (status === "partial") return "Partial";
  return "Pending";
}

function BookingReceiptDocument({ detail }: { detail: BookingDetail }) {
  return (
    <article className="mx-auto max-w-2xl bg-white text-[13px] leading-snug text-[#1c1917]">
      <header className="receipt-keep pb-2 text-center">
        <img
          src="/SSD_Full_Logo.png"
          alt="Sri Siva Durga Temple"
          className="mx-auto h-[88px] w-auto max-w-[360px] object-contain sm:h-[104px]"
        />
        <p className="mt-3 text-[20px] font-bold leading-snug text-[#1c1917] sm:text-[22px]">
          Sri Siva Durga Booking Official Receipt
        </p>
      </header>
      <div className="mt-3 h-[2px] bg-[#1c1917]" />

      <div className="mt-2.5 space-y-2.5">
        <ReceiptSection title="Reference">
          <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-3">
            <ReceiptField label="Booking No." value={detail.bookingNumber} />
            <ReceiptField label="Order No." value={detail.orderId?.orderNumber ?? "—"} />
            <ReceiptField label="Receipt No." value={detail.transactions[0]?.receiptNo ?? "—"} />
          </div>
        </ReceiptSection>

        <ReceiptSection title="Booking Details">
          <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
            <ReceiptField
              label="Status"
              value={detail.bookingStatus === "confirmed" ? "Completed" : "Cancelled"}
            />
            <ReceiptField label="Portal" value={portalLabel(detail.portal)} />
            <ReceiptField label="Date & Time" value={formatTempleDateTime(detail.bookedAt)} />
            <ReceiptField label="Booked By" value={detail.bookedBy?.name ?? "—"} />
          </div>
        </ReceiptSection>

        <ReceiptSection title="Customer">
          <p className="text-[15px] font-semibold text-[#1c1917]">{detail.customer?.name ?? "—"}</p>
          <div className="mt-2 grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-3">
            <ReceiptField label="Customer ID" value={detail.customer?.customerCode ?? "—"} />
            <ReceiptField label="Email" value={detail.customer?.email ?? "—"} />
            <ReceiptField label="Mobile" value={detail.customer?.mobileNumber ?? "—"} />
          </div>
        </ReceiptSection>

        <ReceiptSection title="Offerings" allowTableSplit>
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[#e8e4dc] text-[11px] font-medium text-[#6b6258]">
                <th className="pb-1.5 pr-3 font-medium">Item / Service</th>
                <th className="w-12 pb-1.5 text-center font-medium">Qty</th>
                <th className="w-20 pb-1.5 text-right font-medium">Unit</th>
                <th className="w-24 pb-1.5 pl-3 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {detail.lines.map((line, idx) => (
                <tr key={idx} className="border-b border-[#f3efe8] last:border-b-0">
                  <td className="py-1.5 pr-3 align-top">
                    <p className="font-medium text-[#1c1917]">{line.name}</p>
                    <p className="mt-0.5 text-[11.5px] text-[#6b6258]">
                      {line.refType} · {line.code}
                    </p>
                    {line.deities.length > 0 && (
                      <p className="mt-0.5 text-[11.5px] text-[#6b6258]">
                        Deities: {line.deities.map((d) => d.name).join(", ")}
                      </p>
                    )}
                    {line.devotees.length > 0 && (
                      <p className="text-[11.5px] text-[#6b6258]">
                        Devotees:{" "}
                        {line.devotees
                          .map((d) => `${d.name}${d.nakshatra ? ` (${d.nakshatra})` : ""}`)
                          .join(", ")}
                      </p>
                    )}
                  </td>
                  <td className="py-1.5 text-center tabular-nums">{line.quantity}</td>
                  <td className="py-1.5 text-right tabular-nums text-[#6b6258]">{formatCurrency(line.unitPrice)}</td>
                  <td className="py-1.5 pl-3 text-right font-medium tabular-nums">{formatCurrency(line.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ReceiptSection>

        <ReceiptSection title="Payment Records" allowTableSplit>
            <div className="mb-2 flex items-center justify-between text-[13px]">
              <span className="text-[#6b6258]">
                Mode: <span className="font-medium text-[#1c1917]">{detail.paymentModeName}</span>
              </span>
              <span className="font-medium text-[#1c1917]">{paymentStatusLabel(detail.paymentStatus)}</span>
            </div>
            {detail.transactions.length > 0 ? (
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-[#e8e4dc] text-[11px] font-medium text-[#6b6258]">
                    <th className="pb-1.5 pr-3 font-medium">Receipt No.</th>
                    <th className="pb-1.5 pr-3 font-medium">Mode</th>
                    <th className="pb-1.5 pr-3 font-medium">Date & Time</th>
                    <th className="pb-1.5 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.transactions.map((t) => (
                    <tr key={t._id} className="border-b border-[#f3efe8] last:border-b-0">
                      <td className="py-1.5 pr-3 tabular-nums">{t.receiptNo}</td>
                      <td className="py-1.5 pr-3">{t.paymentModeName}</td>
                      <td className="py-1.5 pr-3 text-[#6b6258]">{formatTempleDateTime(t.transactionDate)}</td>
                      <td className="py-1.5 text-right font-medium tabular-nums">{formatCurrency(t.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-[12.5px] text-[#6b6258]">No payments recorded yet.</p>
            )}
          </ReceiptSection>

          <ReceiptSection title="Amount Summary" keepTogether>
            <div className="ml-auto w-full max-w-sm space-y-1.5">
              <SummaryRow label="Sub Total" value={formatCurrency(detail.subtotal)} />
              <SummaryRow label="GST" value={formatCurrency(detail.gstAmount)} />
              <div className="flex items-center justify-between border-y border-[#e8e4dc] py-2">
                <span className="text-[13px] font-semibold text-[#1c1917]">
                  Total Payable
                  <span className="ml-2 text-[10px] font-medium text-[#6b6258]">GST Inclusive</span>
                </span>
                <span className="text-[15px] font-semibold tabular-nums text-[#1c1917]">
                  {formatCurrency(detail.grandTotal)}
                </span>
              </div>
              <SummaryRow label="Amount Paid" value={formatCurrency(detail.amountPaid)} emphasis="paid" />
              <SummaryRow
                label="Balance Due"
                value={formatCurrency(detail.balanceAmount)}
                emphasis={detail.balanceAmount > 0 ? "due" : "plain"}
              />
            </div>
          </ReceiptSection>

          <p className="receipt-keep pt-1 text-center text-[12px] text-[#6b6258]">
            Thank you for your offering. Please retain this receipt for your records.
          </p>
      </div>
    </article>
  );
}

function ReceiptField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[#8a8076]">{label}</p>
      <div className="mt-1 break-all text-[13.5px] font-semibold tabular-nums text-[#1c1917]">{value}</div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  emphasis = "plain",
}: {
  label: string;
  value: string;
  emphasis?: "plain" | "paid" | "due";
}) {
  const valueClass =
    emphasis === "paid"
      ? "font-medium text-emerald-700"
      : emphasis === "due"
        ? "font-bold text-crimson-500"
        : "text-[#1c1917]";
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[#6b6258]">{label}</span>
      <span className={`tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
}
