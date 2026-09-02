"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import DataTable, { StatusPill, EditIconButton, DeleteIconButton, type DataTableColumn } from "./DataTable";
import FormDrawer from "./FormDrawer";
import ConfirmDialog from "./ConfirmDialog";
import DivineInput from "../divine/DivineInput";
import DivineTextarea from "../divine/DivineTextarea";
import DivineListbox, { type ListboxOption } from "../divine/DivineListbox";
import DivineStatusSelect from "../divine/DivineStatusSelect";
import DivineButton from "../divine/DivineButton";
import { api, unwrap, type ApiEnvelope } from "../../lib/api";
import { useApiResource } from "../../lib/useApiResource";
import { MODULES, usePermissions } from "../../lib/permissions";
import { toast } from "../../lib/toastStore";

type Ref = { _id: string; name: string };
type GstRef = { _id: string; type: string; percentage: number; code: string };

export type GeneralLedger = {
  _id: string;
  name: string;
  code: string;
  gstType: GstRef | null;
  groupLevel1: Ref | null;
  groupLevel2: Ref | null;
  groupLevel3: Ref | null;
  description: string;
  status: number;
};

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(150),
  code: z.string().trim().min(1, "Code is required").max(30),
  gstType: z.string().min(1, "GST type is required"),
  groupLevel1: z.string().min(1, "Level 1 group is required"),
  groupLevel2: z.string(),
  groupLevel3: z.string(),
  description: z.string().trim().max(300),
  status: z.number(),
});

type FormValues = z.infer<typeof schema>;

const DEFAULT_PAGE_SIZE = 10;

async function fetchGroupOptions(level: 1 | 2 | 3, level1?: string, level2?: string): Promise<ListboxOption[]> {
  const params: Record<string, string | number> = { level, status: 1, pageSize: 100 };
  if (level1) params.level1 = level1;
  if (level2) params.level2 = level2;
  const res = await api.get<ApiEnvelope<{ items: { _id: string; name: string }[] }>>("/masters/gl-groups", { params });
  return unwrap(res).items.map((g) => ({ value: g._id, label: g.name }));
}

export default function GeneralLedgerPage() {
  const { can } = usePermissions();
  const canCreate = can(MODULES.generalLedgers, "fullAccess");
  const canEdit = can(MODULES.generalLedgers, "edit");
  const { items, total, list, create, update, remove } = useApiResource<GeneralLedger>(api, "/masters/general-ledgers");

  const [gstOptions, setGstOptions] = useState<ListboxOption[]>([]);
  const [level1Options, setLevel1Options] = useState<ListboxOption[]>([]);
  const [level2Options, setLevel2Options] = useState<ListboxOption[]>([]);
  const [level3Options, setLevel3Options] = useState<ListboxOption[]>([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<GeneralLedger | null>(null);
  const [deleting, setDeleting] = useState<GeneralLedger | null>(null);

  useEffect(() => {
    api
      .get<ApiEnvelope<{ items: GstRef[] }>>("/masters/gst", { params: { status: 1, pageSize: 100 } })
      .then((res) => setGstOptions(unwrap(res).items.map((g) => ({ value: g._id, label: `${g.type} (${g.percentage}%)` }))));
    fetchGroupOptions(1).then(setLevel1Options);
  }, []);

  useEffect(() => {
    list.run({ page, pageSize, search: search || undefined, status: statusFilter || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, search, statusFilter]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const selectedLevel1 = watch("groupLevel1");
  const selectedLevel2 = watch("groupLevel2");

  useEffect(() => {
    if (!selectedLevel1) {
      setLevel2Options([]);
      return;
    }
    fetchGroupOptions(2, selectedLevel1).then(setLevel2Options);
  }, [selectedLevel1]);

  useEffect(() => {
    if (!selectedLevel1 || !selectedLevel2) {
      setLevel3Options([]);
      return;
    }
    fetchGroupOptions(3, selectedLevel1, selectedLevel2).then(setLevel3Options);
  }, [selectedLevel1, selectedLevel2]);

  function openCreate() {
    setEditing(null);
    reset({ name: "", code: "", gstType: "", groupLevel1: "", groupLevel2: "", groupLevel3: "", description: "", status: 1 });
    create.setError(null);
    setDrawerOpen(true);
  }

  function openEdit(gl: GeneralLedger) {
    setEditing(gl);
    reset({
      name: gl.name,
      code: gl.code,
      gstType: gl.gstType?._id ?? "",
      groupLevel1: gl.groupLevel1?._id ?? "",
      groupLevel2: gl.groupLevel2?._id ?? "",
      groupLevel3: gl.groupLevel3?._id ?? "",
      description: gl.description,
      status: gl.status,
    });
    update.setError(null);
    setDrawerOpen(true);
  }

  const submit = handleSubmit(async (values) => {
    const payload = {
      ...values,
      groupLevel2: values.groupLevel2 || null,
      groupLevel3: values.groupLevel3 || null,
    };
    const ok = editing ? await update.run(editing._id, payload) : await create.run(payload);
    if (ok !== undefined) {
      setDrawerOpen(false);
      if (editing) toast.updated("GL account updated successfully.");
      else toast.created("GL account created successfully.");
    }
  });

  const columns: DataTableColumn<GeneralLedger>[] = [
    { key: "code", label: "Code", render: (g) => <span className="font-medium tabular-nums text-amber-700">{g.code}</span> },
    { key: "name", label: "Name", render: (g) => g.name },
    {
      key: "gst",
      label: "GST",
      render: (g) => <span className="text-ink-500">{g.gstType ? `${g.gstType.type} (${g.gstType.percentage}%)` : "—"}</span>,
    },
    {
      key: "group",
      label: "GL Group",
      render: (g) => (
        <span className="text-ink-500">
          {[g.groupLevel1?.name, g.groupLevel2?.name, g.groupLevel3?.name].filter(Boolean).join(" › ") || "—"}
        </span>
      ),
    },
    { key: "status", label: "Status", render: (g) => <StatusPill status={g.status} /> },
  ];

  return (
    <>
      <DataTable
        title="General Ledger (GL) Master"
        subtitle="Chart-of-accounts entries — items pick a GL account to derive their GST from."
        columns={columns}
        rows={items}
        rowKey={(g) => g._id}
        loading={list.submitting}
        search={search}
        onSearchChange={(v) => {
          setPage(1);
          setSearch(v);
        }}
        searchPlaceholder="Search by name or code…"
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
        createLabel="Add GL Account"
        emptyMessage="No GL accounts yet — create the first one."
        rowActions={(g) => (
          <div className="flex justify-end gap-2">
            {canEdit && <EditIconButton onClick={() => openEdit(g)} />}
            {canCreate && <DeleteIconButton onClick={() => setDeleting(g)} />}
          </div>
        )}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this GL account?"
        message={deleting ? `"${deleting.name} (${deleting.code})" will be removed.` : ""}
        confirmLabel="Delete GL account"
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
            toast.deleted("GL account deleted successfully.");
          }
        }}
      />

      <FormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? "Edit GL Account" : "Add GL Account"}
        subtitle={editing ? `${editing.name} · ${editing.code}` : "Define a new chart-of-accounts entry."}
        error={create.error || update.error}
        footer={
          <div className="flex justify-end gap-3">
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={() => setDrawerOpen(false)}>
              Cancel
            </DivineButton>
            <DivineButton variant="flame" fullWidth={false} type="submit" form="gl-form" loading={create.submitting || update.submitting}>
              {editing ? "Save changes" : "Save"}
            </DivineButton>
          </div>
        }
      >
        <form id="gl-form" onSubmit={submit} noValidate className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DivineInput staticLabel label="Name" error={errors.name?.message} {...register("name")} />
            <DivineInput staticLabel label="Code" error={errors.code?.message} {...register("code")} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Controller
              control={control}
              name="gstType"
              render={({ field }) => (
                <DivineListbox
                  label="GST Type"
                  value={field.value}
                  onChange={field.onChange}
                  options={gstOptions}
                  placeholder="Select GST type"
                  error={errors.gstType?.message}
                />
              )}
            />
            <Controller
              control={control}
              name="groupLevel1"
              render={({ field }) => (
                <DivineListbox
                  label="GL Group — Level 1"
                  value={field.value}
                  onChange={(v) => {
                    field.onChange(v);
                    setValue("groupLevel2", "");
                    setValue("groupLevel3", "");
                  }}
                  options={level1Options}
                  placeholder="Select Level 1"
                  error={errors.groupLevel1?.message}
                />
              )}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Controller
              control={control}
              name="groupLevel2"
              render={({ field }) => (
                <DivineListbox
                  label="GL Group — Level 2 (optional)"
                  value={field.value}
                  onChange={(v) => {
                    field.onChange(v);
                    setValue("groupLevel3", "");
                  }}
                  options={level2Options}
                  placeholder={selectedLevel1 ? "Select Level 2" : "Select Level 1 first"}
                />
              )}
            />
            <Controller
              control={control}
              name="groupLevel3"
              render={({ field }) => (
                <DivineListbox
                  label="GL Group — Level 3 (optional)"
                  value={field.value}
                  onChange={field.onChange}
                  options={level3Options}
                  placeholder={selectedLevel2 ? "Select Level 3" : "Select Level 2 first"}
                />
              )}
            />
          </div>
          <DivineTextarea staticLabel label="Description" error={errors.description?.message} {...register("description")} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <DivineStatusSelect value={field.value} onChange={field.onChange} />
              )}
            />
          </div>
        </form>
      </FormDrawer>
    </>
  );
}
