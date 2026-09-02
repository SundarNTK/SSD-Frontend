"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import DataTable, { StatusPill, EditIconButton, DeleteIconButton, MasterImageCell, type DataTableColumn } from "./DataTable";
import FormDrawer from "./FormDrawer";
import ConfirmDialog from "./ConfirmDialog";
import DivineInput from "../divine/DivineInput";
import DivineTextarea from "../divine/DivineTextarea";
import DivineColorPicker from "../divine/DivineColorPicker";
import DivineImageUpload from "../divine/DivineImageUpload";
import DivineStatusSelect from "../divine/DivineStatusSelect";
import DivineButton from "../divine/DivineButton";
import TamilNameField from "./TamilNameField";
import { api } from "../../lib/api";
import { useApiResource, type WriteBody } from "../../lib/useApiResource";
import { MODULES, usePermissions } from "../../lib/permissions";
import { toast } from "../../lib/toastStore";

export type Category = {
  _id: string;
  name: string;
  tamilName: string;
  code: string;
  displayOrder: number;
  color: string;
  description: string;
  image: string | null;
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

const DEFAULT_PAGE_SIZE = 10;

export default function CategoryPage() {
  const { can } = usePermissions();
  const canCreate = can(MODULES.categories, "fullAccess");
  const canEdit = can(MODULES.categories, "edit");
  const { items, total, list, create, update, remove } = useApiResource<Category>(api, "/masters/categories");

  const [createImage, setCreateImage] = useState<File | null>(null);
  const [editImage, setEditImage] = useState<File | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);

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
  const nameValue = watch("name") ?? "";
  const tamilNameValue = watch("tamilName") ?? "";

  function toPayload(values: FormValues, image: File | null): WriteBody {
    if (!image) return values;
    const form = new FormData();
    Object.entries(values).forEach(([key, val]) => form.append(key, String(val)));
    form.append("image", image);
    return form;
  }

  function openCreate() {
    setEditing(null);
    reset({ name: "", tamilName: "", code: "", displayOrder: 0, color: "#942237", description: "", status: 1 });
    setCreateImage(null);
    create.setError(null);
    setDrawerOpen(true);
  }

  function openEdit(category: Category) {
    setEditing(category);
    reset({
      name: category.name,
      tamilName: category.tamilName,
      code: category.code,
      displayOrder: category.displayOrder,
      color: category.color,
      description: category.description,
      status: category.status,
    });
    setEditImage(null);
    update.setError(null);
    setDrawerOpen(true);
  }

  const submit = handleSubmit(async (values) => {
    const ok = editing
      ? await update.run(editing._id, toPayload(values, editImage))
      : await create.run(toPayload(values, createImage));
    if (ok !== undefined) {
      setDrawerOpen(false);
      if (editing) toast.updated("Category updated successfully.");
      else toast.created("Category created successfully.");
    }
  });

  const columns: DataTableColumn<Category>[] = [
    {
      key: "image",
      label: "Image",
      render: (c) => <MasterImageCell src={c.image} alt={c.name} />,
    },
    {
      key: "name",
      label: "Name",
      render: (c) => <span className="font-medium">{c.name}</span>,
    },
    {
      key: "color",
      label: "Color",
      render: (c) => (
        <span className="inline-flex items-center gap-2">
          <span className="h-5 w-5 rounded-full border border-gold-500/25" style={{ backgroundColor: c.color }} />
        </span>
      ),
    },
    { key: "tamilName", label: "Tamil Name", render: (c) => <span className="text-ink-500">{c.tamilName || "—"}</span> },
    { key: "code", label: "Code", render: (c) => <span className="tabular-nums text-amber-700">{c.code}</span> },
    { key: "displayOrder", label: "Order", render: (c) => <span className="tabular-nums text-ink-500">{c.displayOrder}</span> },
    { key: "status", label: "Status", render: (c) => <StatusPill status={c.status} /> },
  ];

  return (
    <>
      <DataTable
        title="Category Management"
        subtitle="Item categories, with the colour and image used across the POS and customer portal."
        columns={columns}
        rows={items}
        rowKey={(c) => c._id}
        loading={list.submitting}
        search={search}
        onSearchChange={(v) => {
          setPage(1);
          setSearch(v);
        }}
        searchPlaceholder="Search categories…"
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
        createLabel="Add Category"
        emptyMessage="No categories yet — create the first one."
        rowActions={(c) => (
          <div className="flex justify-end gap-2">
            {canEdit && <EditIconButton onClick={() => openEdit(c)} />}
            {canCreate && <DeleteIconButton onClick={() => setDeleting(c)} />}
          </div>
        )}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this category?"
        message={deleting ? `"${deleting.name}" will be removed.` : ""}
        confirmLabel="Delete category"
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
            toast.deleted("Category deleted successfully.");
          }
        }}
      />

      <FormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? "Edit Category" : "Add Category"}
        subtitle={editing ? editing.name : "Define a new item category."}
        error={create.error || update.error}
        footer={
          <div className="flex justify-end gap-3">
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={() => setDrawerOpen(false)}>
              Cancel
            </DivineButton>
            <DivineButton variant="flame" fullWidth={false} type="submit" form="category-form" loading={create.submitting || update.submitting}>
              {editing ? "Save changes" : "Save"}
            </DivineButton>
          </div>
        }
      >
        <form id="category-form" onSubmit={submit} noValidate className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <DivineInput staticLabel label="Category Name" error={errors.name?.message} {...register("name")} />
            <TamilNameField staticLabel
              englishName={nameValue}
              value={tamilNameValue}
              onChange={(v) => setValue("tamilName", v, { shouldDirty: true })}
              error={errors.tamilName?.message}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <DivineInput staticLabel label="Category Code" error={errors.code?.message} {...register("code")} />
            <DivineInput staticLabel
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
                <DivineColorPicker label="Category Colour" value={field.value} onChange={field.onChange} error={errors.color?.message} />
              )}
            />
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <DivineStatusSelect value={field.value} onChange={field.onChange} />
              )}
            />
          </div>
          <DivineTextarea staticLabel label="Description" error={errors.description?.message} {...register("description")} />
          <DivineImageUpload
            label="Category Image"
            value={editing?.image}
            onChange={editing ? setEditImage : setCreateImage}
          />
        </form>
      </FormDrawer>
    </>
  );
}
