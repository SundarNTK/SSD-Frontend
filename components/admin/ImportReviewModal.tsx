"use client";

import { useRef, useState } from "react";
import type { AxiosInstance } from "axios";
import FormDrawer from "./FormDrawer";
import DivineButton from "../divine/DivineButton";
import { EmblemLoader } from "../divine/EmblemLoader";
import { ArrowDownIcon, TrashIcon, CheckIcon, CloseIcon } from "../divine/icons";
import { toast } from "../../lib/toastStore";
import { extractErrorMessage } from "../../lib/api";

export type ImportRow = {
  rowNumber: number;
  raw: Record<string, string | number>;
  resolved: Record<string, string | number>;
  errors: string[];
  status: "valid" | "error";
};

type ImportSummary = { total: number; valid: number; invalid: number; blockingIssues: string[] };
type RowState = ImportRow & { included: boolean };
type Stage = "idle" | "scanning" | "review" | "committing";

type ImportReviewModalProps = {
  open: boolean;
  onClose: () => void;
  client: AxiosInstance;
  /** Master's own API base path, e.g. "/masters/deities". */
  basePath: string;
  entityLabel: string;
  /** Which raw columns to preview in the review grid, in order. */
  previewFields: { key: string; label: string }[];
  onImported: () => void;
};

/**
 * The scan → review → commit flow behind every master's Import button.
 *
 * 1. A chosen .xlsx is sent to `${basePath}/import/validate` — nothing is
 *    written yet, the server only scans it (required fields, uniqueness
 *    within the file AND against the database, and that every dropdown
 *    reference — Printing Group, Unit, etc. — still exists and is active).
 * 2. Every row comes back with its own errors. Rows with no errors start
 *    checked ("Include"); rows with errors start unchecked. The admin can
 *    flip any row's checkbox (ignore it without losing it from view) or
 *    remove it from the list outright with the trash icon — either way it
 *    won't be part of the import.
 * 3. "Import N records" sends only the checked rows to
 *    `${basePath}/import/commit`, which re-runs the exact same scan against
 *    live data (a dropdown option or a competing import could have changed
 *    in the meantime) and only then inserts — all rows at once, or none at
 *    all if the re-check still finds a problem. A rejected commit reloads
 *    this same review screen with the fresh errors instead of just failing,
 *    so nothing already reviewed is lost.
 */
export default function ImportReviewModal({ open, onClose, client, basePath, entityLabel, previewFields, onImported }: ImportReviewModalProps) {
  const [stage, setStage] = useState<Stage>("idle");
  const [rows, setRows] = useState<RowState[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStage("idle");
    setRows([]);
    setSummary(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleFileChosen(file: File) {
    setStage("scanning");
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await client.post(`${basePath}/import/validate`, formData);
      const data = res.data.data as { rows: ImportRow[]; summary: ImportSummary };
      setRows(data.rows.map((r) => ({ ...r, included: r.status === "valid" })));
      setSummary(data.summary);
      setStage("review");
    } catch (err) {
      setError(extractErrorMessage(err));
      setStage("idle");
    }
  }

  function toggleIncluded(rowNumber: number) {
    setRows((prev) => prev.map((r) => (r.rowNumber === rowNumber ? { ...r, included: !r.included } : r)));
  }

  function removeRow(rowNumber: number) {
    setRows((prev) => prev.filter((r) => r.rowNumber !== rowNumber));
  }

  async function handleCommit() {
    const toSubmit = rows.filter((r) => r.included);
    if (toSubmit.length === 0) {
      setError("Select at least one row to import.");
      return;
    }
    setStage("committing");
    setError(null);
    try {
      const res = await client.post(`${basePath}/import/commit`, {
        rows: toSubmit.map((r) => ({ rowNumber: r.rowNumber, raw: r.raw })),
      });
      const insertedCount = res.data?.data?.insertedCount ?? toSubmit.length;
      toast.created(`${insertedCount} ${entityLabel}${insertedCount === 1 ? "" : "s"} imported successfully.`);
      onImported();
      handleClose();
    } catch (err: unknown) {
      // A 422 here means the server's own re-check (never the client's
      // first-pass verdict) found a problem, and carries a fresh row list —
      // land back on the review grid with it rather than just erroring out,
      // so every other row's include/exclude choice survives.
      const response = (err as { response?: { data?: { data?: { rows: ImportRow[]; summary: ImportSummary } } } })?.response;
      const freshData = response?.data?.data;
      if (freshData?.rows) {
        setRows(freshData.rows.map((r) => ({ ...r, included: r.status === "valid" })));
        setSummary(freshData.summary);
      }
      setStage("review");
      setError(extractErrorMessage(err));
    }
  }

  const includedCount = rows.filter((r) => r.included).length;

  return (
    <FormDrawer
      open={open}
      onClose={handleClose}
      title={`Import ${entityLabel}s`}
      maxWidthClassName="max-w-5xl"
      icon={<ArrowDownIcon className="h-4 w-4" />}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[12.5px] text-ink-500">
            {(stage === "review" || stage === "committing") && summary && (
              <span>
                {summary.total} row(s) scanned · {includedCount} selected to import
              </span>
            )}
          </div>
          <div className="flex justify-end gap-3">
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={handleClose}>
              Cancel
            </DivineButton>
            {(stage === "review" || stage === "committing") && (
              <>
                <DivineButton variant="ghost" fullWidth={false} type="button" disabled={stage === "committing"} onClick={reset}>
                  Choose a different file
                </DivineButton>
                <DivineButton
                  variant="flame"
                  fullWidth={false}
                  type="button"
                  loading={stage === "committing"}
                  disabled={includedCount === 0}
                  onClick={handleCommit}
                >
                  Import {includedCount || ""} record{includedCount === 1 ? "" : "s"}
                </DivineButton>
              </>
            )}
          </div>
        </div>
      }
    >
      {error && (
        <p className="mb-4 rounded-xl border border-crimson-500/40 bg-crimson-500/10 px-4 py-3 text-[12.5px] leading-relaxed text-crimson-400">
          {error}
        </p>
      )}

      {stage === "idle" && (
        <div className="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/40 px-6 py-12 text-center">
          <ArrowDownIcon className="h-8 w-8 text-amber-500" />
          <div>
            <p className="text-[14px] font-medium text-ink-100">Choose the filled-in .xlsx file to import.</p>
            <p className="mt-1 text-[12.5px] text-ink-500">
              Use the “Sample Excel” button on the {entityLabel} Master screen to get the template with the exact columns and
              dropdown values expected here. Nothing is saved until you review and confirm on the next screen.
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFileChosen(file);
            }}
          />
          <DivineButton
            type="button"
            variant="marigold"
            fullWidth={false}
            onClick={() => fileInputRef.current?.click()}
          >
            Select .xlsx file
          </DivineButton>
        </div>
      )}

      {stage === "scanning" && (
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <EmblemLoader size="md" label="Scanning the file — checking required fields, duplicates, and dropdown values…" />
        </div>
      )}

      {(stage === "review" || stage === "committing") && summary && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 text-[12.5px]">
            <span className="rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 font-medium text-ink-100">
              {summary.total} scanned
            </span>
            <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 font-medium text-emerald-700">
              {summary.valid} valid
            </span>
            <span className="rounded-md border border-crimson-500/30 bg-crimson-500/10 px-3 py-1.5 font-medium text-crimson-600">
              {summary.invalid} need attention
            </span>
          </div>

          {summary.blockingIssues.length > 0 && (
            <div className="rounded-xl border border-crimson-500/40 bg-crimson-500/10 px-4 py-3 text-[12.5px] text-crimson-600">
              {summary.blockingIssues.map((issue, i) => (
                <p key={i}>{issue}</p>
              ))}
            </div>
          )}

          <div className="max-h-[50vh] overflow-auto rounded-md border border-slate-200">
            <table className="w-full min-w-[720px] border-collapse text-left text-[12.5px]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#7c1527] text-[10.5px] uppercase tracking-wide text-white">
                  <th className="px-3 py-2.5 font-semibold">Row</th>
                  <th className="px-3 py-2.5 font-semibold">Include</th>
                  {previewFields.map((f) => (
                    <th key={f.key} className="border-l border-white/50 px-3 py-2.5 font-semibold">
                      {f.label}
                    </th>
                  ))}
                  <th className="border-l border-white/50 px-3 py-2.5 font-semibold">Status / Issues</th>
                  <th className="border-l border-white/50 px-3 py-2.5 text-right font-semibold">Remove</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={previewFields.length + 4} className="px-3 py-8 text-center text-ink-500">
                      No rows left to import.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr
                      key={r.rowNumber}
                      className={`border-b border-slate-200 ${r.status === "error" ? "bg-crimson-500/5" : ""} ${!r.included ? "opacity-60" : ""}`}
                    >
                      <td className="px-3 py-2.5 tabular-nums text-ink-500">{r.rowNumber}</td>
                      <td className="border-l border-slate-200 px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => toggleIncluded(r.rowNumber)}
                          disabled={stage === "committing"}
                          aria-label={r.included ? "Exclude this row" : "Include this row"}
                          title={r.included ? "Ignore this row" : "Include this row"}
                          className={`flex h-6 w-6 items-center justify-center rounded-md border transition-colors ${
                            r.included ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white text-transparent"
                          }`}
                        >
                          <CheckIcon className="h-3.5 w-3.5 text-current" />
                        </button>
                      </td>
                      {previewFields.map((f) => (
                        <td key={f.key} className="border-l border-slate-200 px-3 py-2.5 text-ink-100">
                          {String(r.raw[f.key] ?? "—") || "—"}
                        </td>
                      ))}
                      <td className="border-l border-slate-200 px-3 py-2.5">
                        {r.status === "valid" ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <CheckIcon className="h-3.5 w-3.5 text-emerald-600" /> Ready
                          </span>
                        ) : (
                          <ul className="space-y-0.5 text-crimson-600">
                            {r.errors.map((e, i) => (
                              <li key={i} className="flex items-start gap-1">
                                <CloseIcon className="mt-0.5 h-3 w-3 shrink-0 text-crimson-500" />
                                <span>{e}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="border-l border-slate-200 px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => removeRow(r.rowNumber)}
                          disabled={stage === "committing"}
                          aria-label="Remove this row from the import"
                          title="Remove this row from the import"
                          className="flex h-8 w-8 items-center justify-center text-red-600 transition-transform duration-200 hover:scale-110 hover:text-red-700 active:scale-95"
                        >
                          <TrashIcon className="h-[17px] w-[17px]" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <p className="text-[12px] text-ink-400">
            Rows with issues are unchecked by default and won&rsquo;t be imported. Fix them in the spreadsheet and re-upload, or
            uncheck/remove them here to import only the rest. Nothing is written to the database until you click “Import”.
          </p>
        </div>
      )}
    </FormDrawer>
  );
}
