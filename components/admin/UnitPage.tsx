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
import { api } from "../../lib/api";
import { useApiResource } from "../../lib/useApiResource";
import { MODULES, usePermissions } from "../../lib/permissions";
import { toast } from "../../lib/toastStore";
import { patchMasterStatus } from "../../lib/patchMasterStatus";

export type Unit = {
  _id: string;
  unitCode: string;
  unitName: string;
  description: string;
  status: number;
  createdAt: string;
};

const schema = z.object({
  unitCode: z.string().trim().min(1, "Unit code is required").max(20),
  unitName: z.string().trim().min(1, "Unit name is required").max(100),
  description: z.string().trim().max(300),
  status: z.number(),
});

type FormValues = z.infer<typeof schema>;

const DEFAULT_PAGE_SIZE = 10;

export default function UnitPage() {
  const { can } = usePermissions();
  const canCreate = can(MODULES.units, "fullAccess");
  const canEdit = can(MODULES.units, "edit");
  const { items, total, list, create, update, remove } = useApiResource<Unit>(api, "/masters/units");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Unit | null>(null);
  const [deleting, setDeleting] = useState<Unit | null>(null);

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
    reset({ unitCode: "", unitName: "", description: "", status: 1 });
    create.setError(null);
    setDrawerOpen(true);
  }

  function openEdit(unit: Unit) {
    setEditing(unit);
    reset({ unitCode: unit.unitCode, unitName: unit.unitName, description: unit.description, status: unit.status });
    update.setError(null);
    setDrawerOpen(true);
  }

  const submit = handleSubmit(async (values) => {
    const ok = editing ? await update.run(editing._id, values) : await create.run(values);
    if (ok !== undefined) {
      setDrawerOpen(false);
      if (editing) toast.updated("Unit updated successfully.");
      else toast.created("Unit created successfully.");
    }
  });

  const columns: DataTableColumn<Unit>[] = [
    { key: "unitCode", label: "Unit Code", render: (u) => <span className="font-medium tabular-nums text-amber-700">{u.unitCode}</span> },
    { key: "unitName", label: "Unit Name", render: (u) => <span className="font-medium">{u.unitName}</span> },
    {
      key: "description",
      label: "Description",
      render: (u) => <span className="text-ink-500">{u.description || "—"}</span>,
    },
    { key: "status", label: "Status", render: (u) => (
      <StatusToggleCell status={u.status} canEdit={canEdit} onChange={(status) => patchMasterStatus(update, u._id, status, "Unit")} />
    ) },
  ];

  return (
    <>
      <DataTable
        title="Unit Master"
        subtitle="Units of measure available for Inventory-applicable items."
        columns={columns}
        rows={items}
        rowKey={(u) => u._id}
        loading={list.submitting}
        search={search}
        onSearchChange={(v) => {
          setPage(1);
          setSearch(v);
        }}
        searchPlaceholder="Search units…"
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
        createLabel="Add Unit"
        emptyMessage="No units yet — create the first one."
        rowActions={(u) => (
          <div className="flex justify-end gap-2">
            {canEdit && <EditIconButton onClick={() => openEdit(u)} />}
            {canCreate && <DeleteIconButton onClick={() => setDeleting(u)} />}
          </div>
        )}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this unit?"
        message={deleting ? `"${deleting.unitName} (${deleting.unitCode})" will be removed.` : ""}
        confirmLabel="Delete unit"
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
            toast.deleted("Unit deleted successfully.");
          }
        }}
      />

      <FormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? "Edit Unit" : "Add Unit"}
        subtitle={editing ? `${editing.unitName} · ${editing.unitCode}` : "Define a new unit of measure."}
        error={create.error || update.error}
        footer={
          <div className="flex justify-end gap-3">
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={() => setDrawerOpen(false)}>
              Cancel
            </DivineButton>
            <DivineButton variant="flame" fullWidth={false} type="submit" form="unit-form" loading={create.submitting || update.submitting}>
              {editing ? "Save changes" : "Save"}
            </DivineButton>
          </div>
        }
      >
        <form id="unit-form" onSubmit={submit} noValidate className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DivineInput staticLabel label="Unit Code" error={errors.unitCode?.message} {...register("unitCode")} />
            <DivineInput staticLabel label="Unit Name" error={errors.unitName?.message} {...register("unitName")} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Controller
              control={control}
              name="status"
              render={({ field }) => <DivineStatusSelect value={field.value} onChange={field.onChange} />}
            />
          </div>
          <DivineTextarea staticLabel label="Description" error={errors.description?.message} {...register("description")} />
        </form>
      </FormDrawer>
    </>
  );
}
