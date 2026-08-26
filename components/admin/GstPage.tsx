"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import DataTable, { StatusPill, EditIconButton, DeleteIconButton, type DataTableColumn } from "./DataTable";
import FormDrawer from "./FormDrawer";
import ConfirmDialog from "./ConfirmDialog";
import DivineInput from "../divine/DivineInput";
import DivineDatePicker from "../divine/DivineDatePicker";
import DivineToggle from "../divine/DivineToggle";
import DivineButton from "../divine/DivineButton";
import { formatTempleDate } from "../../lib/datetime";
import { api } from "../../lib/api";
import { useApiResource } from "../../lib/useApiResource";
import { MODULES, usePermissions } from "../../lib/permissions";
import { toast } from "../../lib/toastStore";

export type Gst = {
  _id: string;
  type: string;
  percentage: number;
  code: string;
  effectiveStartDate: string;
  effectiveEndDate: string | null;
  status: number;
};

const schema = z
  .object({
    type: z.string().trim().min(1, "Type is required").max(50),
    percentage: z.number().min(0, "Must be 0-100").max(100, "Must be 0-100"),
    code: z.string().trim().min(1, "Code is required").max(20),
    effectiveStartDate: z.string().min(1, "Start date is required"),
    effectiveEndDate: z.string(),
    status: z.number(),
  })
  .refine((v) => !v.effectiveEndDate || v.effectiveEndDate >= v.effectiveStartDate, {
    message: "End date can't be before the start date.",
    path: ["effectiveEndDate"],
  });

type FormValues = z.infer<typeof schema>;

const DEFAULT_PAGE_SIZE = 10;

export default function GstPage() {
  const { can } = usePermissions();
  const canCreate = can(MODULES.gst, "fullAccess");
  const canEdit = can(MODULES.gst, "edit");
  const { items, total, list, create, update, remove } = useApiResource<Gst>(api, "/masters/gst");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Gst | null>(null);
  const [deleting, setDeleting] = useState<Gst | null>(null);

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
    reset({ type: "", percentage: 0, code: "", effectiveStartDate: "", effectiveEndDate: "", status: 1 });
    create.setError(null);
    setDrawerOpen(true);
  }

  function openEdit(gst: Gst) {
    setEditing(gst);
    reset({
      type: gst.type,
      percentage: gst.percentage,
      code: gst.code,
      effectiveStartDate: gst.effectiveStartDate.slice(0, 10),
      effectiveEndDate: gst.effectiveEndDate ? gst.effectiveEndDate.slice(0, 10) : "",
      status: gst.status,
    });
    update.setError(null);
    setDrawerOpen(true);
  }

  const submit = handleSubmit(async (values) => {
    const payload = { ...values, effectiveEndDate: values.effectiveEndDate || null };
    const ok = editing ? await update.run(editing._id, payload) : await create.run(payload);
    if (ok !== undefined) {
      setDrawerOpen(false);
      if (editing) toast.updated("GST rate updated successfully.");
      else toast.created("GST rate created successfully.");
    }
  });

  const columns: DataTableColumn<Gst>[] = [
    { key: "code", label: "Code", render: (g) => <span className="font-medium tabular-nums text-amber-700">{g.code}</span> },
    { key: "type", label: "Type", render: (g) => g.type },
    { key: "percentage", label: "Percentage", render: (g) => <span className="tabular-nums">{g.percentage}%</span> },
    {
      key: "effective",
      label: "Effective",
      render: (g) => (
        <span className="text-ink-500">
          {formatTempleDate(new Date(g.effectiveStartDate))} –{" "}
          {g.effectiveEndDate ? formatTempleDate(new Date(g.effectiveEndDate)) : "ongoing"}
        </span>
      ),
    },
    { key: "status", label: "Status", render: (g) => <StatusPill status={g.status} /> },
  ];

  return (
    <>
      <DataTable
        title="GST Master"
        subtitle="Tax rates, effective for a date range — referenced by the General Ledger master."
        columns={columns}
        rows={items}
        rowKey={(g) => g._id}
        loading={list.submitting}
        search={search}
        onSearchChange={(v) => {
          setPage(1);
          setSearch(v);
        }}
        searchPlaceholder="Search by type or code…"
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
        createLabel="Add GST"
        emptyMessage="No GST rates yet — create the first one."
        rowActions={(g) => (
          <div className="flex justify-end gap-2">
            {canEdit && <EditIconButton onClick={() => openEdit(g)} />}
            {canCreate && <DeleteIconButton onClick={() => setDeleting(g)} />}
          </div>
        )}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this GST rate?"
        message={deleting ? `"${deleting.type} (${deleting.code})" will be removed.` : ""}
        confirmLabel="Delete GST"
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
            toast.deleted("GST rate deleted successfully.");
          }
        }}
      />

      <FormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? "Edit GST" : "Add GST"}
        subtitle={editing ? `${editing.type} · ${editing.code}` : "Define a new GST rate."}
        error={create.error || update.error}
        footer={
          <div className="flex justify-end gap-3">
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={() => setDrawerOpen(false)}>
              Cancel
            </DivineButton>
            <DivineButton fullWidth={false} type="submit" form="gst-form" loading={create.submitting || update.submitting}>
              {editing ? "Save changes" : "Save"}
            </DivineButton>
          </div>
        }
      >
        <form id="gst-form" onSubmit={submit} noValidate className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DivineInput label="Type" error={errors.type?.message} {...register("type")} />
            <DivineInput label="Code" error={errors.code?.message} {...register("code")} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DivineInput
              label="Percentage"
              type="number"
              step="0.01"
              error={errors.percentage?.message}
              {...register("percentage", { valueAsNumber: true })}
            />
            <Controller
              control={control}
              name="effectiveStartDate"
              render={({ field }) => (
                <DivineDatePicker
                  label="Effective start date"
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.effectiveStartDate?.message}
                />
              )}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Controller
              control={control}
              name="effectiveEndDate"
              render={({ field }) => (
                <DivineDatePicker
                  label="Effective end date"
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Ongoing"
                  hint="Leave empty for a rate with no end date."
                  error={errors.effectiveEndDate?.message}
                />
              )}
            />
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <DivineToggle label="Status" checked={field.value === 1} onChange={(checked) => field.onChange(checked ? 1 : 0)} />
              )}
            />
          </div>
        </form>
      </FormDrawer>
    </>
  );
}
