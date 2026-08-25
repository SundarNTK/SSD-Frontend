"use client";

import { useEffect, useState } from "react";
import DataTable, { type DataTableColumn } from "./DataTable";
import { api } from "../../lib/api";
import { useApiResource } from "../../lib/useApiResource";
import { formatTempleDateTime } from "../../lib/datetime";

export type InventoryMovement = {
  _id: string;
  createdAt: string;
  refType: "Item" | "Service";
  name: string;
  code: string;
  inventoryType: "Stock In" | "Stock Out";
  quantity: number;
  balance: number;
  user: string;
};

export function ActionPill({ type }: { type: "Stock In" | "Stock Out" }) {
  return type === "Stock In" ? (
    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] tracking-wide text-emerald-400">
      Stock In
    </span>
  ) : (
    <span className="rounded-full border border-flame-500/30 bg-flame-500/10 px-2.5 py-1 text-[11px] tracking-wide text-flame-500">
      Stock Out
    </span>
  );
}

export const MOVEMENT_COLUMNS: DataTableColumn<InventoryMovement>[] = [
  {
    key: "createdAt",
    label: "Date & Time",
    render: (m) => <span className="text-ink-500">{formatTempleDateTime(m.createdAt)}</span>,
  },
  { key: "name", label: "Name", render: (m) => <span className="font-medium">{m.name}</span> },
  { key: "code", label: "Code", render: (m) => <span className="tabular-nums text-amber-700">{m.code}</span> },
  { key: "inventoryType", label: "Action", render: (m) => <ActionPill type={m.inventoryType} /> },
  { key: "quantity", label: "Quantity", render: (m) => <span className="tabular-nums">{m.quantity}</span> },
  { key: "balance", label: "Balance", render: (m) => <span className="tabular-nums">{m.balance}</span> },
  { key: "user", label: "User", render: (m) => <span className="text-ink-500">{m.user}</span> },
];

const DEFAULT_PAGE_SIZE = 10;

/**
 * Read-only ledger of every stock movement (see GET /inventory/history) —
 * every row is written exclusively by Inventory Adjustment's create form,
 * this screen just lists them all with no create/edit/delete of its own.
 */
export default function InventoryHistoryPage() {
  const { items, total, list } = useApiResource<InventoryMovement>(api, "/inventory/history");

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  useEffect(() => {
    list.run({ page, pageSize, search: search || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, search]);

  return (
    <DataTable
      title="Inventory History"
      subtitle="View all inventory movements."
      columns={MOVEMENT_COLUMNS}
      rows={items}
      rowKey={(m) => m._id}
      loading={list.submitting}
      search={search}
      onSearchChange={(v) => {
        setPage(1);
        setSearch(v);
      }}
      searchPlaceholder="Search by name or code…"
      page={page}
      pageSize={pageSize}
      total={total}
      onPageChange={setPage}
      onPageSizeChange={(size) => {
        setPage(1);
        setPageSize(size);
      }}
      emptyMessage="No inventory movements yet."
    />
  );
}
