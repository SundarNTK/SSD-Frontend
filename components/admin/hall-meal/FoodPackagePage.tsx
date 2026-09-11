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
import DivineMultiSelect from "../../divine/DivineMultiSelect";
import DivineToggle from "../../divine/DivineToggle";
import DivineStatusSelect from "../../divine/DivineStatusSelect";
import DivineMasterImageUpload from "../../divine/DivineMasterImageUpload";
import DivineButton from "../../divine/DivineButton";
import { api } from "../../../lib/api";
import { useApiResource, type WriteBody } from "../../../lib/useApiResource";
import { toast } from "../../../lib/toastStore";
import { withOptionalImage } from "../../../lib/withOptionalImage";
import { patchMasterStatus } from "../../../lib/patchMasterStatus";
import { usePageSize } from "../../../lib/usePageSize";

type MenuItemRef = { menuItem: { _id: string; name: string } | string; includedInPackage: boolean };
type MenuItemOption = { _id: string; name: string };

export type FoodPackage = {
  _id: string;
  name: string;
  description: string;
  packagePricePerPax: number;
  minimumBookingCount: number;
  menuItems: MenuItemRef[];
  gstApplicable: boolean;
  image: string | null;
  status: number;
};

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(150),
  description: z.string().trim().max(1000),
  packagePricePerPax: z.number().min(0),
  minimumBookingCount: z.number().int().min(1, "Must be at least 1"),
  menuItemIds: z.array(z.string()).min(1, "At least one Menu Item is required"),
  gstApplicable: z.boolean(),
  status: z.number(),
});

type FormValues = z.infer<typeof schema>;

const menuItemId = (m: MenuItemRef) => (typeof m.menuItem === "string" ? m.menuItem : m.menuItem._id);
const menuItemName = (m: MenuItemRef) => (typeof m.menuItem === "string" ? m.menuItem : m.menuItem.name);

/** Reachable only by a Super Admin — see hall-meal/layout.tsx and the API's superAdminOnly middleware. */
export default function FoodPackagePage() {
  const { items, total, list, create, update, remove } = useApiResource<FoodPackage>(api, "/hall-meal/food-packages");
  const menuItemResource = useApiResource<MenuItemOption>(api, "/hall-meal/food-menu-items");

  useEffect(() => {
    menuItemResource.list.run({ status: 1, pageSize: 100 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const menuItemOptions = menuItemResource.items.map((m) => ({ value: m._id, label: m.name }));

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = usePageSize();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<FoodPackage | null>(null);
  const [deleting, setDeleting] = useState<FoodPackage | null>(null);
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
    defaultValues: { name: "", description: "", packagePricePerPax: 0, minimumBookingCount: 1, menuItemIds: [], gstApplicable: false, status: 1 },
  });

  function toPayload(values: FormValues): WriteBody {
    const { menuItemIds, ...rest } = values;
    return withOptionalImage(
      { ...rest, menuItems: menuItemIds.map((id) => ({ menuItem: id, includedInPackage: true })) },
      image,
      { existingValue: editing?.image ?? null, imageRemoved }
    );
  }

  function openCreate() {
    setEditing(null);
    reset({ name: "", description: "", packagePricePerPax: 0, minimumBookingCount: 1, menuItemIds: [], gstApplicable: false, status: 1 });
    setImage(null);
    setImageRemoved(false);
    create.setError(null);
    setDrawerOpen(true);
  }

  function openEdit(row: FoodPackage) {
    setEditing(row);
    reset({
      name: row.name,
      description: row.description,
      packagePricePerPax: row.packagePricePerPax,
      minimumBookingCount: row.minimumBookingCount,
      menuItemIds: row.menuItems.map(menuItemId),
      gstApplicable: row.gstApplicable,
      status: row.status,
    });
    setImage(null);
    setImageRemoved(false);
    update.setError(null);
    setDrawerOpen(true);
  }

  const submit = handleSubmit(async (values) => {
    const ok = editing ? await update.run(editing._id, toPayload(values)) : await create.run(toPayload(values));
    if (ok !== undefined) {
      setDrawerOpen(false);
      toast[editing ? "updated" : "created"]("Food Package " + (editing ? "updated" : "created") + " successfully.");
    }
  });

  const columns: DataTableColumn<FoodPackage>[] = [
    { key: "image", label: "Image", render: (r) => <MasterImageCell src={r.image} alt={r.name} /> },
    { key: "name", label: "Food Package Name", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "minimumBookingCount", label: "Min. Pax", render: (r) => <span className="tabular-nums">{r.minimumBookingCount}</span> },
    { key: "packagePricePerPax", label: "Price / Pax", render: (r) => <span className="tabular-nums">{r.packagePricePerPax.toFixed(2)}</span> },
    { key: "menuItems", label: "Menu Items", render: (r) => <span>{r.menuItems.map(menuItemName).join(", ") || "—"}</span> },
    { key: "gstApplicable", label: "GST", render: (r) => <span>{r.gstApplicable ? "Yes" : "No"}</span> },
    {
      key: "status",
      label: "Status",
      render: (r) => <StatusToggleCell status={r.status} canEdit onChange={(status) => patchMasterStatus(update, r._id, status, "Food Package")} />,
    },
  ];

  return (
    <>
      <DataTable
        title="Food Package Management"
        subtitle="A fixed meal set — standard Menu Items, price per pax and a minimum pax requirement — selectable during Hall Booking."
        columns={columns}
        rows={items}
        rowKey={(r) => r._id}
        loading={list.submitting}
        search={search}
        onSearchChange={(v) => { setPage(1); setSearch(v); }}
        searchPlaceholder="Search food packages…"
        statusFilter={statusFilter}
        onStatusFilterChange={(v) => { setPage(1); setStatusFilter(v); }}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPage(1); setPageSize(size); }}
        onCreate={openCreate}
        createLabel="Add Food Package"
        emptyMessage="No Food Packages yet — create the first one."
        rowActions={(r) => (
          <div className="flex justify-end gap-2">
            <EditIconButton onClick={() => openEdit(r)} />
            <DeleteIconButton onClick={() => setDeleting(r)} />
          </div>
        )}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Deactivate this Food Package?"
        message={deleting ? `"${deleting.name}" will be deactivated. This is blocked while a future Booking uses it.` : ""}
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
            toast.deleted("Food Package deactivated successfully.");
          }
        }}
      />

      <FormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? "Edit Food Package" : "Add Food Package"}
        subtitle={editing ? editing.name : "Define a new Food Package."}
        error={create.error || update.error}
        footer={
          <div className="flex justify-end gap-3">
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={() => setDrawerOpen(false)}>
              Cancel
            </DivineButton>
            <DivineButton variant="flame" fullWidth={false} type="submit" form="food-package-form" loading={create.submitting || update.submitting}>
              {editing ? "Save changes" : "Save"}
            </DivineButton>
          </div>
        }
      >
        <form id="food-package-form" onSubmit={submit} noValidate className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <DivineInput staticLabel label="Food Package Name" error={errors.name?.message} {...register("name")} />
            <Controller
              control={control}
              name="status"
              render={({ field }) => <DivineStatusSelect value={field.value} onChange={field.onChange} />}
            />
          </div>
          <DivineTextarea staticLabel label="Description" error={errors.description?.message} {...register("description")} />
          <div className="grid grid-cols-3 gap-4">
            <DivineInput
              staticLabel
              label="Package Price / Pax"
              type="number"
              error={errors.packagePricePerPax?.message}
              {...register("packagePricePerPax", { valueAsNumber: true })}
            />
            <DivineInput
              staticLabel
              label="Minimum Booking Count"
              type="number"
              error={errors.minimumBookingCount?.message}
              {...register("minimumBookingCount", { valueAsNumber: true })}
            />
            <Controller
              control={control}
              name="gstApplicable"
              render={({ field }) => <DivineToggle label="GST Applicable" checked={field.value} onChange={field.onChange} onLabel="Yes" offLabel="No" />}
            />
          </div>
          <Controller
            control={control}
            name="menuItemIds"
            render={({ field }) => (
              <DivineMultiSelect label="Menu Items" values={field.value} onChange={field.onChange} options={menuItemOptions} error={errors.menuItemIds?.message} />
            )}
          />
          <DivineMasterImageUpload
            label="Food Package Image"
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
