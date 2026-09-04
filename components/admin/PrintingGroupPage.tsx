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

export type PrintingGroup = {
  _id: string;
  code: string;
  name: string;
  description: string;
  status: number;
  createdAt: string;
};

const schema = z.object({
  code: z.string().trim().min(1, "Code is required").max(20),
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  description: z.string().trim().max(300),
  status: z.number(),
});

type FormValues = z.infer<typeof schema>;

const DEFAULT_PAGE_SIZE = 10;

export default function PrintingGroupPage() {
  const { can } = usePermissions();
  const canCreate = can(MODULES.printingGroups, "fullAccess");
  const canEdit = can(MODULES.printingGroups, "edit");
  const { items, total, list, create, update, remove } = useApiResource<PrintingGroup>(api, "/masters/printing-groups");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
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
    { key: "code", label: "Code", render: (g) => <span className="font-medium tabular-nums text-amber-700">{g.code}</span> },
    { key: "name", label: "Name", render: (g) => <span className="font-medium">{g.name}</span> },
    {
      key: "description",
      label: "Description",
      render: (g) => <span className="text-ink-500">{g.description || "—"}</span>,
    },
    { key: "status", label: "Status", render: (g) => (
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
      </FormDrawer>
    </>
  );
}
