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
import DivineStatusSelect from "../divine/DivineStatusSelect";
import DivineButton from "../divine/DivineButton";
import DivineImageUpload from "../divine/DivineImageUpload";
import DivineListbox, { type ListboxOption } from "../divine/DivineListbox";
import TamilNameField from "./TamilNameField";
import { api, unwrap, type ApiEnvelope } from "../../lib/api";
import { useApiResource } from "../../lib/useApiResource";
import { MODULES, usePermissions } from "../../lib/permissions";
import { toast } from "../../lib/toastStore";
import { withOptionalImage } from "../../lib/withOptionalImage";

export type SubCategory = {
  _id: string;
  name: string;
  tamilName: string;
  code: string;
  displayOrder: number;
  color: string;
  description: string;
  status: number;
  image: string | null;
  category?: { _id: string; name: string } | null;
};

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  tamilName: z.string().trim(),
  code: z.string().trim().min(1, "Code is required").max(30),
  category: z.string().min(1, "Category is required"),
  displayOrder: z.number().int().min(0),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Enter a valid hex colour"),
  description: z.string().trim().max(300),
  status: z.number(),
});

type FormValues = z.infer<typeof schema>;

const DEFAULT_PAGE_SIZE = 10;

async function fetchCategoryOptions(): Promise<ListboxOption[]> {
  const res = await api.get<ApiEnvelope<{ items: { _id: string; name: string }[] }>>(
    "/masters/categories",
    { params: { status: 1, pageSize: 100 } }
  );
  return unwrap(res).items.map((c) => ({ value: c._id, label: c.name }));
}

export default function SubCategoryPage() {
  const { can } = usePermissions();
  const canCreate = can(MODULES.subCategories, "fullAccess");
  const canEdit = can(MODULES.subCategories, "edit");
  const { items, total, list, create, update, remove } = useApiResource<SubCategory>(api, "/masters/sub-categories");

  const [categoryOptions, setCategoryOptions] = useState<ListboxOption[]>([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<SubCategory | null>(null);
  const [deleting, setDeleting] = useState<SubCategory | null>(null);
  const [createImage, setCreateImage] = useState<File | null>(null);
  const [editImage, setEditImage] = useState<File | null>(null);

  // Load category dropdown once on mount
  useEffect(() => {
    fetchCategoryOptions().then(setCategoryOptions).catch(() => {});
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
  const nameValue = watch("name") ?? "";
  const tamilNameValue = watch("tamilName") ?? "";

  function openCreate() {
    setEditing(null);
    reset({ name: "", tamilName: "", code: "", category: "", displayOrder: 0, color: "#942237", description: "", status: 1 });
    setCreateImage(null);
    create.setError(null);
    setDrawerOpen(true);
  }

  function openEdit(sub: SubCategory) {
    setEditing(sub);
    reset({
      name: sub.name,
      tamilName: sub.tamilName,
      code: sub.code,
      category: sub.category?._id ?? "",
      displayOrder: sub.displayOrder,
      color: sub.color,
      description: sub.description,
      status: sub.status,
    });
    setEditImage(null);
    update.setError(null);
    setDrawerOpen(true);
  }

  const submit = handleSubmit(async (values) => {
    const payload = withOptionalImage(values, editing ? editImage : createImage);
    const ok = editing ? await update.run(editing._id, payload) : await create.run(payload);
    if (ok !== undefined) {
      setDrawerOpen(false);
      if (editing) toast.updated("Sub category updated successfully.");
      else toast.created("Sub category created successfully.");
    }
  });

  const columns: DataTableColumn<SubCategory>[] = [
    {
      key: "image",
      label: "Image",
      render: (s) => <MasterImageCell src={s.image} alt={s.name} />,
    },
    {
      key: "name",
      label: "Name",
      render: (s) => <span className="font-medium">{s.name}</span>,
    },
    {
      key: "color",
      label: "Color",
      render: (s) => (
        <span className="inline-flex h-5 w-5 rounded-full border border-gold-500/25" style={{ backgroundColor: s.color }} />
      ),
    },
    {
      key: "category",
      label: "Category",
      render: (s) => <span className="text-ink-500">{s.category?.name ?? "—"}</span>,
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
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPage(1);
          setPageSize(size);
        }}
        onCreate={canCreate ? openCreate : undefined}
        createLabel="Add Sub Category"
        emptyMessage="No sub categories yet — create the first one."
        rowActions={(s) => (
          <div className="flex justify-end gap-2">
            {canEdit && <EditIconButton onClick={() => openEdit(s)} />}
            {canCreate && <DeleteIconButton onClick={() => setDeleting(s)} />}
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
          <div className="flex justify-end gap-3">
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={() => setDrawerOpen(false)}>
              Cancel
            </DivineButton>
            <DivineButton variant="flame" fullWidth={false} type="submit" form="sub-category-form" loading={create.submitting || update.submitting}>
              {editing ? "Save changes" : "Save"}
            </DivineButton>
          </div>
        }
      >
        <form id="sub-category-form" onSubmit={submit} noValidate className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <DivineInput staticLabel label="Sub Category Name" error={errors.name?.message} {...register("name")} />
            <TamilNameField staticLabel
              englishName={nameValue}
              value={tamilNameValue}
              onChange={(v) => setValue("tamilName", v, { shouldDirty: true })}
              error={errors.tamilName?.message}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <DivineInput staticLabel label="Sub Category Code" error={errors.code?.message} {...register("code")} />
            <DivineInput staticLabel
              label="Display Order"
              type="number"
              error={errors.displayOrder?.message}
              {...register("displayOrder", { valueAsNumber: true })}
            />
          </div>
          {/* Category selector — full width so the dropdown has enough room */}
          <Controller
            control={control}
            name="category"
            render={({ field }) => (
              <DivineListbox
                label="Category"
                value={field.value}
                onChange={field.onChange}
                options={categoryOptions}
                placeholder="Select a category…"
                error={errors.category?.message}
              />
            )}
          />
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
                <DivineStatusSelect value={field.value} onChange={field.onChange} />
              )}
            />
          </div>
          <DivineTextarea staticLabel label="Description" error={errors.description?.message} {...register("description")} />
          <DivineImageUpload
            label="Sub Category Image"
            value={editing?.image}
            onChange={editing ? setEditImage : setCreateImage}
          />
        </form>
      </FormDrawer>
    </>
  );
}
