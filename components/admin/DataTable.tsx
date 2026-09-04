"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { PlusIcon, PencilIcon, TrashIcon } from "../divine/icons";
import DivineListbox from "../divine/DivineListbox";
import DivineStatusSelect from "../divine/DivineStatusSelect";
import { resolveImageUrl } from "../../lib/imageUrl";
import { EmblemLoader } from "../divine/EmblemLoader";

function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[80] bg-navy-950/85 backdrop-blur-sm"
      />
      <div className="pointer-events-none fixed inset-0 z-[81] flex items-center justify-center p-6">
        <motion.div
          key="panel"
          role="dialog"
          aria-modal="true"
          aria-label={alt || "Image preview"}
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.97 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="pointer-events-auto relative max-h-[85vh] max-w-[85vw] overflow-hidden rounded-2xl border border-gold-500/25 bg-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)]"
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg bg-crimson-600 text-white shadow-[0_2px_8px_-2px_rgba(0,0,0,0.45)] transition-colors hover:bg-crimson-500"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
          <img src={src} alt={alt} className="max-h-[85vh] max-w-[85vw] object-contain" />
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}

export function MasterImageCell({
  src,
  alt = "",
  rounded = "lg",
}: {
  src: string | null;
  alt?: string;
  rounded?: "lg" | "full";
}) {
  const url = resolveImageUrl(src);
  const [viewing, setViewing] = useState(false);
  const shape = rounded === "full" ? "rounded-full" : "rounded-lg";

  return (
    <>
      <span className="inline-flex items-center gap-2">
        <span className={`flex h-10 w-10 items-center justify-center overflow-hidden border border-gold-500/20 bg-ivory-100 ${shape}`}>
          {url ? (
            <img src={url} alt={alt} className="h-full w-full object-cover" />
          ) : (
            <span className="text-[10px] text-ink-500">—</span>
          )}
        </span>
        {url && (
          <button
            type="button"
            onClick={() => setViewing(true)}
            className="text-[12.5px] font-medium text-amber-600 underline-offset-2 hover:underline"
          >
            View
          </button>
        )}
      </span>
      {viewing && url && <ImageLightbox src={url} alt={alt} onClose={() => setViewing(false)} />}
    </>
  );
}

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
      className="ml-auto flex items-center gap-2 rounded-md border border-maroon/40 bg-maroon px-4 py-2.5 font-accent text-[13.5px] font-semibold text-white shadow-[0_2px_6px_-1px_rgba(0,0,0,0.15)] transition-[transform,box-shadow,background-color] duration-200 hover:-translate-y-0.5 hover:bg-maroon-hover hover:shadow-[0_10px_24px_-6px_rgba(124,21,39,0.5)] active:translate-y-0 active:shadow-[0_2px_6px_-1px_rgba(0,0,0,0.15)]"
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
        <div className="w-full max-w-xs rounded-md bg-gradient-to-r from-crimson-500 to-flame-500 p-[1.5px] shadow-[0_6px_18px_-10px_rgba(220,38,38,0.45)]">
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-[4px] bg-white px-4 py-2.5 text-[13.5px] text-ink-100 outline-none placeholder:text-ink-500"
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
      <div className="rounded-md bg-gradient-to-r from-crimson-500 to-flame-500 p-[1.5px] shadow-[0_10px_30px_-14px_rgba(220,38,38,0.4)]">
        <div className="overflow-hidden rounded-[4px] bg-navy-900">
          <div className="overflow-x-auto">
            {/* border-collapse is load-bearing, not cosmetic — without it
                the header row's background paints independently inside each
                <th>'s own box (the default border-collapse: separate gives
                every cell its own background layer), so it renders as a
                fragmented, refading-per-column mess instead of one
                continuous band across the row. */}
            <table className="w-full min-w-[640px] border-collapse text-left text-[13.5px]">
              <thead>
                <tr className="border-b border-slate-200 bg-[#7c1527] text-[11px] uppercase tracking-wide text-white">
                  {columns.map((col, i) => (
                    <th key={col.key} className={`px-5 py-3 font-semibold ${i > 0 ? "border-l border-white/50" : ""} ${col.className ?? ""}`}>
                      {col.label}
                    </th>
                  ))}
                  {rowActions && <th className="border-l border-white/50 px-5 py-3 text-right font-semibold">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={columns.length + (rowActions ? 1 : 0)} className="px-5 py-8">
                      <EmblemLoader size="sm" label="Loading…" />
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + (rowActions ? 1 : 0)} className="px-5 py-10 text-center text-ink-500">
                      {emptyMessage}
                    </td>
                  </tr>
                ) : (
                  rows.map((row, rowIdx) => (
                    <tr
                      key={rowKey(row)}
                      className={`border-b border-slate-200 text-ink-100 transition-colors hover:bg-[linear-gradient(to_right,rgba(143,28,48,0.02),rgba(255,157,66,0.02),rgba(255,193,69,0.02))] ${rowIdx % 2 === 1 ? "bg-navy-900/30" : ""}`}
                    >
                      {columns.map((col, colIdx) => (
                        <td key={col.key} className={`px-5 py-3.5 ${colIdx > 0 ? "border-l border-slate-200" : ""} ${col.className ?? ""}`}>
                          {col.render(row)}
                        </td>
                      ))}
                      {rowActions && (
                        <td className="border-l border-slate-200 px-5 py-3.5 text-right">
                          {rowActions(row)}
                        </td>
                      )}
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
                  className="rounded-md bg-maroon px-3.5 py-1.5 font-medium text-white shadow-[0_2px_8px_-3px_rgba(124,21,39,0.5)] transition-[transform,box-shadow,background-color] duration-200 hover:-translate-y-0.5 hover:bg-maroon-hover hover:shadow-[0_6px_16px_-4px_rgba(124,21,39,0.55)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:bg-maroon disabled:hover:shadow-[0_2px_8px_-3px_rgba(124,21,39,0.5)]"
                >
                  Prev
                </button>
                <button
                  onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages}
                  className="rounded-md bg-maroon px-3.5 py-1.5 font-medium text-white shadow-[0_2px_8px_-3px_rgba(124,21,39,0.5)] transition-[transform,box-shadow,background-color] duration-200 hover:-translate-y-0.5 hover:bg-maroon-hover hover:shadow-[0_6px_16px_-4px_rgba(124,21,39,0.55)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:bg-maroon disabled:hover:shadow-[0_2px_8px_-3px_rgba(124,21,39,0.5)]"
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
    <span className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11.5px] font-medium text-emerald-700">
      Active
    </span>
  ) : (
    <span className="inline-flex items-center rounded-md border border-slate-400/30 bg-slate-100 px-2 py-0.5 text-[11.5px] font-medium text-slate-500">
      Inactive
    </span>
  );
}

/** Same Active/Inactive control as the edit drawer, for toggling status from the list. */
export function StatusToggleCell({
  status,
  canEdit,
  disabled,
  onChange,
}: {
  status: number;
  canEdit?: boolean;
  disabled?: boolean;
  onChange?: (status: number) => void | Promise<void>;
}) {
  if (!canEdit || !onChange) return <StatusPill status={status} />;
  return (
    <div className="w-[148px]" onClick={(e) => e.stopPropagation()}>
      <DivineStatusSelect
        compact
        disabled={disabled}
        value={status}
        onChange={(next) => {
          if (next === status) return;
          void onChange(next);
        }}
      />
    </div>
  );
}
