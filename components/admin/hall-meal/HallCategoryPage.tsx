"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import DataTable, { StatusToggleCell, EditIconButton, DeleteIconButton, MasterImageCell, type DataTableColumn } from "../DataTable";
import FormDrawer from "../FormDrawer";
import ConfirmDialog from "../ConfirmDialog";
import DivineInput from "../../divine/DivineInput";
import DivineStatusSelect from "../../divine/DivineStatusSelect";
import DivineMasterImageUpload from "../../divine/DivineMasterImageUpload";
import DivineButton from "../../divine/DivineButton";
import { api } from "../../../lib/api";
import { useApiResource } from "../../../lib/useApiResource";
import { toast } from "../../../lib/toastStore";
import { withOptionalImage } from "../../../lib/withOptionalImage";
import { patchMasterStatus } from "../../../lib/patchMasterStatus";
import { usePageSize } from "../../../lib/usePageSize";

export type HallCategory = {
  _id: string;
  name: string;
  code: string;
  image: string | null;
  status: number;
};

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  code: z.string().trim().min(1, "Code is required").max(30),
  status: z.number(),
});

type FormValues = z.infer<typeof schema>;

/**
 * Reachable only by a Super Admin — see the `hall-meal` route group's
 * layout.tsx and SSD-Backend's `superAdminOnly` middleware. Unlike
 * CategoryPage there is no `usePermissions().can()` gating here: there's
 * no partial-access tier for this area, so create/edit are always on.
 */
export default function HallCategoryPage() {
  const { items, total, list, create, update, remove } = useApiResource<HallCategory>(api, "/hall-meal/hall-categories");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = usePageSize();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<HallCategory | null>(null);
  const [deleting, setDeleting] = useState<HallCategory | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [imageRemoved, setImageRemoved] = useState(false);

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
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", code: "", status: 1 },
  });

  function openCreate() {
    setEditing(null);
    reset({ name: "", code: "", status: 1 });
    setImage(null);
    setImageRemoved(false);
    create.setError(null);
    setDrawerOpen(true);
  }

  function openEdit(row: HallCategory) {
    setEditing(row);
    reset({ name: row.name, code: row.code, status: row.status });
    setImage(null);
    setImageRemoved(false);
    update.setError(null);
    setDrawerOpen(true);
  }

  const submit = handleSubmit(async (values) => {
    const payload = withOptionalImage(values, image, { existingValue: editing?.image ?? null, imageRemoved });
    const ok = editing ? await update.run(editing._id, payload) : await create.run(payload);
    if (ok !== undefined) {
      setDrawerOpen(false);
      toast[editing ? "updated" : "created"]("Hall Category " + (editing ? "updated" : "created") + " successfully.");
    }
  });

  const columns: DataTableColumn<HallCategory>[] = [
    { key: "image", label: "Image", render: (r) => <MasterImageCell src={r.image} alt={r.name} /> },
    { key: "name", label: "Category Name", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "code", label: "Category Code", render: (r) => <span className="tabular-nums text-amber-700">{r.code}</span> },
    {
      key: "status",
      label: "Status",
      render: (r) => (
        <StatusToggleCell status={r.status} canEdit onChange={(status) => patchMasterStatus(update, r._id, status, "Hall Category")} />
      ),
    },
  ];

  return (
    <>
      <DataTable
        title="Hall Category Master"
        subtitle="Groups Halls by type — Wedding, Dining, Function, Multipurpose."
        columns={columns}
        rows={items}
        rowKey={(r) => r._id}
        loading={list.submitting}
        search={search}
        onSearchChange={(v) => { setPage(1); setSearch(v); }}
        searchPlaceholder="Search hall categories…"
        statusFilter={statusFilter}
        onStatusFilterChange={(v) => { setPage(1); setStatusFilter(v); }}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPage(1); setPageSize(size); }}
        onCreate={openCreate}
        createLabel="Add Hall Category"
        emptyMessage="No Hall Categories yet — create the first one."
        rowActions={(r) => (
          <div className="flex justify-end gap-2">
            <EditIconButton onClick={() => openEdit(r)} />
            <DeleteIconButton onClick={() => setDeleting(r)} />
          </div>
        )}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Deactivate this Hall Category?"
        message={deleting ? `"${deleting.name}" will be deactivated. This is blocked while an Active Hall is still mapped to it.` : ""}
        confirmLabel="Deactivate"
        tone="danger"
        error={remove.error}
        loading={remove.submitting}
        onCancel={() => { remove.setError(null); setDeleting(null); }}
        onConfirm={async () => {
          if (!deleting) return;
          const ok = await remove.run(deleting._id);
          if (ok !== undefined) {
            setDeleting(null);
            toast.deleted("Hall Category deactivated successfully.");
          }
        }}
      />

      <FormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? "Edit Hall Category" : "Add Hall Category"}
        subtitle={editing ? editing.name : "Define a new Hall Category."}
        error={create.error || update.error}
        footer={
          <div className="flex justify-end gap-3">
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={() => setDrawerOpen(false)}>
              Cancel
            </DivineButton>
            <DivineButton variant="flame" fullWidth={false} type="submit" form="hall-category-form" loading={create.submitting || update.submitting}>
              {editing ? "Save changes" : "Save"}
            </DivineButton>
          </div>
        }
      >
        <form id="hall-category-form" onSubmit={submit} noValidate className="space-y-5">
          <DivineInput staticLabel label="Category Name" error={errors.name?.message} {...register("name")} />
          <div className="grid grid-cols-2 gap-4">
            <DivineInput staticLabel label="Category Code" error={errors.code?.message} {...register("code")} />
            <Controller
              control={control}
              name="status"
              render={({ field }) => <DivineStatusSelect value={field.value} onChange={field.onChange} />}
            />
          </div>
          <DivineMasterImageUpload
            label="Category Image"
            value={editing?.image}
            onChange={(file) => {
              setImage(file);
              setImageRemoved(!file);
            }}
          />
        </form>
      </FormDrawer>
    </>
  );
}
