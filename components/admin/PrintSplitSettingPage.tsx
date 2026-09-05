"use client";

import { useEffect, useState } from "react";
import DivineButton from "../divine/DivineButton";
import DivineListbox, { type ListboxOption } from "../divine/DivineListbox";
import { api, unwrap, type ApiEnvelope } from "../../lib/api";
import { useAsyncAction } from "../../lib/useAsyncAction";
import { toast } from "../../lib/toastStore";
import { MODULES, usePermissions } from "../../lib/permissions";
import { EmblemLoader } from "../divine/EmblemLoader";

type PrintSplitMode = "DEITY_WISE" | "PRINT_GROUP_WISE";

type PrintSplitSetting = {
  _id: string;
  mode: PrintSplitMode;
};

const MODE_OPTIONS: ListboxOption[] = [
  { value: "PRINT_GROUP_WISE", label: "Print Group Wise" },
  { value: "DEITY_WISE", label: "Deity Wise" },
];

async function fetchSetting() {
  const r = await api.get<ApiEnvelope<PrintSplitSetting>>("/masters/print-split-setting");
  return unwrap(r);
}

async function saveSetting(mode: PrintSplitMode) {
  const r = await api.put<ApiEnvelope<PrintSplitSetting>>("/masters/print-split-setting", { mode });
  return unwrap(r);
}

/**
 * Singleton master — a single global choice, not a list, so this page is
 * deliberately just a form (load-then-save), not a DataTable + FormDrawer
 * the way every other master here is. See SSD-Backend's
 * models/print-split-settings for the schema and controllers/print-split-
 * settings for the GET/PUT this talks to.
 *
 * Deity Wise: one ticket per deity, regardless of Print Group mapping.
 * Print Group Wise (default): one ticket per resolved Print Group — a
 * deity's own group (Deity Master), or an item/service's own group when it
 * doesn't require a deity (Item/Service Master's "Deity Mapping Required"
 * toggle decides which). See common/utils/ticket-grouping.js on the backend
 * for the exact resolution rule this setting feeds into.
 */
export default function PrintSplitSettingPage() {
  const { can } = usePermissions();
  const canEdit = can(MODULES.printSplitSetting, "edit");

  const [mode, setMode] = useState<PrintSplitMode | null>(null);
  const load = useAsyncAction(fetchSetting);
  const save = useAsyncAction(saveSetting);

  useEffect(() => {
    load.run().then((setting) => {
      if (setting) setMode(setting.mode);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave() {
    if (!mode) return;
    const setting = await save.run(mode);
    if (setting) {
      setMode(setting.mode);
      toast.updated("Print split setting updated successfully.");
    }
  }

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-[#7c1527]">Print Split Setting</h1>
        <p className="mt-1 text-[13px] text-ink-500">
          Decides how POS ticket printing splits a booking into physical tickets. Deity Wise prints one ticket per
          deity, regardless of Print Group. Print Group Wise prints one ticket per resolved Print Group, combining
          deities (or items/services) that share the same group onto a single ticket.
        </p>
      </div>

      {mode === null ? (
        <div className="flex justify-center py-8">
          <EmblemLoader size="sm" label="Loading…" />
        </div>
      ) : (
        <div className="space-y-5 rounded-xl border border-[#ead9c6] bg-white px-5 py-5">
          <DivineListbox
            label="Print Split Mode"
            value={mode}
            onChange={(v) => setMode(v as PrintSplitMode)}
            options={MODE_OPTIONS}
            disabled={!canEdit}
            clearable={false}
          />
          {canEdit ? (
            <DivineButton variant="flame" fullWidth={false} type="button" loading={save.submitting} onClick={handleSave}>
              Save
            </DivineButton>
          ) : (
            <p className="text-[12.5px] text-ink-500">You have view-only access to this setting.</p>
          )}
        </div>
      )}
    </div>
  );
}
