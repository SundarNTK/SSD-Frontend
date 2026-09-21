"use client";

import { useEffect, useState } from "react";
import DataTable, { type DataTableColumn } from "./DataTable";
import DivineListbox, { type ListboxOption } from "../divine/DivineListbox";
import { api } from "../../lib/api";
import { useApiResource } from "../../lib/useApiResource";
import { usePageSize } from "../../lib/usePageSize";

export type LowStockRow = {
  _id: string;
  name: string;
  code: string;
  currentStock: number;
  threshold: number;
  unitOfMeasure: string | null;
};

export type OutOfStockRow = {
  _id: string;
  refType: "Item" | "Service";
  name: string;
  code: string;
  currentStock: number;
  threshold: number;
};

type TabKey = "low" | "out";

const TABS: { key: TabKey; label: string }[] = [
  { key: "low", label: "Low Stock" },
  { key: "out", label: "Out of Stock" },
];

const TYPE_OPTIONS: ListboxOption[] = [
  { value: "", label: "All Types" },
  { value: "Item", label: "Item" },
  { value: "Service", label: "Service" },
];

function TypePill({ type }: { type: "Item" | "Service" }) {
  return (
    <span className="inline-flex items-center rounded-md border border-gold-500/30 bg-gold-500/10 px-2 py-0.5 text-[11.5px] font-medium text-amber-700">
      {type}
    </span>
  );
}

/**
 * Read-only, two tabs. "Low Stock" — Items still holding some stock but
 * under their own threshold (GET /inventory/low-stock; Item-only, since
 * Service has no unit of measure). "Out of Stock" — Items AND Services at
 * zero (GET /inventory/out-of-stock). The two never overlap: zero-stock
 * items appear only on the second tab.
 */
export default function LowStockReportPage() {
  const low = useApiResource<LowStockRow>(api, "/inventory/low-stock");
  const out = useApiResource<OutOfStockRow>(api, "/inventory/out-of-stock");

  const [tab, setTab] = useState<TabKey>("low");
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = usePageSize();

  useEffect(() => {
    if (tab === "low") low.list.run({ page, pageSize, search: search || undefined });
    else out.list.run({ page, pageSize, search: search || undefined, type: type || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page, pageSize, search, type]);

  const switchTab = (next: TabKey) => {
    setTab(next);
    setPage(1);
    setSearch("");
    setType("");
  };

  const lowColumns: DataTableColumn<LowStockRow>[] = [
    { key: "code", label: "Code", render: (r) => <span className="tabular-nums text-amber-700">{r.code}</span> },
    { key: "name", label: "Item Name", render: (r) => <span className="font-medium">{r.name}</span> },
    {
      key: "currentStock",
      label: "Current Stock",
      render: (r) => <span className="font-semibold tabular-nums text-crimson-500">{r.currentStock}</span>,
    },
    { key: "threshold", label: "Threshold", render: (r) => <span className="tabular-nums text-ink-500">{r.threshold}</span> },
    { key: "unitOfMeasure", label: "UOM", render: (r) => <span className="text-ink-500">{r.unitOfMeasure ?? "—"}</span> },
  ];

  const outColumns: DataTableColumn<OutOfStockRow>[] = [
    { key: "refType", label: "Type", render: (r) => <TypePill type={r.refType} /> },
    { key: "code", label: "Code", render: (r) => <span className="tabular-nums text-amber-700">{r.code}</span> },
    { key: "name", label: "Name", render: (r) => <span className="font-medium">{r.name}</span> },
    {
      key: "currentStock",
      label: "Current Stock",
      render: (r) => <span className="font-semibold tabular-nums text-crimson-500">{r.currentStock}</span>,
    },
    { key: "threshold", label: "Threshold", render: (r) => <span className="tabular-nums text-ink-500">{r.threshold}</span> },
  ];

  const tabBar = (
    <>
      <div className="mb-5 space-y-1">
        <h1 className="font-display text-[28px] font-bold text-ink-100">Stock Alerts</h1>
        <p className="text-[13px] text-ink-500">Items running low, and items and services that are completely out of stock.</p>
      </div>
      <div className="mb-5 flex gap-1.5 rounded-md bg-ivory-100 p-1.5 shadow-inner">
        {TABS.map((t) => {
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => switchTab(t.key)}
              className={`flex-1 rounded-md py-2.5 text-[13.5px] font-semibold transition-all duration-200 ${
                isActive
                  ? "-translate-y-0.5 bg-maroon text-white shadow-[0_6px_14px_-4px_rgba(124,21,39,0.45),inset_0_1px_0_rgba(255,255,255,0.25)]"
                  : "text-ink-300 hover:bg-white hover:text-ink-100"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </>
  );

  const shared = {
    title: "",
    search,
    onSearchChange: (v: string) => {
      setPage(1);
      setSearch(v);
    },
    searchPlaceholder: "Search by name or code…",
    page,
    pageSize,
    onPageChange: setPage,
    onPageSizeChange: (size: number) => {
      setPage(1);
      setPageSize(size);
    },
  };

  return (
    <>
      {tabBar}
      {tab === "low" ? (
        <DataTable
          {...shared}
          columns={lowColumns}
          rows={low.items}
          rowKey={(r) => r._id}
          loading={low.list.submitting}
          total={low.total}
          emptyMessage="No items are running low right now."
        />
      ) : (
        <DataTable
          {...shared}
          columns={outColumns}
          rows={out.items}
          rowKey={(r) => r._id}
          loading={out.list.submitting}
          total={out.total}
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
          emptyMessage="Nothing is out of stock right now."
        />
      )}
    </>
  );
}
