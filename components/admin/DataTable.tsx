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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        {title && (
          <div>
            <h1 className="font-display text-[28px] font-bold text-ink-100">{title}</h1>
            {subtitle && <p className="mt-1 text-[13px] text-ink-500">{subtitle}</p>}
          </div>
        )}
        {onCreate && (
          <button
            onClick={onCreate}
            className="ml-auto flex items-center gap-2 rounded-xl border border-gold-600/25 bg-gradient-to-b from-gold-300 via-gold-500 to-gold-600 px-4 py-2.5 font-accent text-[13.5px] font-semibold text-navy-950 shadow-[0_2px_6px_-1px_rgba(0,0,0,0.08)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-6px_rgba(184,137,42,0.55)] active:translate-y-0 active:shadow-[0_2px_6px_-1px_rgba(0,0,0,0.08)]"
          >
            <PlusIcon />
            {createLabel}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full max-w-xs rounded-xl border border-gold-500/20 bg-white px-4 py-2.5 text-[13.5px] text-ink-100 outline-none placeholder:text-ink-500 focus:border-gold-400/60"
        />
        {onStatusFilterChange && (
          <DivineListbox
            value={statusFilter ?? ""}
            onChange={onStatusFilterChange}
            options={STATUS_OPTIONS}
            className="w-40"
          />
        )}
        {extraFilters}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gold-500/15 bg-navy-900">
        <table className="w-full min-w-[640px] text-left text-[13.5px]">
          <thead>
            <tr className="border-b border-gold-500/15 bg-navy-600 text-[11px] uppercase tracking-wide text-ink-100">
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
                <tr key={rowKey(row)} className="border-b border-gold-500/5 text-ink-100 last:border-0 hover:bg-ivory-100">
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
                  className="rounded-lg border border-gold-500/20 px-3 py-1.5 disabled:opacity-40"
                >
                  Prev
                </button>
                <button
                  onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages}
                  className="rounded-lg border border-gold-500/20 px-3 py-1.5 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
            {onPageSizeChange && (
              <label className="flex items-center gap-1.5">
                <span>Rows</span>
                <select
                  value={pageSize}
                  onChange={(e) => onPageSizeChange(Number(e.target.value))}
                  className="rounded-lg border border-gold-500/20 bg-white px-2 py-1.5 text-[12.5px] text-ink-100 outline-none focus:border-gold-400/60"
                >
                  {pageSizeOptions.map((n) => (
                    <option key={n} value={n}>
                      {n} / page
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Vibrant, 3D-styled row-action buttons — used in place of plain "Edit" /
 * "Delete" text links across every master's table (see rowActions on
 * DataTable). Same gradient + lift-on-hover language as the "Create" button
 * above, just circular and color-coded: blue for edit, red for delete.
 */
export function EditIconButton({ onClick, label = "Edit" }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-blue-700/20 bg-gradient-to-b from-blue-400 via-blue-500 to-blue-600 text-white shadow-[0_3px_8px_-2px_rgba(37,99,235,0.55)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_20px_-5px_rgba(37,99,235,0.65)] active:translate-y-0 active:shadow-[0_3px_8px_-2px_rgba(37,99,235,0.55)]"
    >
      <PencilIcon />
    </button>
  );
}

export function DeleteIconButton({ onClick, label = "Delete" }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-red-700/20 bg-gradient-to-b from-red-400 via-red-500 to-red-600 text-white shadow-[0_3px_8px_-2px_rgba(220,38,38,0.55)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_20px_-5px_rgba(220,38,38,0.65)] active:translate-y-0 active:shadow-[0_3px_8px_-2px_rgba(220,38,38,0.55)]"
    >
      <TrashIcon />
    </button>
  );
}

export function StatusPill({ status }: { status: number }) {
  return status === 1 ? (
    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] tracking-wide text-emerald-400">
      Active
    </span>
  ) : (
    <span className="rounded-full border border-ink-500/30 bg-ink-500/10 px-2.5 py-1 text-[11px] tracking-wide text-ink-500">
      Inactive
    </span>
  );
}
