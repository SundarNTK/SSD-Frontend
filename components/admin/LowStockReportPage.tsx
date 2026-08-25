"use client";

import { useEffect, useState } from "react";
import DataTable, { type DataTableColumn } from "./DataTable";
import { api } from "../../lib/api";
import { useApiResource } from "../../lib/useApiResource";

export type LowStockRow = {
  _id: string;
  name: string;
  code: string;
  currentStock: number;
  threshold: number;
  unitOfMeasure: string | null;
};

const DEFAULT_PAGE_SIZE = 10;

/**
 * Read-only — items whose currentStock has dropped below their own
 * threshold, computed server-side (see GET /inventory/low-stock). Item-only:
 * Service has no unit of measure to show alongside a stock level.
 */
export default function LowStockReportPage() {
  const { items, total, list } = useApiResource<LowStockRow>(api, "/inventory/low-stock");

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  useEffect(() => {
    list.run({ page, pageSize, search: search || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, search]);

  const columns: DataTableColumn<LowStockRow>[] = [
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

  return (
    <DataTable
      title="Low Stock Report"
      subtitle="Items below their threshold limit."
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
      page={page}
      pageSize={pageSize}
      total={total}
      onPageChange={setPage}
      onPageSizeChange={(size) => {
        setPage(1);
        setPageSize(size);
      }}
      emptyMessage="Nothing below threshold right now."
    />
  );
}
