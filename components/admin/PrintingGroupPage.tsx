"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import DataTable, { StatusToggleCell, EditIconButton, DeleteIconButton, type DataTableColumn } from "./DataTable";
import FormDrawer from "./FormDrawer";
import ConfirmDialog from "./ConfirmDialog";
import DivineInput from "../divine/DivineInput";
import DivineTextarea from "../divine/DivineTextarea";
import DivineStatusSelect from "../divine/DivineStatusSelect";
import DivineButton from "../divine/DivineButton";
import { api, unwrap, type ApiEnvelope } from "../../lib/api";
import { useApiResource } from "../../lib/useApiResource";
import { MODULES, usePermissions } from "../../lib/permissions";
import { toast } from "../../lib/toastStore";
import { patchMasterStatus } from "../../lib/patchMasterStatus";
import { usePageSize } from "../../lib/usePageSize";

type LinkedRecord = { _id: string; name: string; tamilName: string; code: string; status: number };
type PrintingGroupLinks = { deities: LinkedRecord[]; items: LinkedRecord[]; services: LinkedRecord[] };

export type PrintingGroup = {
  _id: string;
  code: string;
  name: string;
  description: string;
  status: number;
  createdAt: string;
} & PrintingGroupLinks;

/**
 * `compact` (list table) drops the code and collapses "Inactive" to a
 * small dot — but the name itself is never truncated in either mode; the
 * chip just grows as wide as its name needs (`whitespace-nowrap`, no
 * `max-w`/`truncate`) and the column sizes to fit it, same as the Name
 * column already does. The tooltip still carries name+code+status for a
 * quick hover, not as a substitute for showing the name outright.
 */
function LinkedChip({ record, typeLabel, compact = false }: { record: LinkedRecord; typeLabel?: string; compact?: boolean }) {
  const inactive = record.status !== 1;
  const tooltip = [record.tamilName ? `${record.name} (${record.tamilName})` : record.name, record.code, inactive ? "Inactive" : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[12px] ${
        inactive ? "border-ink-500/25 bg-ink-500/5 text-ink-500" : "border-gold-500/30 bg-gold-500/10 text-amber-800"
      }`}
      title={tooltip}
    >
      {inactive && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" aria-hidden="true" />}
      {typeLabel && <span className="shrink-0 rounded border border-current/30 px-1 text-[9.5px] font-semibold uppercase tracking-wide opacity-70">{typeLabel}</span>}
      <span className="font-medium">{record.name}</span>
      {!compact && <span className="shrink-0 tabular-nums opacity-70">{record.code}</span>}
      {!compact && inactive && <span className="shrink-0 opacity-70">· Inactive</span>}
    </span>
  );
}

/**
 * The list table's compact version of the same data — every linked record
 * shown in full (no truncated names, no capped/"+N more" list). A group
 * with a long roster grows a vertical scrollbar inside the cell instead of
 * stretching the row (and every other cell in it) to match, so one busy
 * group never distorts the rest of the table. Wide names likewise scroll
 * the table horizontally (see DataTable's own overflow-x-auto) rather than
 * being cut short.
 */
function LinkedListCell({ records, emptyText }: { records: LinkedRecord[]; emptyText: string }) {
  if (records.length === 0) {
    return <span className="text-[12.5px] text-ink-500">{emptyText}</span>;
  }
  return (
    <div className="flex max-h-[140px] flex-col items-start gap-1 overflow-y-auto pr-1">
      {records.map((r) => (
        <LinkedChip key={r._id} record={r} compact />
      ))}
    </div>
  );
}

/**
 * Read-only "what belongs to this group" panel inside the Edit drawer —
 * Deity always carries a printingGroup directly; Item/Service only do when
 * isDeityMappingRequired is false (otherwise their print group comes from
 * their mapped deity instead), so this mirrors exactly what the backend
 * link resolution (controllers/printing-groups) actually uses at print
 * time, not every item that's merely mapped to a deity in this group.
 *
 * Mounted fresh per group (see the `key={editing._id}` at the call site),
 * so `loading`/`links` never need to be reset mid-life — their initial
 * `useState` values already cover "just switched to a new group."
 */
function LinkedRecordsPanel({ groupId }: { groupId: string }) {
  const [links, setLinks] = useState<PrintingGroupLinks | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get<ApiEnvelope<PrintingGroupLinks>>(`/masters/printing-groups/${groupId}/links`)
      .then((res) => {
        if (!cancelled) setLinks(unwrap(res));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  const itemsAndServices = links ? [...links.items.map((r) => ({ r, typeLabel: "Item" })), ...links.services.map((r) => ({ r, typeLabel: "Service" }))] : [];

  return (
    <div className="space-y-4 rounded-xl border border-gold-500/25 bg-ivory-50/60 p-4">
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-500">Linked Deities</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {loading ? (
            <span className="text-[12.5px] text-ink-500">Loading…</span>
          ) : links && links.deities.length > 0 ? (
            links.deities.map((d) => <LinkedChip key={d._id} record={d} />)
          ) : (
            <span className="text-[12.5px] text-ink-500">No deities linked yet.</span>
          )}
        </div>
      </div>
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-500">Linked Items / Services</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {loading ? (
            <span className="text-[12.5px] text-ink-500">Loading…</span>
          ) : itemsAndServices.length > 0 ? (
            itemsAndServices.map(({ r, typeLabel }) => <LinkedChip key={`${typeLabel}-${r._id}`} record={r} typeLabel={typeLabel} />)
          ) : (
            <span className="text-[12.5px] text-ink-500">
              No items or services linked directly — deity-mapped items/services take their print group from their deity instead.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

const schema = z.object({
  code: z.string().trim().min(1, "Code is required").max(20),
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  description: z.string().trim().max(300),
  status: z.number(),
});

type FormValues = z.infer<typeof schema>;

export default function PrintingGroupPage() {
  const { can } = usePermissions();
  const canCreate = can(MODULES.printingGroups, "fullAccess");
  const canEdit = can(MODULES.printingGroups, "edit");
  const { items, total, list, create, update, remove } = useApiResource<PrintingGroup>(api, "/masters/printing-groups");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = usePageSize();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<PrintingGroup | null>(null);
  const [deleting, setDeleting] = useState<PrintingGroup | null>(null);

  useEffect(() => {
    list.run({ page, pageSize, search: search || undefined, status: statusFilter || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, search, statusFilter]);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  function openCreate() {
    setEditing(null);
    reset({ code: "", name: "", description: "", status: 1 });
    create.setError(null);
    setDrawerOpen(true);
  }

  function openEdit(group: PrintingGroup) {
    setEditing(group);
    reset({ code: group.code, name: group.name, description: group.description, status: group.status });
    update.setError(null);
    setDrawerOpen(true);
  }

  const submit = handleSubmit(async (values) => {
    const ok = editing
      ? await update.run(editing._id, values)
      : await create.run(values);
    if (ok !== undefined) {
      setDrawerOpen(false);
      if (editing) toast.updated("Printing group updated successfully.");
      else toast.created("Printing group created successfully.");
    }
  });

  const columns: DataTableColumn<PrintingGroup>[] = [
    { key: "code", label: "Code", className: "align-top", render: (g) => <span className="font-medium tabular-nums text-amber-700">{g.code || "—"}</span> },
    { key: "name", label: "Name", className: "align-top", render: (g) => <span className="font-medium">{g.name}</span> },
    {
      key: "deities",
      label: "Linked Deities",
      className: "min-w-[160px] align-top",
      render: (g) => <LinkedListCell records={g.deities} emptyText="No deities linked." />,
    },
    {
      key: "items",
      label: "Linked Items",
      className: "min-w-[160px] align-top",
      render: (g) => <LinkedListCell records={g.items} emptyText="No items linked." />,
    },
    {
      key: "services",
      label: "Linked Services",
      className: "min-w-[160px] align-top",
      render: (g) => <LinkedListCell records={g.services} emptyText="No services linked." />,
    },
    {
      key: "description",
      label: "Description",
      className: "align-top",
      render: (g) => <span className="text-ink-500">{g.description || "—"}</span>,
    },
    { key: "status", label: "Status", className: "align-top", render: (g) => (
      <StatusToggleCell status={g.status} canEdit={canEdit} onChange={(status) => patchMasterStatus(update, g._id, status, "Printing group")} />
    ) },
  ];

  return (
    <>
      <DataTable
        title="Printing Group Master"
        subtitle="Groups items for print-run purposes at the POS counter."
        columns={columns}
        rows={items}
        rowKey={(g) => g._id}
        loading={list.submitting}
        search={search}
        onSearchChange={(v) => {
          setPage(1);
          setSearch(v);
        }}
        searchPlaceholder="Search printing groups…"
        statusFilter={statusFilter}
        onStatusFilterChange={(v) => {
          setPage(1);
          setStatusFilter(v);
        }}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPage(1);
          setPageSize(size);
        }}
        onCreate={canCreate ? openCreate : undefined}
        createLabel="Add Group"
        emptyMessage="No printing groups yet — create the first one."
        rowActions={(g) => (
          <div className="flex justify-end gap-2">
            {canEdit && <EditIconButton onClick={() => openEdit(g)} />}
            {canCreate && <DeleteIconButton onClick={() => setDeleting(g)} />}
          </div>
        )}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this printing group?"
        message={deleting ? `"${deleting.name} (${deleting.code})" will be removed.` : ""}
        confirmLabel="Delete group"
        tone="danger"
        error={remove.error}
        loading={remove.submitting}
        onCancel={() => {
          remove.setError(null);
          setDeleting(null);
        }}
        onConfirm={async () => {
          if (!deleting) return;
          const ok = await remove.run(deleting._id);
          if (ok !== undefined) {
            setDeleting(null);
            toast.deleted("Printing group deleted successfully.");
          }
        }}
      />

      <FormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? "Edit Printing Group" : "Add Printing Group"}
        subtitle={editing ? `${editing.name} · ${editing.code}` : "Define a new print-run grouping."}
        error={create.error || update.error}
        footer={
          <div className="flex justify-end gap-3">
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={() => setDrawerOpen(false)}>
              Cancel
            </DivineButton>
            <DivineButton variant="flame" fullWidth={false} type="submit" form="printing-group-form" loading={create.submitting || update.submitting}>
              {editing ? "Save changes" : "Save"}
            </DivineButton>
          </div>
        }
      >
        <form id="printing-group-form" onSubmit={submit} noValidate className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DivineInput staticLabel label="Code" error={errors.code?.message} {...register("code")} />
            <DivineInput staticLabel label="Name" error={errors.name?.message} {...register("name")} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <DivineStatusSelect value={field.value} onChange={field.onChange} />
              )}
            />
          </div>
          <DivineTextarea staticLabel label="Description" error={errors.description?.message} {...register("description")} />
        </form>

        {editing && (
          <div className="mt-6">
            <LinkedRecordsPanel key={editing._id} groupId={editing._id} />
          </div>
        )}
      </FormDrawer>
    </>
  );
}
