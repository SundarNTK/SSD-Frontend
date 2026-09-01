"use client";

import { useEffect, useState } from "react";
import DataTable, { type DataTableColumn } from "./DataTable";
import DivineListbox, { type ListboxOption } from "../divine/DivineListbox";
import { api } from "../../lib/api";
import { useApiResource } from "../../lib/useApiResource";

export type StockRow = {
  _id: string;
  refType: "Item" | "Service";
  name: string;
  code: string;
  availableQuantity: number;
};

function TypePill({ type }: { type: "Item" | "Service" }) {
  return (
    <span className="inline-flex items-center rounded-md border border-gold-500/30 bg-gold-500/10 px-2 py-0.5 text-[11.5px] font-medium text-amber-700">
      {type}
    </span>
  );
}

const TYPE_OPTIONS: ListboxOption[] = [
  { value: "", label: "All Types" },
  { value: "Item", label: "Item" },
  { value: "Service", label: "Service" },
];

const DEFAULT_PAGE_SIZE = 10;

/**
 * Read-only — merges Item and Service (two different collections) into one
 * list server-side (see GET /inventory/available-stock), so this page just
 * renders whatever comes back.
 */
export default function AvailableStockPage() {
  const { items, total, list } = useApiResource<StockRow>(api, "/inventory/available-stock");

  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  useEffect(() => {
    list.run({ page, pageSize, search: search || undefined, type: type || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, search, type]);

  const columns: DataTableColumn<StockRow>[] = [
    { key: "refType", label: "Type", render: (r) => <TypePill type={r.refType} /> },
    { key: "name", label: "Name", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "code", label: "Code", render: (r) => <span className="tabular-nums text-amber-700">{r.code}</span> },
    {
      key: "availableQuantity",
      label: "Available Quantity",
      render: (r) => <span className="tabular-nums">{r.availableQuantity}</span>,
    },
  ];

  return (
    <DataTable
      title="Available Stock"
      subtitle="View current available stock for inventory applicable items and services."
      columns={columns}
      rows={items}
      rowKey={(r) => r._id}
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
          options={TYPE_OPTIONS}
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
      emptyMessage="No inventory-applicable items or services yet."
    />
  );
}
