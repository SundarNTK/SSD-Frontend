"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import DataTable, { StatusPill, type DataTableColumn } from "./DataTable";
import FormDrawer from "./FormDrawer";
import ConfirmDialog from "./ConfirmDialog";
import DivineInput from "../divine/DivineInput";
import DivineListbox from "../divine/DivineListbox";
import DivineColorPicker from "../divine/DivineColorPicker";
import DivineButton from "../divine/DivineButton";
import { api } from "../../lib/api";
import { useApiResource } from "../../lib/useApiResource";
import { MODULES, usePermissions } from "../../lib/permissions";
import { toast } from "../../lib/toastStore";

export type SubCategory = {
  _id: string;
  name: string;
  tamilName: string;
  code: string;
  displayOrder: number;
  color: string;
  description: string;
  status: number;
};

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  tamilName: z.string().trim(),
  code: z.string().trim().min(1, "Code is required").max(30),
  displayOrder: z.number().int().min(0),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Enter a valid hex colour"),
  description: z.string().trim().max(300),
  status: z.number(),
});

type FormValues = z.infer<typeof schema>;

const PAGE_SIZE = 20;
const STATUS_OPTIONS = [
  { value: "1", label: "Active" },
  { value: "0", label: "Inactive" },
];

export default function SubCategoryPage() {
  const { can } = usePermissions();
  const canCreate = can(MODULES.subCategories, "fullAccess");
  const canEdit = can(MODULES.subCategories, "edit");
  const { items, total, list, create, update, remove } = useApiResource<SubCategory>(api, "/masters/sub-categories");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<SubCategory | null>(null);
  const [deleting, setDeleting] = useState<SubCategory | null>(null);

  useEffect(() => {
    list.run({ page, pageSize: PAGE_SIZE, search: search || undefined, status: statusFilter || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, statusFilter]);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  function openCreate() {
    setEditing(null);
    reset({ name: "", tamilName: "", code: "", displayOrder: 0, color: "#942237", description: "", status: 1 });
    create.setError(null);
    setDrawerOpen(true);
  }

  function openEdit(sub: SubCategory) {
    setEditing(sub);
    reset({
      name: sub.name,
      tamilName: sub.tamilName,
      code: sub.code,
      displayOrder: sub.displayOrder,
      color: sub.color,
      description: sub.description,
      status: sub.status,
    });
    update.setError(null);
    setDrawerOpen(true);
  }

  const submit = handleSubmit(async (values) => {
    const ok = editing ? await update.run(editing._id, values) : await create.run(values);
    if (ok !== undefined) {
      setDrawerOpen(false);
      if (editing) toast.updated("Sub category updated successfully.");
      else toast.created("Sub category created successfully.");
    }
  });

  const columns: DataTableColumn<SubCategory>[] = [
    {
      key: "name",
      label: "Name",
      render: (s) => (
        <span className="flex items-center gap-2.5">
          <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-gold-500/20" style={{ backgroundColor: s.color }} />
          <span className="font-medium">{s.name}</span>
        </span>
      ),
    },
    { key: "tamilName", label: "Tamil Name", render: (s) => <span className="text-ink-500">{s.tamilName || "—"}</span> },
    { key: "code", label: "Code", render: (s) => <span className="tabular-nums text-amber-700">{s.code}</span> },
    { key: "displayOrder", label: "Order", render: (s) => <span className="tabular-nums text-ink-500">{s.displayOrder}</span> },
    { key: "status", label: "Status", render: (s) => <StatusPill status={s.status} /> },
  ];

  return (
    <>
      <DataTable
        title="Sub Category Management"
        subtitle="Finer-grained groupings under a category, picked per row in the Item master."
        columns={columns}
        rows={items}
        rowKey={(s) => s._id}
        loading={list.submitting}
        search={search}
        onSearchChange={(v) => {
          setPage(1);
          setSearch(v);
        }}
        searchPlaceholder="Search sub categories…"
        statusFilter={statusFilter}
        onStatusFilterChange={(v) => {
          setPage(1);
          setStatusFilter(v);
        }}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
        onCreate={canCreate ? openCreate : undefined}
        createLabel="Add Sub Category"
        emptyMessage="No sub categories yet — create the first one."
        rowActions={(s) => (
          <div className="flex justify-end gap-3">
            {canEdit && (
              <button onClick={() => openEdit(s)} className="text-[12.5px] text-ink-300 hover:text-ink-100 hover:underline">
                Edit
              </button>
            )}
            {canCreate && (
              <button onClick={() => setDeleting(s)} className="text-[12.5px] text-crimson-500 hover:underline">
                Delete
              </button>
            )}
          </div>
        )}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this sub category?"
        message={deleting ? `"${deleting.name}" will be removed.` : ""}
        confirmLabel="Delete sub category"
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
            toast.deleted("Sub category deleted successfully.");
          }
        }}
      />

      <FormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? "Edit Sub Category" : "Add Sub Category"}
        subtitle={editing ? editing.name : "Define a new sub category."}
        error={create.error || update.error}
        footer={
          <div className="flex gap-3">
            <DivineButton variant="ghost" type="button" onClick={() => setDrawerOpen(false)}>
              Cancel
            </DivineButton>
            <DivineButton type="submit" form="sub-category-form" loading={create.submitting || update.submitting}>
              {editing ? "Save changes" : "Save"}
            </DivineButton>
          </div>
        }
      >
        <form id="sub-category-form" onSubmit={submit} noValidate className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <DivineInput label="Sub Category Name" error={errors.name?.message} {...register("name")} />
            <DivineInput label="Tamil Name" error={errors.tamilName?.message} {...register("tamilName")} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <DivineInput label="Sub Category Code" error={errors.code?.message} {...register("code")} />
            <DivineInput
              label="Display Order"
              type="number"
              error={errors.displayOrder?.message}
              {...register("displayOrder", { valueAsNumber: true })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Controller
              control={control}
              name="color"
              render={({ field }) => (
                <DivineColorPicker label="Sub Category Colour" value={field.value} onChange={field.onChange} error={errors.color?.message} />
              )}
            />
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <DivineListbox
                  label="Status"
                  value={String(field.value)}
                  onChange={(v) => field.onChange(Number(v))}
                  options={STATUS_OPTIONS}
                />
              )}
            />
          </div>
          <DivineInput label="Description" error={errors.description?.message} {...register("description")} />
        </form>
      </FormDrawer>
    </>
  );
}
