"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import DataTable, { StatusToggleCell, EditIconButton, DeleteIconButton, MasterImageCell, type DataTableColumn } from "../DataTable";
import FormDrawer from "../FormDrawer";
import ConfirmDialog from "../ConfirmDialog";
import DivineInput from "../../divine/DivineInput";
import DivineTextarea from "../../divine/DivineTextarea";
import DivineStatusSelect from "../../divine/DivineStatusSelect";
import DivineMasterImageUpload from "../../divine/DivineMasterImageUpload";
import DivineButton from "../../divine/DivineButton";
import { api } from "../../../lib/api";
import { useApiResource } from "../../../lib/useApiResource";
import { withOptionalImage } from "../../../lib/withOptionalImage";
import { toast } from "../../../lib/toastStore";
import { patchMasterStatus } from "../../../lib/patchMasterStatus";
import { usePageSize } from "../../../lib/usePageSize";

export type HallPurpose = {
  _id: string;
  name: string;
  description: string;
  image: string | null;
  status: number;
};

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  description: z.string().trim().max(300),
  status: z.number(),
});

type FormValues = z.infer<typeof schema>;

/** Reachable only by a Super Admin — see hall-meal/layout.tsx and the API's superAdminOnly middleware. */
export default function HallPurposePage() {
  const { items, total, list, create, update, remove } = useApiResource<HallPurpose>(api, "/hall-meal/hall-purposes");

  const [image, setImage] = useState<File | null>(null);
  const [imageRemoved, setImageRemoved] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = usePageSize();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<HallPurpose | null>(null);
  const [deleting, setDeleting] = useState<HallPurpose | null>(null);

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
    defaultValues: { name: "", description: "", status: 1 },
  });

  function openCreate() {
    setEditing(null);
    reset({ name: "", description: "", status: 1 });
    setImage(null);
    setImageRemoved(false);
    create.setError(null);
    setDrawerOpen(true);
  }

  function openEdit(row: HallPurpose) {
    setEditing(row);
    reset({ name: row.name, description: row.description, status: row.status });
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
      toast[editing ? "updated" : "created"]("Hall Purpose " + (editing ? "updated" : "created") + " successfully.");
    }
  });

  const columns: DataTableColumn<HallPurpose>[] = [
    { key: "image", label: "Image", render: (r) => <MasterImageCell src={r.image} alt={r.name} /> },
    { key: "name", label: "Purpose Name", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "description", label: "Description", render: (r) => <span className="text-ink-500">{r.description || "—"}</span> },
    {
      key: "status",
      label: "Status",
      render: (r) => <StatusToggleCell status={r.status} canEdit onChange={(status) => patchMasterStatus(update, r._id, status, "Hall Purpose")} />,
    },
  ];

  return (
    <>
      <DataTable
        title="Hall Purpose Master"
        subtitle="Why a Hall or Hall Package is booked — used for Package configuration and Booking classification."
        columns={columns}
        rows={items}
        rowKey={(r) => r._id}
        loading={list.submitting}
        search={search}
        onSearchChange={(v) => { setPage(1); setSearch(v); }}
        searchPlaceholder="Search hall purposes…"
        statusFilter={statusFilter}
        onStatusFilterChange={(v) => { setPage(1); setStatusFilter(v); }}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPage(1); setPageSize(size); }}
        onCreate={openCreate}
        createLabel="Add Hall Purpose"
        emptyMessage="No Hall Purposes yet — create the first one."
        rowActions={(r) => (
          <div className="flex justify-end gap-2">
            <EditIconButton onClick={() => openEdit(r)} />
            <DeleteIconButton onClick={() => setDeleting(r)} />
          </div>
        )}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Deactivate this Hall Purpose?"
        message={deleting ? `"${deleting.name}" will be deactivated. This is blocked while an Active Hall Package still uses it.` : ""}
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
            toast.deleted("Hall Purpose deactivated successfully.");
          }
        }}
      />

      <FormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? "Edit Hall Purpose" : "Add Hall Purpose"}
        subtitle={editing ? editing.name : "Define a new Hall Purpose."}
        error={create.error || update.error}
        footer={
          <div className="flex justify-end gap-3">
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={() => setDrawerOpen(false)}>
              Cancel
            </DivineButton>
            <DivineButton variant="flame" fullWidth={false} type="submit" form="hall-purpose-form" loading={create.submitting || update.submitting}>
              {editing ? "Save changes" : "Save"}
            </DivineButton>
          </div>
        }
      >
        <form id="hall-purpose-form" onSubmit={submit} noValidate className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <DivineInput staticLabel label="Purpose Name" error={errors.name?.message} {...register("name")} />
            <Controller
              control={control}
              name="status"
              render={({ field }) => <DivineStatusSelect value={field.value} onChange={field.onChange} />}
            />
          </div>
          <DivineTextarea staticLabel label="Description" error={errors.description?.message} {...register("description")} />
          <DivineMasterImageUpload
            label="Purpose Image"
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
