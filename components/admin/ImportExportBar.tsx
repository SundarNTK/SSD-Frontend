"use client";

import { useState } from "react";
import type { AxiosInstance } from "axios";
import DivineButton from "../divine/DivineButton";
import { ArrowUpIcon, ArrowDownIcon, DownloadIcon } from "../divine/icons";
import { downloadFile } from "../../lib/downloadFile";
import { toast } from "../../lib/toastStore";

type ImportExportBarProps = {
  client: AxiosInstance;
  /** Master's own API base path, e.g. "/masters/deities". */
  basePath: string;
  entityLabel: string;
  canExport: boolean;
  /** Shows the "Sample Excel" button independently of `canExport` — for a
   *  master (Customer Master) that supports Import but has no `/export`
   *  endpoint of its own. Defaults to `canExport` so every existing call
   *  site, which only ever had the one flag, keeps its current behavior. */
  canDownloadTemplate?: boolean;
  canImport: boolean;
  onOpenImport: () => void;
};

/**
 * The Import / Sample Template / Export trio every master's toolbar gets —
 * see DataTable's `toolbarActions` slot. Deliberately generic (just a
 * basePath + label) so Item, Unit, and every other master can drop this in
 * unchanged once they wire up the same backend endpoints Deity Master uses
 * (see SSD-Backend's common/factories/import-export-controller.js).
 */
export default function ImportExportBar({ client, basePath, entityLabel, canExport, canDownloadTemplate, canImport, onOpenImport }: ImportExportBarProps) {
  const [downloading, setDownloading] = useState<"template" | "export" | null>(null);
  const showTemplate = canDownloadTemplate ?? canExport;

  async function handleDownload(kind: "template" | "export") {
    setDownloading(kind);
    try {
      if (kind === "template") {
        await downloadFile(client, `${basePath}/import/template`, `${entityLabel.toLowerCase()}-import-template.xlsx`);
      } else {
        await downloadFile(client, `${basePath}/export`, `${entityLabel.toLowerCase()}-export.xlsx`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not download the file.");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showTemplate && (
        <DivineButton
          type="button"
          variant="leaf"
          fullWidth={false}
          loading={downloading === "template"}
          onClick={() => handleDownload("template")}
        >
          <DownloadIcon className="h-4 w-4" />
          Sample Excel
        </DivineButton>
      )}
      {canExport && (
        <DivineButton
          type="button"
          variant="ghost"
          fullWidth={false}
          loading={downloading === "export"}
          onClick={() => handleDownload("export")}
        >
          <ArrowUpIcon className="h-4 w-4" />
          Export
        </DivineButton>
      )}
      {canImport && (
        <DivineButton type="button" variant="marigold" fullWidth={false} onClick={onOpenImport}>
          <ArrowDownIcon className="h-4 w-4" />
          Import
        </DivineButton>
      )}
    </div>
  );
}
