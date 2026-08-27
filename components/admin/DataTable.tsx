"use client";

import type { ReactNode } from "react";
import { PlusIcon, PencilIcon, TrashIcon } from "../divine/icons";
import DivineListbox from "../divine/DivineListbox";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "1", label: "Active" },
  { value: "0", label: "Inactive" },
];

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export type DataTableColumn<T> = {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  className?: string;
};

type DataTableProps<T> = {
  title: string;
  subtitle?: string;
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  /** Omit both to drop the Active/Inactive filter — report-style screens
   *  (Inventory's Available Stock, History, Low Stock) have no status
   *  concept of their own to filter by. */
  statusFilter?: string;
  onStatusFilterChange?: (value: string) => void;
  /** Extra filter control(s) rendered next to search/status — e.g. Available
   *  Stock's "Type: Item/Service" dropdown, which DataTable has no built-in
   *  equivalent for. */
  extraFilters?: ReactNode;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Omit to keep pageSize fixed — every current master screen passes this. */
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  onCreate?: () => void;
  createLabel?: string;
  rowActions?: (row: T) => ReactNode;
  emptyMessage?: string;
};

/**
 * One generic, searchable/filterable/paginated table — every master screen
 * (Roles, Users, and everything from Day 3 onward) renders through this
 * instead of three hand-rolled copies of the same markup.
 */
export default function DataTable<T>({
  title,
  subtitle,
  columns,
  rows,
  rowKey,
  loading,
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  statusFilter,
  onStatusFilterChange,
  extraFilters,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  onCreate,
  createLabel = "Create",
  rowActions,
  emptyMessage = "Nothing here yet.",
}: DataTableProps<T>) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const addButton = onCreate && (
    <button
      onClick={onCreate}
      className="ml-auto flex items-center gap-2 rounded-xl border border-crimson-600/40 bg-gradient-to-r from-crimson-600 to-flame-500 px-4 py-2.5 font-accent text-[13.5px] font-semibold text-white shadow-[0_2px_6px_-1px_rgba(0,0,0,0.15)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-6px_rgba(220,38,38,0.5)] active:translate-y-0 active:shadow-[0_2px_6px_-1px_rgba(0,0,0,0.15)]"
    >
      <PlusIcon />
      {createLabel}
    </button>
  );

  return (
    <div className="space-y-5">
      {title && (
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[28px] font-bold text-ink-100">{title}</h1>
            {subtitle && <p className="mt-1 text-[13px] text-ink-500">{subtitle}</p>}
          </div>
          {addButton}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {/* The gradient border is a two-layer trick (gradient-filled outer
            box, white inner box inset by the border width) — Tailwind has
            no real gradient-border utility, and border-image doesn't
            respect border-radius reliably across browsers. */}
        <div className="w-full max-w-xs rounded-xl bg-gradient-to-r from-crimson-500 to-flame-500 p-[1.5px] shadow-[0_6px_18px_-10px_rgba(220,38,38,0.45)]">
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-[10px] bg-white px-4 py-2.5 text-[13.5px] text-ink-100 outline-none placeholder:text-ink-500"
          />
        </div>
        {onStatusFilterChange && (
          <DivineListbox
            value={statusFilter ?? ""}
            onChange={onStatusFilterChange}
            options={STATUS_OPTIONS}
            className="w-40"
          />
        )}
        {extraFilters}
        {/* When there's no page title (only GL Group's tabbed layout omits
            it — its own <h1> sits above the tabs instead), the button has
            nowhere else to live, so it joins the filter row instead of
            sitting alone above it. */}
        {!title && addButton}
      </div>

      {/* Same gradient-border trick as the filters above, wrapping the
          whole table so the rounded corners actually clip the header's
          gradient row instead of the container's own white background
          showing through the curve (which is what a plain `overflow-x-auto`
          on the rounded box did — it only clips horizontal scroll overflow,
          not content peeking past the border-radius). */}
      <div className="rounded-2xl bg-gradient-to-r from-crimson-500 to-flame-500 p-[1.5px] shadow-[0_10px_30px_-14px_rgba(220,38,38,0.4)]">
        <div className="overflow-hidden rounded-[15px] bg-navy-900">
          <div className="overflow-x-auto">
            {/* border-collapse is load-bearing, not cosmetic — without it
                the header row's gradient background paints independently
                inside each <th>'s own box (the default border-collapse:
                separate gives every cell its own background layer), so it
                renders as a fragmented, refading-per-column mess instead of
                one continuous band across the row. */}
            <table className="w-full min-w-[640px] border-collapse text-left text-[13.5px]">
              <thead>
                <tr className="bg-gradient-to-r from-[#6b1524] via-crimson-600 to-flame-500 text-[11px] uppercase tracking-wide text-white">
                  {columns.map((col) => (
                    <th key={col.key} className={`px-5 py-3 font-semibold ${col.className ?? ""}`}>
                      {col.label}
                    </th>
                  ))}
                  {rowActions && <th className="px-5 py-3 text-right font-semibold">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={columns.length + (rowActions ? 1 : 0)} className="px-5 py-10 text-center text-ink-500">
                      Loading…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + (rowActions ? 1 : 0)} className="px-5 py-10 text-center text-ink-500">
                      {emptyMessage}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr
                      key={rowKey(row)}
                      className="border-b border-gold-500/5 text-ink-100 transition-colors last:border-0 hover:bg-[linear-gradient(to_right,rgba(143,28,48,0.14),rgba(255,157,66,0.14),rgba(255,193,69,0.14))]"
                    >
                      {columns.map((col) => (
                        <td key={col.key} className={`px-5 py-3.5 ${col.className ?? ""}`}>
                          {col.render(row)}
                        </td>
                      ))}
                      {rowActions && <td className="px-5 py-3.5 text-right">{rowActions(row)}</td>}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {(total > 0 || onPageSizeChange) && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-[12.5px] text-ink-500">
          <span>
            Page {page} of {totalPages} &middot; {total} total
          </span>
          <div className="flex flex-wrap items-center gap-3">
            {totalPages > 1 && (
              <div className="flex gap-2">
                <button
                  onClick={() => onPageChange(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  className="rounded-lg bg-gradient-to-r from-crimson-600 to-flame-500 px-3.5 py-1.5 font-medium text-white shadow-[0_2px_8px_-3px_rgba(220,38,38,0.5)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_16px_-4px_rgba(220,38,38,0.55)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-[0_2px_8px_-3px_rgba(220,38,38,0.5)]"
                >
                  Prev
                </button>
                <button
                  onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages}
                  className="rounded-lg bg-gradient-to-r from-crimson-600 to-flame-500 px-3.5 py-1.5 font-medium text-white shadow-[0_2px_8px_-3px_rgba(220,38,38,0.5)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_16px_-4px_rgba(220,38,38,0.55)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-[0_2px_8px_-3px_rgba(220,38,38,0.5)]"
                >
                  Next
                </button>
              </div>
            )}
            {onPageSizeChange && (
              <div className="flex items-center gap-1.5">
                <span>Rows</span>
                <DivineListbox
                  value={String(pageSize)}
                  onChange={(v) => onPageSizeChange(Number(v))}
                  options={pageSizeOptions.map((n) => ({ value: String(n), label: `${n} / page` }))}
                  className="w-36"
                  clearable={false}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Vibrant, icon-only row-action buttons — used in place of plain "Edit" /
 * "Delete" text links across every master's table (see rowActions on
 * DataTable). No badge/background — just a bold, saturated glyph that lifts
 * and deepens in color on hover: blue for edit, red for delete.
 */
export function EditIconButton({ onClick, label = "Edit" }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center text-blue-600 transition-transform duration-200 hover:scale-110 hover:text-blue-700 active:scale-95"
    >
      <PencilIcon className="h-[19px] w-[19px]" />
    </button>
  );
}

export function DeleteIconButton({ onClick, label = "Delete" }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center text-red-600 transition-transform duration-200 hover:scale-110 hover:text-red-700 active:scale-95"
    >
      <TrashIcon className="h-[19px] w-[19px]" />
    </button>
  );
}

export function StatusPill({ status }: { status: number }) {
  return status === 1 ? (
    <span className="rounded-full bg-gradient-to-b from-emerald-400 to-emerald-600 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-white shadow-[0_1px_4px_-1px_rgba(16,185,129,0.5)]">
      Active
    </span>
  ) : (
    <span className="rounded-full bg-gradient-to-b from-slate-400 to-slate-500 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-white shadow-[0_1px_4px_-1px_rgba(100,116,139,0.4)]">
      Inactive
    </span>
  );
}
