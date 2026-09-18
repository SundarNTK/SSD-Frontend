"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DivineButton from "../divine/DivineButton";
import DivineDatePicker from "../divine/DivineDatePicker";
import DivineListbox, { type ListboxOption } from "../divine/DivineListbox";
import DivineMultiSelect from "../divine/DivineMultiSelect";
import DivineInput from "../divine/DivineInput";
import ConfirmDialog from "./ConfirmDialog";
import FormDrawer from "./FormDrawer";
import { EmblemLoader } from "../divine/EmblemLoader";
import { CheckIcon, ChartIcon, SaveIcon, TrashIcon, PencilIcon, DownloadIcon, PlusIcon, CloseIcon } from "../divine/icons";
import { api, unwrap, extractErrorMessage, type ApiEnvelope } from "../../lib/api";
import { downloadFile } from "../../lib/downloadFile";
import { toast } from "../../lib/toastStore";
import { MODULES, usePermissions } from "../../lib/permissions";

type FieldType = "string" | "number" | "date" | "boolean";
type ReportField = { key: string; label: string; type: FieldType; options: string[] | null };
type ReportSource = {
  key: string;
  label: string;
  description: string;
  defaultSort: { field: string; dir: "asc" | "desc" };
  fields: ReportField[];
};
type ReportColumn = { key: string; label: string; type: FieldType };
type ReportRow = Record<string, unknown>;

type Condition = { id: string; field: string; operator: string; value: string; valueTo: string; valueList: string[]; logic: "AND" | "OR" };
type SortRow = { id: string; field: string; dir: "asc" | "desc" };
type AggFn = "sum" | "count" | "avg" | "min" | "max";
type AggRow = { id: string; field: string; fn: AggFn };

type RunPayload = {
  sourceKey: string;
  fields: string[];
  conditions: { field: string; operator: string; value?: string | number | boolean | string[]; valueTo?: string | number; logic: "AND" | "OR" }[];
  grouping: { groupBy: string; aggregations: { field?: string; fn: AggFn }[] } | null;
  sort: { field: string; dir: "asc" | "desc" }[];
  page: number;
  pageSize: number;
};

type SavedReport = {
  _id: string;
  name: string;
  sourceKey: string;
  fields: string[];
  conditions: Condition[];
  grouping: { groupBy: string; aggregations: { field: string | null; fn: AggFn }[] } | null;
  sort: { field: string; dir: "asc" | "desc" }[];
  createdAt?: string;
  updatedAt?: string;
};

const PAGE_SIZE = 25;
let nextId = 1;
const newId = () => `row${nextId++}`;

const OPERATORS_BY_TYPE: Record<FieldType, string[]> = {
  string: ["equals", "notEquals", "contains", "startsWith", "endsWith", "isEmpty", "isNotEmpty"],
  number: ["equals", "notEquals", "gt", "lt", "gte", "lte", "between"],
  date: ["equals", "before", "after", "between", "today", "yesterday", "thisWeek", "thisMonth", "lastMonth"],
  boolean: ["equals"],
};
const OPTIONS_FIELD_OPERATORS = ["equals", "notEquals", "in", "notIn"];
const OPERATOR_LABELS: Record<string, string> = {
  equals: "Equals",
  notEquals: "Not Equals",
  contains: "Contains",
  startsWith: "Starts With",
  endsWith: "Ends With",
  isEmpty: "Is Empty",
  isNotEmpty: "Is Not Empty",
  gt: "Greater Than",
  lt: "Less Than",
  gte: "Greater Than or Equal",
  lte: "Less Than or Equal",
  between: "Between",
  before: "Before",
  after: "After",
  today: "Today",
  yesterday: "Yesterday",
  thisWeek: "This Week",
  thisMonth: "This Month",
  lastMonth: "Last Month",
  in: "In",
  notIn: "Not In",
};
const NO_VALUE_OPERATORS = new Set(["isEmpty", "isNotEmpty", "today", "yesterday", "thisWeek", "thisMonth", "lastMonth"]);
const LIST_VALUE_OPERATORS = new Set(["in", "notIn"]);
const TWO_VALUE_OPERATORS = new Set(["between"]);
const AGG_FN_LABELS: Record<AggFn, string> = { sum: "Sum", count: "Count", avg: "Average", min: "Min", max: "Max" };

function operatorsForField(field: ReportField | undefined): string[] {
  if (!field) return [];
  return field.options ? OPTIONS_FIELD_OPERATORS : OPERATORS_BY_TYPE[field.type];
}

/** DD/MM/YYYY, fixed — not `toLocaleDateString()`, whose format (and whether it's D/M/Y or M/D/Y) depends on the visitor's own browser locale. Report data (event dates, payment dates, DOB…) is a plain calendar date with no meaningful time-of-day, so this reads it as stored, not shifted through any timezone conversion. */
function formatDMY(value: unknown): string {
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

// Unlike report data (a calendar date with no real time-of-day — see
// formatDMY above), createdAt/updatedAt are genuine moments in time, so
// these ARE shown in the temple's own timezone (see lib/datetime.ts's
// TEMPLE_TIME_ZONE comment on why that's always explicit, never the
// browser's local zone or a manual UTC offset).
const AUDIT_DATE_FORMATTER = new Intl.DateTimeFormat("en-SG", {
  timeZone: "Asia/Singapore",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const AUDIT_TIME_FORMATTER = new Intl.DateTimeFormat("en-SG", {
  timeZone: "Asia/Singapore",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

/** DD/MM/YYYY, HH:MM AM/PM — always in the temple's own (Singapore) time, regardless of the viewer's own timezone, for a genuine timestamp like createdAt/updatedAt. */
function formatDMYTime(value: unknown): string {
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return "—";
  return `${AUDIT_DATE_FORMATTER.format(d)}, ${AUDIT_TIME_FORMATTER.format(d).toUpperCase()}`;
}

function formatCell(value: unknown, type: FieldType): string {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "date") return formatDMY(value);
  if (type === "boolean") return value ? "Yes" : "No";
  if (type === "number") return typeof value === "number" ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(value);
  return String(value);
}

/**
 * The Report Builder — pick a report type (source), choose and arrange
 * fields, filter, sort, optionally group/aggregate, run it, and optionally
 * save the whole configuration to re-run later. See SSD-Backend's
 * common/reports/{report-sources,report-filters,report-runner}.js for how
 * a run actually executes — every field/operator/aggregation here maps
 * directly onto something declared there; the backend re-validates all of
 * it and never accepts a raw query from this screen.
 */
export default function ReportBuilderPage() {
  const { can } = usePermissions();
  const canSave = can(MODULES.reports, "fullAccess");

  const [sources, setSources] = useState<ReportSource[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [sourceKey, setSourceKey] = useState<string | null>(null);

  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [fieldSearch, setFieldSearch] = useState("");
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [sortRows, setSortRows] = useState<SortRow[]>([]);
  const [groupingEnabled, setGroupingEnabled] = useState(false);
  const [groupBy, setGroupBy] = useState("");
  const [aggRows, setAggRows] = useState<AggRow[]>([]);

  const [rows, setRows] = useState<ReportRow[]>([]);
  const [columns, setColumns] = useState<ReportColumn[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [hasRun, setHasRun] = useState(false);

  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null);
  const [saveDrawerOpen, setSaveDrawerOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deletingReport, setDeletingReport] = useState<SavedReport | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const dragIndexRef = useRef<number | null>(null);

  const source = useMemo(() => sources.find((s) => s.key === sourceKey) ?? null, [sources, sourceKey]);
  const fieldByKey = useMemo(() => new Map((source?.fields ?? []).map((f) => [f.key, f])), [source]);
  const numericFields = useMemo(() => (source?.fields ?? []).filter((f) => f.type === "number"), [source]);

  useEffect(() => {
    api
      .get<ApiEnvelope<{ sources: ReportSource[] }>>("/reports/sources")
      .then((res) => setSources(unwrap(res).sources))
      .catch((err) => toast.error(extractErrorMessage(err)))
      .finally(() => setSourcesLoading(false));
  }, []);

  function loadSavedReports() {
    setSavedLoading(true);
    api
      .get<ApiEnvelope<{ items: SavedReport[] }>>("/reports/definitions")
      .then((res) => setSavedReports(unwrap(res).items))
      .catch((err) => toast.error(extractErrorMessage(err)))
      .finally(() => setSavedLoading(false));
  }
  useEffect(() => {
    api
      .get<ApiEnvelope<{ items: SavedReport[] }>>("/reports/definitions")
      .then((res) => setSavedReports(unwrap(res).items))
      .catch((err) => toast.error(extractErrorMessage(err)))
      .finally(() => setSavedLoading(false));
  }, []);

  function resetBuilder(next: ReportSource | null) {
    setSelectedFields([]);
    setFieldSearch("");
    setConditions([]);
    setSortRows(next ? [{ id: newId(), field: next.defaultSort.field, dir: next.defaultSort.dir }] : []);
    setGroupingEnabled(false);
    setGroupBy("");
    setAggRows([]);
    setActiveSavedId(null);
    setHasRun(false);
    setRunError(null);
    setRows([]);
    setColumns([]);
    setTotal(0);
    setPage(1);
  }

  function chooseSource(nextKey: string) {
    const next = sources.find((s) => s.key === nextKey) ?? null;
    setSourceKey(nextKey);
    resetBuilder(next);
  }

  function toggleField(key: string) {
    setSelectedFields((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }
  function removeSelectedField(key: string) {
    setSelectedFields((prev) => prev.filter((k) => k !== key));
  }
  function reorderSelectedFields(fromIndex: number, toIndex: number) {
    setSelectedFields((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  // ---- Filter conditions ----
  function addCondition() {
    const firstField = source?.fields[0];
    if (!firstField) return;
    setConditions((prev) => [
      ...prev,
      { id: newId(), field: firstField.key, operator: operatorsForField(firstField)[0], value: "", valueTo: "", valueList: [], logic: "AND" },
    ]);
  }
  function updateCondition(id: string, patch: Partial<Condition>) {
    setConditions((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }
  function removeCondition(id: string) {
    setConditions((prev) => prev.filter((c) => c.id !== id));
  }

  // ---- Sort ----
  function addSortRow() {
    const firstField = source?.fields[0];
    if (!firstField) return;
    setSortRows((prev) => [...prev, { id: newId(), field: firstField.key, dir: "asc" }]);
  }
  function updateSortRow(id: string, patch: Partial<SortRow>) {
    setSortRows((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  function removeSortRow(id: string) {
    setSortRows((prev) => prev.filter((s) => s.id !== id));
  }

  // ---- Grouping ----
  function addAggRow() {
    const firstNumeric = numericFields[0];
    setAggRows((prev) => [...prev, { id: newId(), field: firstNumeric?.key ?? "", fn: firstNumeric ? "sum" : "count" }]);
  }
  function updateAggRow(id: string, patch: Partial<AggRow>) {
    setAggRows((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }
  function removeAggRow(id: string) {
    setAggRows((prev) => prev.filter((a) => a.id !== id));
  }

  function buildPayload(targetPage: number): RunPayload {
    return {
      sourceKey: source!.key,
      fields: groupingEnabled ? [] : selectedFields,
      conditions: conditions
        .filter((c) => c.field && c.operator)
        .map((c) => {
          const field = fieldByKey.get(c.field);
          const entry: RunPayload["conditions"][number] = { field: c.field, operator: c.operator, logic: c.logic };
          if (LIST_VALUE_OPERATORS.has(c.operator)) {
            entry.value = c.valueList;
          } else if (!NO_VALUE_OPERATORS.has(c.operator)) {
            entry.value = field?.type === "boolean" ? c.value === "true" : c.value;
            if (TWO_VALUE_OPERATORS.has(c.operator)) entry.valueTo = c.valueTo;
          }
          return entry;
        }),
      grouping:
        groupingEnabled && groupBy && aggRows.length > 0
          ? { groupBy, aggregations: aggRows.map((a) => ({ field: a.fn === "count" ? undefined : a.field, fn: a.fn })) }
          : null,
      sort: sortRows.filter((s) => s.field).map((s) => ({ field: s.field, dir: s.dir })),
      page: targetPage,
      pageSize: PAGE_SIZE,
    };
  }

  async function runReport(targetPage = 1) {
    if (!source) return;
    if (!groupingEnabled && selectedFields.length === 0) {
      setRunError("Select at least one field to run this report.");
      return;
    }
    if (groupingEnabled && (!groupBy || aggRows.length === 0)) {
      setRunError("Choose a Group By field and at least one aggregation.");
      return;
    }
    setRunning(true);
    setRunError(null);
    try {
      const res = await api.post<ApiEnvelope<{ rows: ReportRow[]; total: number; page: number; columns: ReportColumn[] }>>(
        "/reports/run",
        buildPayload(targetPage)
      );
      const data = unwrap(res);
      setRows(data.rows);
      setColumns(data.columns);
      setTotal(data.total);
      setPage(data.page);
      setHasRun(true);
    } catch (err) {
      setRunError(extractErrorMessage(err));
    } finally {
      setRunning(false);
    }
  }

  async function loadAndRunSaved(saved: SavedReport) {
    const matchingSource = sources.find((s) => s.key === saved.sourceKey) ?? null;
    setSourceKey(saved.sourceKey);
    setSelectedFields(saved.fields);
    setFieldSearch("");
    setConditions(
      saved.conditions.map((c) => ({
        id: newId(),
        field: c.field,
        operator: c.operator,
        value: Array.isArray(c.value) ? "" : String(c.value ?? ""),
        valueTo: String(c.valueTo ?? ""),
        valueList: Array.isArray(c.value) ? (c.value as string[]) : [],
        logic: c.logic ?? "AND",
      }))
    );
    setSortRows(
      saved.sort.length
        ? saved.sort.map((s) => ({ id: newId(), field: s.field, dir: s.dir }))
        : matchingSource
          ? [{ id: newId(), field: matchingSource.defaultSort.field, dir: matchingSource.defaultSort.dir }]
          : []
    );
    setGroupingEnabled(Boolean(saved.grouping));
    setGroupBy(saved.grouping?.groupBy ?? "");
    setAggRows((saved.grouping?.aggregations ?? []).map((a) => ({ id: newId(), field: a.field ?? "", fn: a.fn })));
    setActiveSavedId(saved._id);
    setPage(1);
    setRunError(null);

    setRunning(true);
    try {
      const res = await api.post<ApiEnvelope<{ rows: ReportRow[]; total: number; page: number; columns: ReportColumn[] }>>(
        `/reports/definitions/${saved._id}/run`,
        { page: 1, pageSize: PAGE_SIZE }
      );
      const data = unwrap(res);
      setRows(data.rows);
      setColumns(data.columns);
      setTotal(data.total);
      setPage(data.page);
      setHasRun(true);
    } catch (err) {
      setRunError(extractErrorMessage(err));
    } finally {
      setRunning(false);
    }
  }

  // Opening Save while a saved report is loaded (activeSavedId set) offers
  // to UPDATE that same report — pre-filling its current name — rather
  // than always creating a new one. `submitSave`'s own "Save as New"
  // button covers the case where the admin wants a separate copy instead.
  function openSaveDrawer() {
    const editing = savedReports.find((r) => r._id === activeSavedId);
    setSaveName(editing?.name ?? "");
    setSaveError(null);
    setSaveDrawerOpen(true);
  }

  async function submitSave(forceNew = false) {
    if (!source) return;
    if (!saveName.trim()) {
      setSaveError("Give this report a name.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const payload = buildPayload(1);
      const body = {
        name: saveName.trim(),
        sourceKey: payload.sourceKey,
        fields: payload.fields,
        conditions: payload.conditions,
        grouping: payload.grouping,
        sort: payload.sort,
      };
      if (activeSavedId && !forceNew) {
        await api.put(`/reports/definitions/${activeSavedId}`, body);
        toast.updated("Report updated successfully.");
      } else {
        const res = await api.post<ApiEnvelope<SavedReport>>("/reports/definitions", body);
        setActiveSavedId(unwrap(res)._id);
        toast.created("Report saved successfully.");
      }
      setSaveDrawerOpen(false);
      loadSavedReports();
    } catch (err) {
      setSaveError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteSaved() {
    if (!deletingReport) return;
    setDeleting(true);
    try {
      await api.delete(`/reports/definitions/${deletingReport._id}`);
      toast.deleted("Report deleted successfully.");
      setDeletingReport(null);
      if (activeSavedId === deletingReport._id) setActiveSavedId(null);
      loadSavedReports();
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  async function handleExport() {
    if (!source) return;
    setExporting(true);
    try {
      const payload = buildPayload(1);
      const config = JSON.stringify({
        sourceKey: payload.sourceKey,
        fields: payload.fields,
        conditions: payload.conditions,
        grouping: payload.grouping,
        sort: payload.sort,
      });
      const params = new URLSearchParams({ config });
      await downloadFile(api, `/reports/export?${params.toString()}`, `${source.key}-report.xlsx`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not export the report.");
    } finally {
      setExporting(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const visibleFields = useMemo(() => {
    if (!source) return [];
    const term = fieldSearch.trim().toLowerCase();
    return term ? source.fields.filter((f) => f.label.toLowerCase().includes(term)) : source.fields;
  }, [source, fieldSearch]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[28px] font-bold text-ink-100">Custom Reports</h1>
        <p className="mt-1 text-[13px] text-ink-500">
          Pick a report type, choose and arrange fields, filter, sort, optionally group, run — and save it to run
          again later.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        {/* ---- Saved reports rail ---- */}
        {/* Sticky at the lg breakpoint (where the two-column layout is
            actually active) so this short panel travels down alongside
            the builder's much taller right column instead of scrolling
            out of view and leaving a tall stretch of bare page beside it. */}
        <div className="min-w-0 space-y-3 lg:sticky lg:top-4 lg:self-start">
          <Panel title={`My Reports${savedReports.length ? ` (${savedReports.length})` : ""}`}>
            {savedLoading ? (
              <EmblemLoader size="sm" />
            ) : savedReports.length === 0 ? (
              <p className="text-[12.5px] text-ink-500">No saved reports yet — build one and save it.</p>
            ) : (
              <ul className="max-h-[65vh] space-y-1.5 overflow-y-auto pr-1">
                {savedReports.map((r) => {
                  const reportSource = sources.find((s) => s.key === r.sourceKey);
                  const detail = [
                    reportSource?.label ?? r.sourceKey,
                    r.grouping ? "grouped" : `${r.fields.length} field${r.fields.length === 1 ? "" : "s"}`,
                    r.conditions.length ? `${r.conditions.length} filter${r.conditions.length === 1 ? "" : "s"}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <li
                      key={r._id}
                      className={`group flex items-start justify-between gap-2 rounded-lg border px-2.5 py-2 text-[13px] transition-colors ${
                        activeSavedId === r._id ? "border-maroon/40 bg-[#faf6f1]" : "border-transparent hover:border-maroon/20 hover:bg-[#faf6f1]"
                      }`}
                    >
                      <button type="button" onClick={() => void loadAndRunSaved(r)} className="min-w-0 flex-1 text-left">
                        <span className="block truncate font-medium text-ink-100">{r.name}</span>
                        <span className="mt-0.5 block truncate text-[11.5px] text-ink-500">{detail}</span>
                        {r.createdAt && (
                          <span className="mt-0.5 block text-[10.5px] text-ink-400">Created {formatDMYTime(r.createdAt)}</span>
                        )}
                        {r.updatedAt && (
                          <span className="block text-[10.5px] text-ink-400">Updated {formatDMYTime(r.updatedAt)}</span>
                        )}
                      </button>
                      {canSave && (
                        <div className="mt-0.5 flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void loadAndRunSaved(r)}
                            aria-label={`Edit ${r.name}`}
                            title="Load into the builder to edit and update"
                            className="text-blue-600 opacity-60 transition-opacity hover:opacity-100"
                          >
                            <PencilIcon className="h-[15px] w-[15px]" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingReport(r)}
                            aria-label={`Delete ${r.name}`}
                            className="text-red-500 opacity-60 transition-opacity hover:opacity-100"
                          >
                            <TrashIcon className="h-[15px] w-[15px]" />
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>

        {/* ---- Builder ---- */}
        {/* `min-w-0` is load-bearing, not decorative: a CSS Grid item's
            default min-width is `auto` (its content's own min-content
            size), which can make the item refuse to shrink to its
            assigned `1fr` track — and this page's shell wraps <main> in
            `overflow-x-hidden` (see app/admin/(dashboard)/layout.tsx),
            so an item that refuses to shrink doesn't scroll into view,
            it gets silently clipped. `overflow-x-auto` is the belt on
            top of that suspender — if anything inside is STILL wider
            than the shrunk column on a narrow screen, it scrolls locally
            within this column instead of vanishing off-page. */}
        <div className="min-w-0 space-y-5 overflow-x-auto">
          <Panel title="1. Report Type">
            {sourcesLoading ? (
              <EmblemLoader size="sm" />
            ) : (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {sources.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => chooseSource(s.key)}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      sourceKey === s.key
                        ? "border-maroon bg-maroon text-white shadow-[0_8px_18px_-8px_rgba(124,21,39,0.6)]"
                        : "border-[#f0b4a0] bg-white text-ink-100 hover:border-maroon/50 hover:bg-[#faf6f1]"
                    }`}
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      <ChartIcon className="h-4 w-4 shrink-0" />
                      {s.label}
                    </span>
                    <span className={`mt-1 block text-[12px] ${sourceKey === s.key ? "text-white/85" : "text-ink-500"}`}>{s.description}</span>
                  </button>
                ))}
              </div>
            )}
          </Panel>

          {source && (
            <>
              {/* Step 2: select + arrange fields (hidden while grouping is on — grouped output is Group By + aggregations only) */}
              {!groupingEnabled && (
                <Panel title="2. Select &amp; Arrange Fields">
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-500">Available Fields</span>
                        <div className="flex gap-2 text-[12px]">
                          <button type="button" className="font-medium text-amber-700 hover:underline" onClick={() => setSelectedFields(source.fields.map((f) => f.key))}>
                            Select all
                          </button>
                          <button type="button" className="font-medium text-ink-500 hover:underline" onClick={() => setSelectedFields([])}>
                            Clear
                          </button>
                        </div>
                      </div>
                      <input
                        value={fieldSearch}
                        onChange={(e) => setFieldSearch(e.target.value)}
                        placeholder="Search fields…"
                        className="mb-2 w-full rounded-md border border-slate-200 px-3 py-1.5 text-[13px] outline-none focus:border-maroon/40"
                      />
                      <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                        {visibleFields.map((f) => {
                          const checked = selectedFields.includes(f.key);
                          return (
                            <button
                              key={f.key}
                              type="button"
                              onClick={() => toggleField(f.key)}
                              className={`flex w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-[13px] transition-colors ${
                                checked ? "border-emerald-500/50 bg-emerald-500/10 text-ink-100" : "border-transparent bg-white text-ink-500 hover:border-slate-200"
                              }`}
                            >
                              <span
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-md border ${
                                  checked ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white text-transparent"
                                }`}
                              >
                                <CheckIcon className="h-3 w-3 text-current" />
                              </span>
                              {f.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <span className="mb-2 block text-[12px] font-semibold uppercase tracking-wide text-ink-500">
                        Selected Fields — drag to reorder ({selectedFields.length})
                      </span>
                      <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                        {selectedFields.length === 0 && <p className="px-2 py-4 text-center text-[12.5px] text-ink-500">No fields selected yet.</p>}
                        {selectedFields.map((key, index) => (
                          <div
                            key={key}
                            draggable
                            onDragStart={() => {
                              dragIndexRef.current = index;
                            }}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              if (dragIndexRef.current !== null && dragIndexRef.current !== index) {
                                reorderSelectedFields(dragIndexRef.current, index);
                              }
                              dragIndexRef.current = null;
                            }}
                            className="flex cursor-grab items-center gap-2 rounded-lg border border-[#f0b4a0] bg-white px-3 py-1.5 text-[13px] text-ink-100 active:cursor-grabbing"
                          >
                            <span aria-hidden className="text-ink-400">☰</span>
                            <span className="min-w-0 flex-1 truncate">{fieldByKey.get(key)?.label ?? key}</span>
                            <button type="button" onClick={() => removeSelectedField(key)} aria-label={`Remove ${key}`} className="text-red-500 hover:text-red-600">
                              <CloseIcon className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </Panel>
              )}

              {/* Step 3: filters */}
              <Panel
                title="3. Filters"
                action={
                  <button type="button" onClick={addCondition} className="flex items-center gap-1 text-[12px] font-semibold text-amber-700 hover:underline">
                    <PlusIcon /> Add Filter
                  </button>
                }
              >
                {conditions.length === 0 ? (
                  <p className="text-[12.5px] text-ink-500">No filters — every record will be included.</p>
                ) : (
                  <div className="space-y-2">
                    {conditions.map((condition, index) => (
                      <div key={condition.id}>
                        <FilterConditionRow
                          condition={condition}
                          fields={source.fields}
                          onChange={(patch) => updateCondition(condition.id, patch)}
                          onRemove={() => removeCondition(condition.id)}
                        />
                        {index < conditions.length - 1 && (
                          <div className="my-1.5 flex justify-start pl-1">
                            <button
                              type="button"
                              onClick={() => updateCondition(condition.id, { logic: condition.logic === "AND" ? "OR" : "AND" })}
                              className="rounded-full border border-maroon/30 bg-[#faf6f1] px-3 py-0.5 text-[11px] font-bold uppercase tracking-wide text-maroon hover:bg-white"
                            >
                              {condition.logic}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              {/* Step 4: sort */}
              <Panel
                title="4. Sort"
                action={
                  <button type="button" onClick={addSortRow} className="flex items-center gap-1 text-[12px] font-semibold text-amber-700 hover:underline">
                    <PlusIcon /> Add Sort
                  </button>
                }
              >
                {sortRows.length === 0 ? (
                  <p className="text-[12.5px] text-ink-500">No sort applied.</p>
                ) : (
                  <div className="space-y-2">
                    {sortRows.map((s, i) => (
                      <div key={s.id} className="flex flex-wrap items-center gap-2">
                        <span className="w-5 text-[12px] text-ink-500">{i + 1}.</span>
                        <DivineListbox
                          value={s.field}
                          onChange={(v) => updateSortRow(s.id, { field: v })}
                          options={(groupingEnabled ? groupableSortOptions(groupBy, aggRows, source) : source.fields.map((f) => ({ value: f.key, label: f.label })))}
                          className="w-56"
                        />
                        <DivineListbox
                          value={s.dir}
                          onChange={(v) => updateSortRow(s.id, { dir: v as "asc" | "desc" })}
                          options={[
                            { value: "asc", label: "Ascending" },
                            { value: "desc", label: "Descending" },
                          ]}
                          className="w-36"
                        />
                        <button type="button" onClick={() => removeSortRow(s.id)} className="text-red-500 hover:text-red-600">
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              {/* Step 5: grouping */}
              <Panel
                title="5. Grouping (optional)"
                action={
                  <label className="flex items-center gap-2 text-[12px] font-medium text-ink-500">
                    <input
                      type="checkbox"
                      checked={groupingEnabled}
                      onChange={(e) => {
                        setGroupingEnabled(e.target.checked);
                        if (e.target.checked && aggRows.length === 0) addAggRow();
                      }}
                    />
                    Enable grouping
                  </label>
                }
              >
                {!groupingEnabled ? (
                  <p className="text-[12.5px] text-ink-500">Off — the report shows one row per record.</p>
                ) : (
                  <div className="space-y-3">
                    <DivineListbox
                      label="Group By"
                      value={groupBy}
                      onChange={setGroupBy}
                      options={source.fields.map((f) => ({ value: f.key, label: f.label }))}
                      placeholder="Choose a field…"
                    />
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-500">Aggregations</span>
                        <button type="button" onClick={addAggRow} className="flex items-center gap-1 text-[12px] font-semibold text-amber-700 hover:underline">
                          <PlusIcon /> Add Aggregation
                        </button>
                      </div>
                      {aggRows.map((a) => {
                        const isCount = a.fn === "count";
                        return (
                          <div key={a.id} className="flex flex-wrap items-center gap-2">
                            {!isCount && (
                              <DivineListbox
                                value={a.field}
                                onChange={(v) => updateAggRow(a.id, { field: v })}
                                options={numericFields.map((f) => ({ value: f.key, label: f.label }))}
                                placeholder="Field…"
                                className="w-52"
                              />
                            )}
                            <DivineListbox
                              value={a.fn}
                              onChange={(v) => updateAggRow(a.id, { fn: v as AggFn, field: v === "count" ? "" : a.field || numericFields[0]?.key || "" })}
                              options={(["sum", "count", "avg", "min", "max"] as AggFn[]).map((fn) => ({ value: fn, label: AGG_FN_LABELS[fn] }))}
                              className="w-40"
                            />
                            {isCount && <span className="text-[12.5px] text-ink-500">records in each group</span>}
                            <button type="button" onClick={() => removeAggRow(a.id)} className="text-red-500 hover:text-red-600">
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </Panel>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-3">
                <DivineButton variant="flame" fullWidth={false} loading={running} onClick={() => void runReport(1)}>
                  Run Report
                </DivineButton>
                {canSave && (
                  <DivineButton variant="ghost" fullWidth={false} onClick={openSaveDrawer}>
                    <SaveIcon className="h-4 w-4" /> {activeSavedId ? "Update Report" : "Save Report"}
                  </DivineButton>
                )}
                <DivineButton variant="leaf" fullWidth={false} loading={exporting} disabled={!hasRun || total === 0} onClick={() => void handleExport()}>
                  <DownloadIcon className="h-4 w-4" /> Export
                </DivineButton>
                {runError && <span className="text-[12.5px] text-crimson-500">{runError}</span>}
              </div>

              {/* Results */}
              {hasRun && (
                <div className="space-y-3">
                  <div className="rounded-md bg-gradient-to-r from-crimson-500 to-flame-500 p-[1.5px] shadow-[0_10px_30px_-14px_rgba(220,38,38,0.4)]">
                    <div className="overflow-hidden rounded-[4px] bg-navy-900">
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
                          <thead>
                            <tr className="border-b border-slate-200 bg-[#7c1527] text-[11px] uppercase tracking-wide text-white">
                              {columns.map((c, i) => (
                                <th key={c.key} className={`px-4 py-3 font-semibold ${i > 0 ? "border-l border-white/50" : ""}`}>
                                  {c.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {running ? (
                              <tr>
                                <td colSpan={columns.length} className="px-4 py-8">
                                  <EmblemLoader size="sm" label="Running report…" />
                                </td>
                              </tr>
                            ) : rows.length === 0 ? (
                              <tr>
                                <td colSpan={columns.length} className="px-4 py-10 text-center text-ink-500">
                                  No records match these filters.
                                </td>
                              </tr>
                            ) : (
                              rows.map((row, idx) => (
                                <tr key={idx} className={`border-b border-slate-200 text-ink-100 ${idx % 2 === 1 ? "bg-navy-900/30" : ""}`}>
                                  {columns.map((c, ci) => (
                                    <td key={c.key} className={`px-4 py-2.5 ${ci > 0 ? "border-l border-slate-200" : ""} ${c.type === "number" ? "tabular-nums" : ""}`}>
                                      {formatCell(row[c.key], c.type)}
                                    </td>
                                  ))}
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 text-[12.5px] text-ink-500">
                    <span>
                      Page {page} of {totalPages} &middot; {total.toLocaleString()} total
                    </span>
                    {totalPages > 1 && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => void runReport(Math.max(1, page - 1))}
                          disabled={page <= 1 || running}
                          className="rounded-md bg-maroon px-3.5 py-1.5 font-medium text-white shadow-[0_2px_8px_-3px_rgba(124,21,39,0.5)] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Prev
                        </button>
                        <button
                          onClick={() => void runReport(Math.min(totalPages, page + 1))}
                          disabled={page >= totalPages || running}
                          className="rounded-md bg-maroon px-3.5 py-1.5 font-medium text-white shadow-[0_2px_8px_-3px_rgba(124,21,39,0.5)] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <FormDrawer
        open={saveDrawerOpen}
        onClose={() => setSaveDrawerOpen(false)}
        title={activeSavedId ? "Update Report" : "Save Report"}
        subtitle={source ? `${source.label}${groupingEnabled ? " · grouped" : ` · ${selectedFields.length} field(s)`}` : ""}
        error={saveError}
        footer={
          <div className="flex flex-wrap justify-end gap-3">
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={() => setSaveDrawerOpen(false)}>
              Cancel
            </DivineButton>
            {activeSavedId && (
              <DivineButton variant="ghost" fullWidth={false} type="button" loading={saving} onClick={() => void submitSave(true)}>
                Save as New
              </DivineButton>
            )}
            <DivineButton variant="flame" fullWidth={false} type="submit" form="save-report-form" loading={saving}>
              {activeSavedId ? "Update" : "Save"}
            </DivineButton>
          </div>
        }
      >
        <form
          id="save-report-form"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submitSave();
          }}
        >
          <DivineInput staticLabel label="Report Name" value={saveName} onChange={(e) => setSaveName(e.target.value)} />
          <p className="text-[12px] text-ink-500">
            {activeSavedId
              ? "Updates this saved report's name, fields, filters, sort and grouping in place. Use “Save as New” instead to keep the original and create a separate copy."
              : "Saves the report type, fields, filters, sort and grouping — running it later always re-reads live data."}
          </p>
        </form>
      </FormDrawer>

      <ConfirmDialog
        open={Boolean(deletingReport)}
        title="Delete this saved report?"
        message={deletingReport ? `"${deletingReport.name}" will be removed. This can't be undone.` : ""}
        confirmLabel="Delete report"
        tone="danger"
        loading={deleting}
        onCancel={() => setDeletingReport(null)}
        onConfirm={() => void confirmDeleteSaved()}
      />
    </div>
  );
}

function groupableSortOptions(groupBy: string, aggRows: AggRow[], source: ReportSource): ListboxOption[] {
  const groupField = source.fields.find((f) => f.key === groupBy);
  const opts: ListboxOption[] = groupField ? [{ value: groupField.key, label: groupField.label }] : [];
  aggRows.forEach((a) => {
    const label = a.fn === "count" ? "Count of records" : `${AGG_FN_LABELS[a.fn]} of ${source.fields.find((f) => f.key === a.field)?.label ?? a.field}`;
    opts.push({ value: `${a.field || "records"}__${a.fn}`, label });
  });
  return opts;
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-md bg-gradient-to-r from-crimson-500 to-flame-500 p-[1.5px] shadow-[0_10px_30px_-14px_rgba(220,38,38,0.4)]">
      <div className="rounded-[4px] bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-accent text-[13px] font-semibold uppercase tracking-wide text-maroon">{title}</h2>
          {action}
        </div>
        {children}
      </div>
    </div>
  );
}

function FilterConditionRow({
  condition,
  fields,
  onChange,
  onRemove,
}: {
  condition: Condition;
  fields: ReportField[];
  onChange: (patch: Partial<Condition>) => void;
  onRemove: () => void;
}) {
  const field = fields.find((f) => f.key === condition.field);
  const operators = operatorsForField(field);
  const noValue = NO_VALUE_OPERATORS.has(condition.operator);
  const isList = LIST_VALUE_OPERATORS.has(condition.operator);
  const isBetween = TWO_VALUE_OPERATORS.has(condition.operator);

  function handleFieldChange(nextKey: string) {
    const nextField = fields.find((f) => f.key === nextKey);
    const nextOps = operatorsForField(nextField);
    onChange({ field: nextKey, operator: nextOps[0], value: "", valueTo: "", valueList: [] });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-[#faf6f1] p-2">
      <DivineListbox value={condition.field} onChange={handleFieldChange} options={fields.map((f) => ({ value: f.key, label: f.label }))} className="w-48" />
      <DivineListbox
        value={condition.operator}
        onChange={(v) => onChange({ operator: v, value: "", valueTo: "", valueList: [] })}
        options={operators.map((op) => ({ value: op, label: OPERATOR_LABELS[op] }))}
        className="w-44"
      />
      {!noValue && field && (
        <div className="flex items-center gap-2">
          {isList ? (
            <DivineMultiSelect
              label="Values"
              values={condition.valueList}
              onChange={(v) => onChange({ valueList: v })}
              options={(field.options ?? []).map((o) => ({ value: o, label: o }))}
              placeholder="Choose values…"
            />
          ) : field.options ? (
            <DivineListbox value={condition.value} onChange={(v) => onChange({ value: v })} options={field.options.map((o) => ({ value: o, label: o }))} className="w-40" />
          ) : field.type === "boolean" ? (
            <DivineListbox
              value={condition.value}
              onChange={(v) => onChange({ value: v })}
              options={[{ value: "true", label: "Yes" }, { value: "false", label: "No" }]}
              className="w-32"
            />
          ) : field.type === "date" ? (
            <>
              <DivineDatePicker label="Value" value={condition.value} onChange={(v) => onChange({ value: v })} />
              {isBetween && <DivineDatePicker label="To" value={condition.valueTo} onChange={(v) => onChange({ valueTo: v })} />}
            </>
          ) : (
            <>
              <input
                value={condition.value}
                onChange={(e) => onChange({ value: e.target.value })}
                type={field.type === "number" ? "number" : "text"}
                placeholder="Value"
                className="w-36 rounded-md border border-slate-200 px-3 py-1.5 text-[13px] outline-none focus:border-maroon/40"
              />
              {isBetween && (
                <input
                  value={condition.valueTo}
                  onChange={(e) => onChange({ valueTo: e.target.value })}
                  type={field.type === "number" ? "number" : "text"}
                  placeholder="To"
                  className="w-36 rounded-md border border-slate-200 px-3 py-1.5 text-[13px] outline-none focus:border-maroon/40"
                />
              )}
            </>
          )}
        </div>
      )}
      <button type="button" onClick={onRemove} aria-label="Remove filter" className="ml-auto text-red-500 hover:text-red-600">
        <TrashIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
