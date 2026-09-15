"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DataTable, { type DataTableColumn } from "../DataTable";
import DivineListbox from "../../divine/DivineListbox";
import { api } from "../../../lib/api";
import { useApiResource } from "../../../lib/useApiResource";
import { usePageSize } from "../../../lib/usePageSize";

type HallBookingRow = {
  _id: string;
  bookingNumber: string;
  customerInfo: { name: string; mobileNo: string | null } | null;
  hallName: string | null;
  hallPackageName: string | null;
  eventDate: string;
  startTime: string;
  endTime: string;
  finalAmount: number;
  amountPaid: number;
  balanceAmount: number;
  bookingStatus: "confirmed" | "completed" | "cancelled";
  paymentStatus: "unpaid" | "partial" | "paid";
};

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

function StatusChip({ value, styles }: { value: string; styles: Record<string, string> }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11.5px] font-medium capitalize ${styles[value] ?? ""}`}>
      {value}
    </span>
  );
}

/** Reachable only by a Super Admin with hallMealAccess — see hall-meal/layout.tsx. */
export default function HallBookingsListPage() {
  const router = useRouter();
  const { items, total, list } = useApiResource<HallBookingRow>(api, "/hall-meal/hall-bookings");

  const [search, setSearch] = useState("");
  const [bookingStatus, setBookingStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = usePageSize();

  useEffect(() => {
    list.run({ page, pageSize, search: search || undefined, bookingStatus: bookingStatus || undefined, paymentStatus: paymentStatus || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, search, bookingStatus, paymentStatus]);

  const columns: DataTableColumn<HallBookingRow>[] = [
    { key: "bookingNumber", label: "Booking No.", render: (r) => <span className="tabular-nums font-medium text-amber-700">{r.bookingNumber}</span> },
    { key: "customer", label: "Customer", render: (r) => <span>{r.customerInfo?.name ?? "—"}</span> },
    { key: "hall", label: "Hall / Package", render: (r) => <span>{r.hallPackageName || r.hallName || "—"}</span> },
    {
      key: "event",
      label: "Event Date / Time",
      render: (r) => (
        <span className="tabular-nums">
          {r.eventDate.slice(0, 10)} · {r.startTime}–{r.endTime}
        </span>
      ),
    },
    { key: "finalAmount", label: "Amount", render: (r) => <span className="tabular-nums">{r.finalAmount.toFixed(2)}</span> },
    { key: "balanceAmount", label: "Outstanding", render: (r) => <span className="tabular-nums">{r.balanceAmount.toFixed(2)}</span> },
    { key: "bookingStatus", label: "Booking Status", render: (r) => <StatusChip value={r.bookingStatus} styles={BOOKING_STATUS_STYLE} /> },
    { key: "paymentStatus", label: "Payment Status", render: (r) => <StatusChip value={r.paymentStatus} styles={PAYMENT_STATUS_STYLE} /> },
  ];

  return (
    <DataTable
      title="Hall Booking"
      subtitle="Every Hall & Package booking — search, filter, and open one to collect payment, reschedule, cancel or refund."
      columns={columns}
      rows={items}
      rowKey={(r) => r._id}
      loading={list.submitting}
      search={search}
      onSearchChange={(v) => { setPage(1); setSearch(v); }}
      searchPlaceholder="Search by booking number or customer…"
      extraFilters={
        <>
          <DivineListbox
            value={bookingStatus}
            onChange={(v) => { setPage(1); setBookingStatus(v); }}
            options={[
              { value: "", label: "All Booking Statuses" },
              { value: "confirmed", label: "Confirmed" },
              { value: "completed", label: "Completed" },
              { value: "cancelled", label: "Cancelled" },
            ]}
            className="w-48"
          />
          <DivineListbox
            value={paymentStatus}
            onChange={(v) => { setPage(1); setPaymentStatus(v); }}
            options={[
              { value: "", label: "All Payment Statuses" },
              { value: "unpaid", label: "Unpaid" },
              { value: "partial", label: "Partially Paid" },
              { value: "paid", label: "Paid" },
            ]}
            className="w-48"
          />
        </>
      }
      page={page}
      pageSize={pageSize}
      total={total}
      onPageChange={setPage}
      onPageSizeChange={(size) => { setPage(1); setPageSize(size); }}
      onCreate={() => router.push("/admin/hall-meal/hall-bookings/new")}
      createLabel="New Hall Booking"
      emptyMessage="No Hall Bookings yet — create the first one."
      rowActions={(r) => (
        <button
          type="button"
          onClick={() => router.push(`/admin/hall-meal/hall-bookings/${r._id}`)}
          className="text-[12.5px] font-medium text-amber-600 hover:underline"
        >
          Manage
        </button>
      )}
    />
  );
}
