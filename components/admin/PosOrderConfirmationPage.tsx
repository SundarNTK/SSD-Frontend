"use client";

import { useEffect, useState } from "react";
import DataTable, { type DataTableColumn } from "./DataTable";
import FormDrawer from "./FormDrawer";
import DivineButton from "../divine/DivineButton";
import DivineInput from "../divine/DivineInput";
import { CheckIcon } from "../divine/icons";
import { api, unwrap, extractErrorMessage, type ApiEnvelope } from "../../lib/api";
import { useApiResource } from "../../lib/useApiResource";
import { formatTempleDateTime } from "../../lib/datetime";
import { toast } from "../../lib/toastStore";
import { MODULES, usePermissions } from "../../lib/permissions";
import { EmblemLoader } from "../divine/EmblemLoader";

type ConfirmationKind = "new_payment" | "balance_due";

// One row per PENDING pos_transaction — see controllers/pos-order-confirmation's
// own comment on why this is keyed off the transaction, not the order/booking.
type PendingListItem = {
  transactionId: string;
  referenceId: string;
  orderNumber: string | null;
  kind: ConfirmationKind;
  customer: { _id: string; name: string; customerCode: string } | null;
  paymentModeName: string;
  amount: number;
  createdAt: string;
  expiresAt: string;
};

type LineDetail = {
  refType: "Item" | "Service";
  name: string;
  code: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

type PendingDetail = {
  referenceId: string;
  orderNumber: string | null;
  bookingNumber: string | null;
  kind: ConfirmationKind;
  customer: { name: string; customerCode: string } | null;
  lines: LineDetail[];
  grandTotal: number;
  // The fixed amount THIS pending payment is for — set once, at QR
  // generation, never editable here. See request-objects.js on the backend.
  amount: number;
  paymentModeName: string;
  expiresAt: string;
};

function formatCurrency(v: number) {
  return `$${v.toFixed(2)}`;
}

function KindPill({ kind }: { kind: ConfirmationKind }) {
  return kind === "new_payment" ? (
    <span className="inline-flex items-center whitespace-nowrap rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[11.5px] font-medium text-violet-700">
      New Payment
    </span>
  ) : (
    <span className="inline-flex items-center whitespace-nowrap rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11.5px] font-medium text-amber-700">
      Balance Due
    </span>
  );
}

const COLUMNS: DataTableColumn<PendingListItem>[] = [
  { key: "referenceId", label: "Reference", render: (r) => <span className="font-medium tabular-nums text-amber-700">{r.referenceId}</span> },
  { key: "kind", label: "Type", render: (r) => <KindPill kind={r.kind} /> },
  { key: "customer", label: "Customer", render: (r) => r.customer?.name ?? "—" },
  { key: "paymentMode", label: "Payment Mode", render: (r) => r.paymentModeName },
  { key: "amount", label: "Amount", render: (r) => <span className="tabular-nums font-semibold text-[#7c1527]">{formatCurrency(r.amount)}</span> },
  { key: "createdAt", label: "QR Generated", render: (r) => <span className="text-ink-500">{formatTempleDateTime(r.createdAt)}</span> },
  { key: "expiresAt", label: "Expires", render: (r) => <span className="text-ink-500">{formatTempleDateTime(r.expiresAt)}</span> },
];

/**
 * Admin screen for manually confirming a PayNow (or, later, NETS) payment
 * that a real bank/terminal confirmation hasn't reached yet — the stand-in
 * for DBS's ICN webhook, which needs a public URL `localhost` can't be
 * during local dev/testing. See docs/paynow-integration.md (SSD-Backend)
 * and controllers/pos-order-confirmation for the full rationale.
 *
 * The amount shown here is never editable — it was already fixed the
 * moment the QR was generated (same rule Cash's own `paidAmount` follows at
 * checkout), and this screen can only confirm that exact amount, matching
 * how HEB's own equivalent admin screens (D:\PROJECTS\HEB\Admin-Frontend)
 * always render this amount read-only.
 *
 * Cash never appears here — it confirms itself at the counter and never
 * creates a pending transaction in the first place.
 */
export default function PosOrderConfirmationPage() {
  const { items, total, list } = useApiResource<PendingListItem>(api, "/pos-order-confirmation/pending");
  const { can } = usePermissions();
  const canConfirm = can(MODULES.posOrderConfirmation, "fullAccess");

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [detail, setDetail] = useState<PendingDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const [gatewayReferenceInput, setGatewayReferenceInput] = useState("");
  const [confirming, setConfirming] = useState(false);

  function refreshList() {
    list.run({ page, pageSize, search: search || undefined });
  }

  useEffect(() => {
    refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, search]);

  async function openDetail(referenceId: string) {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    setGatewayReferenceInput("");
    try {
      const r = await api.get<ApiEnvelope<PendingDetail>>(`/pos-order-confirmation/pending/${referenceId}`);
      setDetail(unwrap(r));
    } catch (err) {
      toast.error(extractErrorMessage(err));
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleConfirm() {
    if (!detail) return;
    if (!gatewayReferenceInput.trim()) {
      toast.error("Enter a reference for this confirmation — the same reference DBS's own notification would carry.");
      return;
    }

    setConfirming(true);
    try {
      const r = await api.post<ApiEnvelope<{ alreadyProcessed: boolean }>>(`/pos-order-confirmation/${detail.referenceId}/confirm`, {
        gatewayReference: gatewayReferenceInput.trim(),
      });
      const result = unwrap(r);
      toast.created(result.alreadyProcessed ? "Already confirmed — nothing changed." : "Payment confirmed.");
      setDetailOpen(false);
      setDetail(null);
      refreshList();
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setConfirming(false);
    }
  }

  return (
    <>
      <DataTable
        title="POS Order Confirmation"
        subtitle="Manually confirm a PayNow/NETS payment that hasn't had its bank confirmation arrive yet."
        columns={COLUMNS}
        rows={items}
        rowKey={(r) => r.transactionId}
        loading={list.submitting}
        search={search}
        onSearchChange={(v) => {
          setPage(1);
          setSearch(v);
        }}
        searchPlaceholder="Search by reference, order no. or customer…"
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPage(1);
          setPageSize(size);
        }}
        emptyMessage="Nothing awaiting confirmation."
        rowActions={(r) => (
          <DivineButton variant="flame" fullWidth={false} type="button" onClick={() => openDetail(r.referenceId)}>
            <span className="inline-flex items-center gap-1.5">
              <CheckIcon className="h-3.5 w-3.5" />
              Confirm
            </span>
          </DivineButton>
        )}
      />

      <FormDrawer
        open={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          setDetail(null);
        }}
        title={detail ? `Confirm ${detail.referenceId}` : "Confirm Payment"}
        maxWidthClassName="max-w-2xl"
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
            {canConfirm && (
              <DivineButton variant="flame" fullWidth={false} type="button" loading={confirming} disabled={detailLoading || !detail} onClick={handleConfirm}>
                Confirm Payment
              </DivineButton>
            )}
          </div>
        }
      >
        {detailLoading && (
          <div className="flex justify-center py-8">
            <EmblemLoader size="sm" label="Loading…" />
          </div>
        )}

        {!detailLoading && detail && (
          <div className="space-y-4">
            <div className="rounded-xl border border-[#ead9c6] bg-white px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7c1527]">Order</p>
              <div className="mt-2 grid grid-cols-2 gap-y-1.5 text-[13px]">
                <span className="text-ink-500">Customer</span>
                <span className="text-right font-medium">{detail.customer?.name ?? "—"}</span>
                <span className="text-ink-500">Order No.</span>
                <span className="text-right font-medium tabular-nums">{detail.orderNumber ?? "—"}</span>
                {detail.kind === "balance_due" && (
                  <>
                    <span className="text-ink-500">Booking No.</span>
                    <span className="text-right font-medium tabular-nums">{detail.bookingNumber}</span>
                  </>
                )}
                <span className="text-ink-500">Payment Mode</span>
                <span className="text-right font-medium">{detail.paymentModeName}</span>
              </div>
            </div>

            {detail.lines.length > 0 && (
              <div className="rounded-xl border border-[#ead9c6] bg-white px-4 py-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#7c1527]">Offerings</p>
                <ul className="space-y-1 text-[13px]">
                  {detail.lines.map((line, idx) => (
                    <li key={idx} className="flex items-center justify-between gap-3">
                      <span>
                        {line.name} <span className="text-ink-500">x{line.quantity}</span>
                      </span>
                      <span className="tabular-nums">{formatCurrency(line.lineTotal)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Read-only — this amount was fixed at QR-generation time and
                cannot be changed here, see the module comment above. */}
            <div className="flex items-center justify-between rounded-lg bg-emerald-500/10 px-3 py-2 text-[13px]">
              <span className="text-ink-500">Amount to Confirm</span>
              <span className="font-semibold tabular-nums text-[#7c1527]">{formatCurrency(detail.amount)}</span>
            </div>

            {canConfirm ? (
              <div className="space-y-2 rounded-xl border border-[#ead9c6] bg-white px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7c1527]">Confirm Receipt of Payment</p>
                <DivineInput
                  staticLabel
                  label="Bank / Gateway Reference (or a note identifying this confirmation)"
                  placeholder="e.g. the DBS txnRefId"
                  value={gatewayReferenceInput}
                  onChange={(e) => setGatewayReferenceInput(e.target.value)}
                />
                <p className="text-[11px] text-ink-500">
                  Confirming attests that {formatCurrency(detail.amount)} was actually received — the amount itself cannot be
                  changed here. Confirming the same reference twice never double-counts.
                </p>
              </div>
            ) : (
              <p className="text-[12.5px] text-ink-500">
                You have view-only access — confirming a payment requires full access on POS Order Confirmation.
              </p>
            )}
          </div>
        )}
      </FormDrawer>
    </>
  );
}
