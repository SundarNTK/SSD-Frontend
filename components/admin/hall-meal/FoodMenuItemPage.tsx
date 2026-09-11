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
import DivineListbox from "../../divine/DivineListbox";
import DivineStatusSelect from "../../divine/DivineStatusSelect";
import DivineMasterImageUpload from "../../divine/DivineMasterImageUpload";
import DivineButton from "../../divine/DivineButton";
import { api } from "../../../lib/api";
import { useApiResource } from "../../../lib/useApiResource";
import { toast } from "../../../lib/toastStore";
import { withOptionalImage } from "../../../lib/withOptionalImage";
import { patchMasterStatus } from "../../../lib/patchMasterStatus";
import { usePageSize } from "../../../lib/usePageSize";

export type PricingBasis = "per-pax" | "per-unit" | "per-pack" | "per-tub";

export type FoodMenuItem = {
  _id: string;
  name: string;
  itemCategory: string;
  description: string;
  pricingBasis: PricingBasis;
  cost: number;
  image: string | null;
  status: number;
};

const PRICING_BASIS_OPTIONS = [
  { value: "per-pax", label: "Per Pax" },
  { value: "per-unit", label: "Per Unit" },
  { value: "per-pack", label: "Per Pack / Quantity" },
  { value: "per-tub", label: "Per Tub" },
];

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(150),
  itemCategory: z.string().trim().min(1, "Item Category is required").max(100),
  description: z.string().trim().max(300),
  pricingBasis: z.enum(["per-pax", "per-unit", "per-pack", "per-tub"], { message: "Select a Pricing Basis" }),
  cost: z.number().min(0, "Cost cannot be negative"),
  status: z.number(),
});

type FormValues = z.infer<typeof schema>;

/** Reachable only by a Super Admin — see hall-meal/layout.tsx and the API's superAdminOnly middleware. */
export default function FoodMenuItemPage() {
  const { items, total, list, create, update, remove } = useApiResource<FoodMenuItem>(api, "/hall-meal/food-menu-items");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = usePageSize();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<FoodMenuItem | null>(null);
  const [deleting, setDeleting] = useState<FoodMenuItem | null>(null);
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
    defaultValues: { name: "", itemCategory: "", description: "", pricingBasis: "per-pax", cost: 0, status: 1 },
  });

  function openCreate() {
    setEditing(null);
    reset({ name: "", itemCategory: "", description: "", pricingBasis: "per-pax", cost: 0, status: 1 });
    setImage(null);
    setImageRemoved(false);
    create.setError(null);
    setDrawerOpen(true);
  }

  function openEdit(row: FoodMenuItem) {
    setEditing(row);
    reset({ name: row.name, itemCategory: row.itemCategory, description: row.description, pricingBasis: row.pricingBasis, cost: row.cost, status: row.status });
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
      toast[editing ? "updated" : "created"]("Food Menu Item " + (editing ? "updated" : "created") + " successfully.");
    }
  });

  const pricingLabel = (v: PricingBasis) => PRICING_BASIS_OPTIONS.find((o) => o.value === v)?.label ?? v;

  const columns: DataTableColumn<FoodMenuItem>[] = [
    { key: "image", label: "Image", render: (r) => <MasterImageCell src={r.image} alt={r.name} /> },
    { key: "name", label: "Menu Item Name", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "itemCategory", label: "Item Category", render: (r) => <span>{r.itemCategory}</span> },
    { key: "pricingBasis", label: "Pricing Basis", render: (r) => <span>{pricingLabel(r.pricingBasis)}</span> },
    { key: "cost", label: "Cost", render: (r) => <span className="tabular-nums">{r.cost.toFixed(2)}</span> },
    {
      key: "status",
      label: "Status",
      render: (r) => <StatusToggleCell status={r.status} canEdit onChange={(status) => patchMasterStatus(update, r._id, status, "Food Menu Item")} />,
    },
  ];

  return (
    <>
      <DataTable
        title="Food Menu Item Master"
        subtitle="Individual dishes, priced Per Pax, Per Unit, Per Pack or Per Tub — used to build Food Packages and additional food selections."
        columns={columns}
        rows={items}
        rowKey={(r) => r._id}
        loading={list.submitting}
        search={search}
        onSearchChange={(v) => { setPage(1); setSearch(v); }}
        searchPlaceholder="Search menu items…"
        statusFilter={statusFilter}
        onStatusFilterChange={(v) => { setPage(1); setStatusFilter(v); }}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPage(1); setPageSize(size); }}
        onCreate={openCreate}
        createLabel="Add Menu Item"
        emptyMessage="No Food Menu Items yet — create the first one."
        rowActions={(r) => (
          <div className="flex justify-end gap-2">
            <EditIconButton onClick={() => openEdit(r)} />
            <DeleteIconButton onClick={() => setDeleting(r)} />
          </div>
        )}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Deactivate this Menu Item?"
        message={deleting ? `"${deleting.name}" will be deactivated. This is blocked while an Active Food Package still uses it.` : ""}
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
            toast.deleted("Food Menu Item deactivated successfully.");
          }
        }}
      />

      <FormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? "Edit Menu Item" : "Add Menu Item"}
        subtitle={editing ? editing.name : "Define a new Food Menu Item."}
        error={create.error || update.error}
        footer={
          <div className="flex justify-end gap-3">
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={() => setDrawerOpen(false)}>
              Cancel
            </DivineButton>
            <DivineButton variant="flame" fullWidth={false} type="submit" form="food-menu-item-form" loading={create.submitting || update.submitting}>
              {editing ? "Save changes" : "Save"}
            </DivineButton>
          </div>
        }
      >
        <form id="food-menu-item-form" onSubmit={submit} noValidate className="space-y-5">
          <DivineInput staticLabel label="Menu Item Name" error={errors.name?.message} {...register("name")} />
          <div className="grid grid-cols-2 gap-4">
            <DivineInput staticLabel label="Item Category" error={errors.itemCategory?.message} {...register("itemCategory")} />
            <Controller
              control={control}
              name="status"
              render={({ field }) => <DivineStatusSelect value={field.value} onChange={field.onChange} />}
            />
          </div>
          <DivineTextarea staticLabel label="Description" error={errors.description?.message} {...register("description")} />
          <div className="grid grid-cols-2 gap-4">
            <Controller
              control={control}
              name="pricingBasis"
              render={({ field }) => (
                <DivineListbox
                  label="Pricing Basis"
                  value={field.value}
                  onChange={(v) => field.onChange(v as PricingBasis)}
                  options={PRICING_BASIS_OPTIONS}
                  clearable={false}
                  error={errors.pricingBasis?.message}
                />
              )}
            />
            <DivineInput
              staticLabel
              label="Cost"
              type="number"
              error={errors.cost?.message}
              {...register("cost", { valueAsNumber: true })}
            />
          </div>
          <DivineMasterImageUpload
            label="Menu Item Image"
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
