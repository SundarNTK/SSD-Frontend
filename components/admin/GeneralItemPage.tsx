"use client";

import { useEffect, useState } from "react";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import DataTable, { StatusToggleCell, FavoriteToggleCell, EditIconButton, DeleteIconButton, MasterImageCell, type DataTableColumn } from "./DataTable";
import FormDrawer from "./FormDrawer";
import ConfirmDialog from "./ConfirmDialog";
import ImportExportBar from "./ImportExportBar";
import ImportReviewModal from "./ImportReviewModal";
import DivineInput from "../divine/DivineInput";
import DivineTextarea from "../divine/DivineTextarea";
import DivineListbox, { type ListboxOption } from "../divine/DivineListbox";
import DivineRadioGroup from "../divine/DivineRadioGroup";
import DivineStatusSelect from "../divine/DivineStatusSelect";
import DivineFavoriteToggle from "../divine/DivineFavoriteToggle";
import DivineVisibilitySelect from "../divine/DivineVisibilitySelect";
import DivineButton from "../divine/DivineButton";
import DivineMasterImageUpload from "../divine/DivineMasterImageUpload";
import DivineColorPicker from "../divine/DivineColorPicker";
import { withOptionalImage } from "../../lib/withOptionalImage";
import { PlusIcon, CloseIcon, BoxIcon, FolderIcon, SaveIcon } from "../divine/icons";
import { api, unwrap, type ApiEnvelope } from "../../lib/api";
import { useApiResource } from "../../lib/useApiResource";
import { MODULES, usePermissions } from "../../lib/permissions";
import { toast } from "../../lib/toastStore";
import TamilNameField from "./TamilNameField";
import { patchMasterStatus } from "../../lib/patchMasterStatus";
import { patchMasterFavorite } from "../../lib/patchMasterFavorite";
import { VISIBILITY_OPTIONS_NO_PORTAL, flagsToVisibility, visibilityToFlags } from "../../lib/visibility";
import VisibilityPills from "./VisibilityPills";
import { usePageSize } from "../../lib/usePageSize";

type Ref = { _id: string; name: string };
type GlRef = { _id: string; name: string; code: string };

// General Item is sold at a price typed in by the cashier at the point of
// sale (a saree, an old deity photo, etc.) — deliberately no salePrice field
// here, unlike Item/Service. See PosPortalPage/AdminBookingPage's General
// Items tab for where the amount is entered.
export type GeneralItem = {
  _id: string;
  code: string;
  name: string;
  tamilName: string;
  generalLedger: GlRef | null;
  printingGroup: Ref | null;
  description: string;
  categoryDetails: { category: Ref | null; subCategory: Ref | null; displayOrder: number }[];
  isInventoryApplicable: boolean;
  unitOfMeasure: string | null;
  threshold: number;
  minQuantity: number;
  maxQuantity: number;
  quantityReduction: number;
  posAvailability: boolean;
  adminBookingVisibility: boolean;
  favorite: boolean;
  status: number;
  image: string | null;
  color?: string;
};

// Unit of Measure comes from the Unit master (status: 1 only) — same
// reasoning as ItemPage's fetchUnitOptions.
async function fetchUnitOptions(): Promise<ListboxOption[]> {
  const res = await api.get<ApiEnvelope<{ items: { unitCode: string; unitName: string }[] }>>("/masters/units", {
    params: { status: 1, pageSize: 100 },
  });
  return unwrap(res).items.map((u) => ({ value: u.unitCode, label: `${u.unitCode} — ${u.unitName}` }));
}

const categoryDetailSchema = z.object({
  category: z.string().min(1, "Required"),
  subCategory: z.string(),
  displayOrder: z.number().int().min(0),
});

const schema = z.object({
  code: z.string().trim().min(1, "Code is required").max(30),
  name: z.string().trim().min(1, "Name is required").max(150),
  tamilName: z.string().trim(),
  generalLedger: z.string().min(1, "GL account is required"),
  printingGroup: z.string().min(1, "Printing group is required"),
  description: z.string().trim().max(500),
  categoryDetails: z.array(categoryDetailSchema),
  isInventoryApplicable: z.boolean(),
  unitOfMeasure: z.string(),
  threshold: z.number().int().min(0),
  minQuantity: z.number().int().min(1),
  maxQuantity: z.number().int().min(0),
  quantityReduction: z.number().int().min(1),
  visibility: z.array(z.string()),
  favorite: z.boolean(),
  status: z.number(),
  color: z.string().regex(/^(#[0-9A-Fa-f]{6})?$/, "Enter a valid hex colour"),
});

type FormValues = z.infer<typeof schema>;

const DEFAULT_VALUES: FormValues = {
  code: "",
  name: "",
  tamilName: "",
  generalLedger: "",
  printingGroup: "",
  description: "",
  categoryDetails: [],
  isInventoryApplicable: false,
  unitOfMeasure: "",
  threshold: 0,
  minQuantity: 1,
  maxQuantity: 0,
  quantityReduction: 1,
  visibility: [VISIBILITY_OPTIONS_NO_PORTAL[0]!.value, VISIBILITY_OPTIONS_NO_PORTAL[1]!.value],
  favorite: false,
  status: 1,
  color: "",
};

async function fetchOptions(path: string, labelField = "name"): Promise<ListboxOption[]> {
  const res = await api.get<ApiEnvelope<{ items: Record<string, unknown>[] }>>(path, {
    params: { status: 1, pageSize: 100 },
  });
  return unwrap(res).items.map((row) => ({ value: String(row._id), label: String(row[labelField]) }));
}

type SubCategoryOption = ListboxOption & { categoryId: string };

async function fetchSubCategoryOptions(): Promise<SubCategoryOption[]> {
  const res = await api.get<ApiEnvelope<{ items: Record<string, unknown>[] }>>("/masters/sub-categories", {
    params: { status: 1, pageSize: 100 },
  });
  return unwrap(res).items.map((row) => ({
    value: String(row._id),
    label: String(row.name),
    categoryId: String((row.category as { _id?: string } | null)?._id ?? ""),
  }));
}

export default function GeneralItemPage() {
  const { can } = usePermissions();
  const canCreate = can(MODULES.generalItems, "fullAccess");
  const canEdit = can(MODULES.generalItems, "edit");
  const canView = can(MODULES.generalItems, "view");
  const { items, total, list, create, update, remove } = useApiResource<GeneralItem>(api, "/masters/general-items");
  const [importOpen, setImportOpen] = useState(false);

  const [glOptions, setGlOptions] = useState<ListboxOption[]>([]);
  const [printingGroupOptions, setPrintingGroupOptions] = useState<ListboxOption[]>([]);
  const [unitOptions, setUnitOptions] = useState<ListboxOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<ListboxOption[]>([]);
  const [subCategoryOptions, setSubCategoryOptions] = useState<SubCategoryOption[]>([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = usePageSize();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<GeneralItem | null>(null);
  const [deleting, setDeleting] = useState<GeneralItem | null>(null);
  const [createImage, setCreateImage] = useState<File | null>(null);
  const [editImage, setEditImage] = useState<File | null>(null);
  const [imageRemoved, setImageRemoved] = useState(false);

  useEffect(() => {
    fetchOptions("/masters/general-ledgers").then(setGlOptions);
    fetchOptions("/masters/printing-groups").then(setPrintingGroupOptions);
    fetchUnitOptions().then(setUnitOptions);
    fetchOptions("/masters/categories").then(setCategoryOptions);
    fetchSubCategoryOptions().then(setSubCategoryOptions);
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
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: DEFAULT_VALUES });

  const { fields, append, remove: removeRow } = useFieldArray({ control, name: "categoryDetails" });
  const isInventoryApplicable = watch("isInventoryApplicable");
  const nameValue = watch("name");
  const tamilNameValue = watch("tamilName");

  function openCreate() {
    setEditing(null);
    reset(DEFAULT_VALUES);
    setCreateImage(null);
    setImageRemoved(false);
    create.setError(null);
    setDrawerOpen(true);
  }

  function openEdit(generalItem: GeneralItem) {
    setEditing(generalItem);
    reset({
      code: generalItem.code,
      name: generalItem.name,
      tamilName: generalItem.tamilName,
      generalLedger: generalItem.generalLedger?._id ?? "",
      printingGroup: generalItem.printingGroup?._id ?? "",
      description: generalItem.description,
      categoryDetails: generalItem.categoryDetails.map((c) => ({
        category: c.category?._id ?? "",
        subCategory: c.subCategory?._id ?? "",
        displayOrder: c.displayOrder,
      })),
      isInventoryApplicable: generalItem.isInventoryApplicable,
      unitOfMeasure: generalItem.unitOfMeasure ?? "",
      threshold: generalItem.threshold,
      minQuantity: generalItem.minQuantity,
      maxQuantity: generalItem.maxQuantity,
      quantityReduction: generalItem.quantityReduction,
      visibility: flagsToVisibility(generalItem.posAvailability, undefined, generalItem.adminBookingVisibility).filter(
        (v) => v !== "customerPortal"
      ),
      favorite: generalItem.favorite,
      status: generalItem.status,
      color: generalItem.color ?? "",
    });
    setEditImage(null);
    setImageRemoved(false);
    update.setError(null);
    setDrawerOpen(true);
  }

  const submit = handleSubmit(async (values) => {
    const { pos, adminBooking } = visibilityToFlags(values.visibility);
    const payload = withOptionalImage(
      {
        ...values,
        unitOfMeasure: values.isInventoryApplicable && values.unitOfMeasure ? values.unitOfMeasure : null,
        categoryDetails: values.categoryDetails.map((c) => ({ ...c, subCategory: c.subCategory || null })),
        posAvailability: pos,
        adminBookingVisibility: adminBooking,
        visibility: undefined,
      },
      editing ? editImage : createImage,
      { existingValue: editing?.image ?? null, imageRemoved }
    );
    const ok = editing ? await update.run(editing._id, payload) : await create.run(payload);
    if (ok !== undefined) {
      setDrawerOpen(false);
      if (editing) toast.updated("General Item updated successfully.");
      else toast.created("General Item created successfully.");
    }
  });

  const columns: DataTableColumn<GeneralItem>[] = [
    { key: "image", label: "Image", render: (i) => <MasterImageCell src={i.image} alt={i.name} /> },
    { key: "code", label: "Code", render: (i) => <span className="font-medium tabular-nums text-amber-700">{i.code}</span> },
    { key: "name", label: "Name", render: (i) => i.name },
    {
      key: "color",
      label: "Color",
      render: (i) =>
        i.color ? (
          <span className="inline-flex h-5 w-5 rounded-full border border-gold-500/25" style={{ backgroundColor: i.color }} />
        ) : (
          <span className="text-ink-400">—</span>
        ),
    },
    {
      key: "gl",
      label: "GL Account",
      render: (i) => <span className="text-ink-500">{i.generalLedger?.name ?? "—"}</span>,
    },
    {
      key: "visibility",
      label: "Visibility",
      render: (i) => <VisibilityPills pos={i.posAvailability} adminBooking={i.adminBookingVisibility} />,
    },
    {
      key: "favorite",
      label: "Favorite",
      render: (i) => (
        <FavoriteToggleCell
          favorite={i.favorite}
          canEdit={canEdit}
          onChange={(favorite) => patchMasterFavorite(update, i._id, favorite, "General Item")}
        />
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (i) => (
        <StatusToggleCell
          status={i.status}
          canEdit={canEdit}
          onChange={(status) => patchMasterStatus(update, i._id, status, "General Item")}
        />
      ),
    },
  ];

  return (
    <>
      <DataTable
        title="General Item Master"
        subtitle="Priceless-at-setup goods — sarees, old deity photos, etc. Amount is entered manually on the POS/Admin Booking screen."
        columns={columns}
        rows={items}
        rowKey={(i) => i._id}
        loading={list.submitting}
        search={search}
        onSearchChange={(v) => {
          setPage(1);
          setSearch(v);
        }}
        searchPlaceholder="Search by name or code…"
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
        createLabel="Add General Item"
        emptyMessage="No General Items yet — create the first one."
        toolbarActions={
          <ImportExportBar
            client={api}
            basePath="/masters/general-items"
            entityLabel="General Item"
            canExport={canView}
            canImport={canCreate}
            onOpenImport={() => setImportOpen(true)}
          />
        }
        rowActions={(i) => (
          <div className="flex justify-end gap-2">
            {canEdit && <EditIconButton onClick={() => openEdit(i)} />}
            {canCreate && <DeleteIconButton onClick={() => setDeleting(i)} />}
          </div>
        )}
      />

      <ImportReviewModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        client={api}
        basePath="/masters/general-items"
        entityLabel="General Item"
        previewFields={[
          { key: "code", label: "Code" },
          { key: "name", label: "Name" },
          { key: "generalLedger", label: "General Ledger" },
          { key: "category", label: "Category" },
        ]}
        onImported={() => list.run({ page, pageSize, search: search || undefined, status: statusFilter || undefined })}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this General Item?"
        message={deleting ? `"${deleting.name}" will be removed.` : ""}
        confirmLabel="Delete General Item"
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
            toast.deleted("General Item deleted successfully.");
          }
        }}
      />

      <FormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? "Edit General Item" : "Add General Item"}
        subtitle={editing ? `${editing.name} · ${editing.code}` : "Define a new priceless-at-setup product."}
        icon={<BoxIcon />}
        error={create.error || update.error}
        maxWidthClassName="max-w-5xl"
        footer={
          <div className="flex justify-end gap-3">
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={() => setDrawerOpen(false)}>
              Cancel
            </DivineButton>
            <DivineButton variant="flame" fullWidth={false} type="submit" form="general-item-form" loading={create.submitting || update.submitting}>
              <SaveIcon /> {editing ? "Save changes" : "Save"}
            </DivineButton>
          </div>
        }
      >
        <form id="general-item-form" onSubmit={submit} noValidate className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <DivineInput staticLabel label="Item Code" error={errors.code?.message} {...register("code")} />
            <DivineInput staticLabel label="Item Name" error={errors.name?.message} {...register("name")} />
            <TamilNameField
              englishName={nameValue}
              value={tamilNameValue}
              onChange={(v) => setValue("tamilName", v, { shouldDirty: true })}
              error={errors.tamilName?.message}
              staticLabel
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Controller
              control={control}
              name="generalLedger"
              render={({ field }) => (
                <DivineListbox
                  label="General Ledger (GL)"
                  value={field.value}
                  onChange={field.onChange}
                  options={glOptions}
                  placeholder="Select GL Account"
                  error={errors.generalLedger?.message}
                />
              )}
            />
            <Controller
              control={control}
              name="printingGroup"
              render={({ field }) => (
                <DivineListbox
                  label="Printing Group"
                  value={field.value}
                  onChange={field.onChange}
                  options={printingGroupOptions}
                  placeholder="Select Printing Group"
                  error={errors.printingGroup?.message}
                />
              )}
            />
          </div>
          <p className="-mt-3 pl-1 text-[11.5px] text-ink-500">
            No sale price here — the cashier types the amount in on the POS/Admin Booking screen; GST is derived from the selected GL account.
          </p>

          <DivineTextarea staticLabel label="Description" error={errors.description?.message} {...register("description")} />

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-orange-100 bg-orange-50 px-4 py-3">
              <p className="flex items-center gap-2 text-[13px] font-bold text-ink-100">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-orange-100 text-orange-600">
                  <FolderIcon className="h-4 w-4" />
                </span>
                CATEGORY DETAILS
              </p>
              <button
                type="button"
                onClick={() => append({ category: "", subCategory: "", displayOrder: fields.length + 1 })}
                className="flex items-center gap-1.5 rounded-lg border border-orange-300 bg-white px-2.5 py-1.5 text-[12px] font-medium text-orange-600 transition-colors hover:bg-orange-50"
              >
                <PlusIcon /> Add Row
              </button>
            </div>

            {fields.length > 0 && (
              <div className="hidden grid-cols-[1fr_1fr_90px_40px] gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2 text-[11px] uppercase tracking-wide text-gray-500 sm:grid">
                <span>Category</span>
                <span>Sub Category</span>
                <span>Order</span>
                <span />
              </div>
            )}

            <div className="divide-y divide-gray-100">
              {fields.length === 0 && <p className="px-4 py-3 text-[12.5px] text-ink-500">No category pairings yet.</p>}
              {fields.map((row, index) => {
                const selectedCategory = watch(`categoryDetails.${index}.category`);
                const rowSubCategoryOptions = selectedCategory
                  ? subCategoryOptions.filter((o) => o.categoryId === selectedCategory)
                  : [];
                return (
                <div key={row.id} className="grid grid-cols-1 items-start gap-3 px-4 py-3 sm:grid-cols-[1fr_1fr_90px_40px]">
                  <Controller
                    control={control}
                    name={`categoryDetails.${index}.category`}
                    render={({ field }) => (
                      <DivineListbox
                        formChrome
                        value={field.value}
                        onChange={(v) => {
                          field.onChange(v);
                          setValue(`categoryDetails.${index}.subCategory`, "", { shouldDirty: true });
                        }}
                        options={categoryOptions}
                        placeholder="Select category"
                        error={errors.categoryDetails?.[index]?.category?.message}
                      />
                    )}
                  />
                  <Controller
                    control={control}
                    name={`categoryDetails.${index}.subCategory`}
                    render={({ field }) => (
                      <DivineListbox
                        formChrome
                        value={field.value}
                        onChange={field.onChange}
                        options={rowSubCategoryOptions}
                        disabled={!selectedCategory}
                        placeholder={selectedCategory ? "Select sub category" : "Select category first"}
                        error={errors.categoryDetails?.[index]?.subCategory?.message}
                      />
                    )}
                  />
                  <div>
                    <span className="mb-1.5 block text-[13px] font-semibold text-maroon sm:hidden">Order</span>
                    <input
                      type="number"
                      {...register(`categoryDetails.${index}.displayOrder`, { valueAsNumber: true })}
                      className="h-10 w-full rounded-lg border border-[#f0b4a0] bg-white px-3 font-body text-[14px] text-ink-100 outline-none transition-colors hover:border-[#e8a090] focus:border-[#e8590c]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(index)}
                    aria-label="Remove row"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-crimson-500/10 text-crimson-500 transition-colors hover:bg-crimson-500/20"
                  >
                    <CloseIcon className="h-4 w-4" />
                    <span className="sr-only">Remove row</span>
                  </button>
                </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Controller
              control={control}
              name="isInventoryApplicable"
              render={({ field }) => (
                <DivineRadioGroup
                  boxed
                  label="Inventory Applicable"
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
            {isInventoryApplicable && (
              <>
                <Controller
                  control={control}
                  name="unitOfMeasure"
                  render={({ field }) => (
                    <DivineListbox
                      label="Unit of Measure"
                      value={field.value}
                      onChange={field.onChange}
                      options={unitOptions}
                      placeholder="Select…"
                    />
                  )}
                />
                <DivineInput
                  staticLabel
                  label="Threshold"
                  type="number"
                  error={errors.threshold?.message}
                  {...register("threshold", { valueAsNumber: true })}
                />
              </>
            )}
          </div>

          {isInventoryApplicable && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <DivineInput
                staticLabel
                label="Min Quantity"
                type="number"
                error={errors.minQuantity?.message}
                {...register("minQuantity", { valueAsNumber: true })}
              />
              <DivineInput
                staticLabel
                label="Max Quantity"
                type="number"
                error={errors.maxQuantity?.message}
                {...register("maxQuantity", { valueAsNumber: true })}
              />
              <DivineInput
                staticLabel
                label="Quantity Reduction"
                type="number"
                error={errors.quantityReduction?.message}
                {...register("quantityReduction", { valueAsNumber: true })}
              />
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Controller
              control={control}
              name="visibility"
              render={({ field }) => (
                <DivineVisibilitySelect
                  values={field.value}
                  onChange={field.onChange}
                  error={errors.visibility?.message}
                  options={VISIBILITY_OPTIONS_NO_PORTAL}
                />
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Controller
              control={control}
              name="color"
              render={({ field }) => (
                <DivineColorPicker
                  optional
                  label="Card Colour (optional)"
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.color?.message}
                />
              )}
            />
            <Controller
              control={control}
              name="favorite"
              render={({ field }) => (
                <DivineFavoriteToggle value={field.value} onChange={field.onChange} />
              )}
            />
          </div>
          <DivineMasterImageUpload
            label="General Item Image"
            hint="Recommended: 400 × 400 px square, WebP or JPEG · shown as the card banner in the POS offering grid · up to 100 KB"
            value={editing?.image}
            onChange={(file) => {
              (editing ? setEditImage : setCreateImage)(file);
              setImageRemoved(!file);
            }}
          />
        </form>
      </FormDrawer>
    </>
  );
}
