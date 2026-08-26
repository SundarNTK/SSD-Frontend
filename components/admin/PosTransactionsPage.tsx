"use client";

import { useEffect, useState, type ReactNode } from "react";
import DataTable, { type DataTableColumn } from "./DataTable";
import FormDrawer from "./FormDrawer";
import DivineListbox, { type ListboxOption } from "../divine/DivineListbox";
import DivineButton from "../divine/DivineButton";
import { EyeIcon } from "../divine/icons";
import { api, unwrap, extractErrorMessage, type ApiEnvelope } from "../../lib/api";
import { useApiResource } from "../../lib/useApiResource";
import { formatTempleDateTime } from "../../lib/datetime";
import { toast } from "../../lib/toastStore";

type BookingListItem = {
  _id: string;
  bookingNumber: string;
  orderNumber: string | null;
  customer: { _id: string; customerCode: string; name: string } | null;
  lineType: string;
  paymentModeName: string;
  subtotal: number;
  gstAmount: number;
  grandTotal: number;
  bookingStatus: "confirmed" | "cancelled";
  portal: "admin" | "customer";
  bookedAt: string;
};

type DeityRef = { _id: string; name: string };
type Devotee = { name: string; nakshatra: string };

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
  paymentStatus: "paid" | "pending";
  bookingStatus: "confirmed" | "cancelled";
  portal: "admin" | "customer";
  bookedBy: { _id: string; name: string; email: string } | null;
  bookedAt: string;
};

function formatCurrency(v: number) {
  return `$${v.toFixed(2)}`;
}

function BookingStatusPill({ status }: { status: "confirmed" | "cancelled" }) {
  return status === "confirmed" ? (
    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] tracking-wide text-emerald-600">
      Completed
    </span>
  ) : (
    <span className="rounded-full border border-crimson-500/30 bg-crimson-500/10 px-2.5 py-1 text-[11px] tracking-wide text-crimson-500">
      Cancelled
    </span>
  );
}

function PortalPill({ portal }: { portal: "admin" | "customer" }) {
  return portal === "admin" ? (
    <span className="rounded-full border border-gold-500/25 bg-gold-500/10 px-2.5 py-1 text-[11px] tracking-wide text-amber-700">
      Admin
    </span>
  ) : (
    <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[11px] tracking-wide text-sky-600">
      Customer
    </span>
  );
}

const STATUS_FILTER_OPTIONS: ListboxOption[] = [
  { value: "", label: "All Status" },
  { value: "confirmed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const PORTAL_FILTER_OPTIONS: ListboxOption[] = [
  { value: "", label: "All Portals" },
  { value: "admin", label: "Admin" },
  { value: "customer", label: "Customer" },
];

const COLUMNS: DataTableColumn<BookingListItem>[] = [
  {
    key: "orderNumber",
    label: "Transaction No",
    render: (b) => <span className="font-medium tabular-nums text-amber-700">{b.orderNumber ?? "—"}</span>,
  },
  {
    key: "bookingNumber",
    label: "Receipt No",
    render: (b) => <span className="tabular-nums">{b.bookingNumber}</span>,
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
 * to unfiltered (shows both) since today every booking is staff-created via
 * POS Portal or Admin Booking (both "Admin") — the "Customer" option is
 * forward-looking infrastructure for the Customer Portal's eventual
 * self-service booking flow.
 */
export default function PosTransactionsPage() {
  const { items, total, list } = useApiResource<BookingListItem>(api, "/pos/booking/bookings");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [portalFilter, setPortalFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const [detail, setDetail] = useState<BookingDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    list.run({ page, pageSize, search: search || undefined, status: statusFilter || undefined, portal: portalFilter || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, search, statusFilter, portalFilter]);

  async function openDetail(id: string) {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    try {
      const r = await api.get<ApiEnvelope<BookingDetail>>(`/pos/booking/bookings/${id}`);
      setDetail(unwrap(r));
    } catch (err) {
      toast.error(extractErrorMessage(err));
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
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
        subtitle={detail?.orderId?.orderNumber ? `Transaction ${detail.orderId.orderNumber}` : undefined}
        maxWidthClassName="max-w-2xl"
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <DetailRow label="Status" value={<BookingStatusPill status={detail.bookingStatus} />} />
              <DetailRow label="Portal" value={<PortalPill portal={detail.portal} />} />
              <DetailRow label="Date & Time" value={formatTempleDateTime(detail.bookedAt)} />
              <DetailRow label="Booked By" value={detail.bookedBy?.name ?? "—"} />
            </div>

            <div className="rounded-xl border border-gold-500/15 bg-ivory-100 px-4 py-3">
              <p className="mb-1 text-[11px] uppercase tracking-wide text-amber-600">Customer</p>
              <p className="font-medium text-ink-100">{detail.customer?.name ?? "—"}</p>
              <p className="text-[12px] text-ink-500">
                {detail.customer?.customerCode}
                {detail.customer?.email ? ` · ${detail.customer.email}` : ""}
                {detail.customer?.mobileNumber ? ` · ${detail.customer.mobileNumber}` : ""}
              </p>
            </div>

            <div>
              <p className="mb-2 text-[11px] uppercase tracking-wide text-amber-600">Line Items</p>
              <div className="space-y-2">
                {detail.lines.map((line, idx) => (
                  <div key={idx} className="rounded-xl border border-gold-500/15 bg-white px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-ink-100">{line.name}</p>
                        <p className="text-[11.5px] text-ink-500">
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

            <div className="rounded-xl border border-gold-500/15 bg-ivory-100 px-4 py-3">
              <p className="mb-2 text-[11px] uppercase tracking-wide text-amber-600">Payment</p>
              <DetailRow label="Payment Mode" value={detail.paymentModeName} />
              <DetailRow label="Payment Status" value={detail.paymentStatus === "paid" ? "Paid" : "Pending"} />
              <div className="mt-2 space-y-1 border-t border-gold-500/10 pt-2">
                <div className="flex justify-between text-ink-500">
                  <span>Sub Total</span>
                  <span>{formatCurrency(detail.subtotal)}</span>
                </div>
                <div className="flex justify-between text-ink-500">
                  <span>GST</span>
                  <span>{formatCurrency(detail.gstAmount)}</span>
                </div>
                <div className="flex justify-between border-t border-gold-500/10 pt-1.5 font-bold text-ink-100">
                  <span>Grand Total</span>
                  <span className="text-amber-600">{formatCurrency(detail.grandTotal)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </FormDrawer>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="text-ink-500">{label}</span>
      <span className="font-medium text-ink-100">{value}</span>
    </div>
  );
}
