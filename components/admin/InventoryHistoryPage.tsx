"use client";

import { useEffect, useState } from "react";
import DataTable, { type DataTableColumn } from "./DataTable";
import DivineListbox, { type ListboxOption } from "../divine/DivineListbox";
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
    <span className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11.5px] font-medium text-emerald-700">
      Stock In
    </span>
  ) : (
    <span className="inline-flex items-center rounded-md border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-[11.5px] font-medium text-orange-700">
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

const TYPE_FILTER_OPTIONS: ListboxOption[] = [
  { value: "", label: "All Types" },
  { value: "Item", label: "Item" },
  { value: "Service", label: "Service" },
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
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  useEffect(() => {
    list.run({ page, pageSize, search: search || undefined, refType: type || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, search, type]);

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
      extraFilters={
        <DivineListbox
          value={type}
          onChange={(v) => {
            setPage(1);
            setType(v);
          }}
          options={TYPE_FILTER_OPTIONS}
          className="w-40"
        />
      }
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
