"use client";

import { useEffect, useState } from "react";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import DataTable, { StatusToggleCell, EditIconButton, DeleteIconButton, MasterImageCell, type DataTableColumn } from "./DataTable";
import FormDrawer from "./FormDrawer";
import ConfirmDialog from "./ConfirmDialog";
import DivineInput from "../divine/DivineInput";
import DivineTextarea from "../divine/DivineTextarea";
import DivineListbox, { type ListboxOption } from "../divine/DivineListbox";
import DivineMultiSelect from "../divine/DivineMultiSelect";
import DivineDatePicker from "../divine/DivineDatePicker";
import DivineRadioGroup from "../divine/DivineRadioGroup";
import DivineStatusSelect from "../divine/DivineStatusSelect";
import DivineVisibilitySelect from "../divine/DivineVisibilitySelect";
import DivineButton from "../divine/DivineButton";
import DivineImageUpload from "../divine/DivineImageUpload";
import { withOptionalImage } from "../../lib/withOptionalImage";
import {
  PlusIcon,
  CloseIcon,
  ShoppingBagIcon,
  FolderIcon,
  SaveIcon,
} from "../divine/icons";
import { api, unwrap, type ApiEnvelope } from "../../lib/api";
import { useApiResource } from "../../lib/useApiResource";
import { MODULES, usePermissions } from "../../lib/permissions";
import { toast } from "../../lib/toastStore";
import TamilNameField from "./TamilNameField";
import { patchMasterStatus } from "../../lib/patchMasterStatus";
import { DEFAULT_VISIBILITY, flagsToVisibility, visibilityToFlags } from "../../lib/visibility";
import VisibilityPills from "./VisibilityPills";

type Ref = { _id: string; name: string };
type GlRef = { _id: string; name: string; code: string };

export type Item = {
  _id: string;
  code: string;
  name: string;
  tamilName: string;
  generalLedger: GlRef | null;
  salePrice: number;
  description: string;
  isDeityMappingRequired: boolean;
  deityMapping: Ref[];
  printingGroup: Ref | null;
  categoryDetails: { category: Ref | null; subCategory: Ref | null; displayOrder: number }[];
  isInventoryApplicable: boolean;
  unitOfMeasure: string | null;
  threshold: number;
  minQuantity: number;
  maxQuantity: number;
  quantityReduction: number;
  futureBookingCutOffDate: string | null;
  isFamilyMembersRequired: boolean;
  maxFamilyMembers: number;
  posAvailability: boolean;
  customerPortalAvailability: boolean;
  status: number;
  image: string | null;
};

// Unit of Measure now comes from the Unit master (status: 1 only) rather
// than this hardcoded list — see fetchUnitOptions below. unitOfMeasure
// itself stays a plain string on Item (the unit's code, e.g. "PCS"), not an
// ObjectId ref, so existing item data and every place that already reads
// unitOfMeasure as a string (inventory, low-stock report, exports) keeps
// working unchanged.
async function fetchUnitOptions(): Promise<ListboxOption[]> {
  const res = await api.get<ApiEnvelope<{ items: { unitCode: string; unitName: string }[] }>>("/masters/units", {
    params: { status: 1, pageSize: 100 },
  });
  return unwrap(res).items.map((u) => ({ value: u.unitCode, label: `${u.unitCode} — ${u.unitName}` }));
}

const categoryDetailSchema = z.object({
  category: z.string().min(1, "Required"),
  // Optional — a row can map to a Category alone, with no specific Sub
  // Category (see PosPortalPage's "uncategorized" handling).
  subCategory: z.string(),
  displayOrder: z.number().int().min(0),
});

const schema = z
  .object({
    code: z.string().trim().min(1, "Code is required").max(30),
    name: z.string().trim().min(1, "Name is required").max(150),
    tamilName: z.string().trim(),
    generalLedger: z.string().min(1, "GL account is required"),
    salePrice: z.number().min(0, "Must be 0 or more"),
    description: z.string().trim().max(500),
    isDeityMappingRequired: z.boolean(),
    deityMapping: z.array(z.string()),
    printingGroup: z.string(),
    categoryDetails: z.array(categoryDetailSchema),
    isInventoryApplicable: z.boolean(),
    unitOfMeasure: z.string(),
    threshold: z.number().int().min(0),
    minQuantity: z.number().int().min(1),
    maxQuantity: z.number().int().min(0),
    quantityReduction: z.number().int().min(1),
    futureBookingCutOffDate: z.string(),
    isFamilyMembersRequired: z.boolean(),
    maxFamilyMembers: z.number().int().min(1),
    visibility: z.array(z.string()),
    status: z.number(),
  })
  .superRefine((data, ctx) => {
    if (data.isDeityMappingRequired) {
      if (data.deityMapping.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Select at least one deity", path: ["deityMapping"] });
      }
    } else if (!data.printingGroup) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Printing group is required", path: ["printingGroup"] });
    }
  });

type FormValues = z.infer<typeof schema>;

const DEFAULT_PAGE_SIZE = 10;

const DEFAULT_VALUES: FormValues = {
  code: "",
  name: "",
  tamilName: "",
  generalLedger: "",
  salePrice: 0,
  description: "",
  isDeityMappingRequired: false,
  deityMapping: [],
  printingGroup: "",
  categoryDetails: [],
  isInventoryApplicable: true,
  unitOfMeasure: "",
  threshold: 0,
  minQuantity: 1,
  maxQuantity: 0,
  quantityReduction: 1,
  futureBookingCutOffDate: "",
  isFamilyMembersRequired: false,
  maxFamilyMembers: 2,
  visibility: DEFAULT_VISIBILITY,
  status: 1,
};

async function fetchOptions(path: string, labelField = "name"): Promise<ListboxOption[]> {
  const res = await api.get<ApiEnvelope<{ items: Record<string, unknown>[] }>>(path, {
    params: { status: 1, pageSize: 100 },
  });
  return unwrap(res).items.map((row) => ({ value: String(row._id), label: String(row[labelField]) }));
}

type SubCategoryOption = ListboxOption & { categoryId: string };

// Sub categories carry their parent category — captured alongside the
// label/value pair so each categoryDetails row can filter its own
// sub-category dropdown down to the ones mapped to its selected category.
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

export default function ItemPage() {
  const { can } = usePermissions();
  const canCreate = can(MODULES.items, "fullAccess");
  const canEdit = can(MODULES.items, "edit");
  const { items, total, list, create, update, remove } = useApiResource<Item>(api, "/masters/items");

  const [glOptions, setGlOptions] = useState<ListboxOption[]>([]);
  const [deityOptions, setDeityOptions] = useState<ListboxOption[]>([]);
  const [printingGroupOptions, setPrintingGroupOptions] = useState<ListboxOption[]>([]);
  const [unitOptions, setUnitOptions] = useState<ListboxOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<ListboxOption[]>([]);
  const [subCategoryOptions, setSubCategoryOptions] = useState<SubCategoryOption[]>([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState<Item | null>(null);
  const [createImage, setCreateImage] = useState<File | null>(null);
  const [editImage, setEditImage] = useState<File | null>(null);

  useEffect(() => {
    fetchOptions("/masters/general-ledgers").then(setGlOptions);
    fetchOptions("/masters/deities").then(setDeityOptions);
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
  const isDeityMappingRequired = watch("isDeityMappingRequired");
  const isFamilyMembersRequired = watch("isFamilyMembersRequired");
  const nameValue = watch("name");
  const tamilNameValue = watch("tamilName");

  function openCreate() {
    setEditing(null);
    reset(DEFAULT_VALUES);
    setCreateImage(null);
    create.setError(null);
    setDrawerOpen(true);
  }

  function openEdit(item: Item) {
    setEditing(item);
    reset({
      code: item.code,
      name: item.name,
      tamilName: item.tamilName,
      generalLedger: item.generalLedger?._id ?? "",
      salePrice: item.salePrice,
      description: item.description,
      isDeityMappingRequired: item.isDeityMappingRequired,
      deityMapping: item.deityMapping.map((d) => d._id),
      printingGroup: item.printingGroup?._id ?? "",
      categoryDetails: item.categoryDetails.map((c) => ({
        category: c.category?._id ?? "",
        subCategory: c.subCategory?._id ?? "",
        displayOrder: c.displayOrder,
      })),
      isInventoryApplicable: item.isInventoryApplicable,
      unitOfMeasure: item.unitOfMeasure ?? "",
      threshold: item.threshold,
      minQuantity: item.minQuantity,
      maxQuantity: item.maxQuantity,
      quantityReduction: item.quantityReduction,
      futureBookingCutOffDate: item.futureBookingCutOffDate ? item.futureBookingCutOffDate.slice(0, 10) : "",
      isFamilyMembersRequired: item.isFamilyMembersRequired,
      maxFamilyMembers: item.maxFamilyMembers,
      visibility: flagsToVisibility(item.posAvailability, item.customerPortalAvailability),
      status: item.status,
    });
    setEditImage(null);
    update.setError(null);
    setDrawerOpen(true);
  }

  const submit = handleSubmit(async (values) => {
    const { pos, portal } = visibilityToFlags(values.visibility);
    const payload = withOptionalImage(
      {
        ...values,
        deityMapping: values.isDeityMappingRequired ? values.deityMapping : [],
        printingGroup: values.isDeityMappingRequired ? null : values.printingGroup,
        unitOfMeasure: values.isInventoryApplicable && values.unitOfMeasure ? values.unitOfMeasure : null,
        futureBookingCutOffDate: values.futureBookingCutOffDate || null,
        categoryDetails: values.categoryDetails.map((c) => ({ ...c, subCategory: c.subCategory || null })),
        posAvailability: pos,
        customerPortalAvailability: portal,
        visibility: undefined,
      },
      editing ? editImage : createImage,
    );
    const ok = editing ? await update.run(editing._id, payload) : await create.run(payload);
    if (ok !== undefined) {
      setDrawerOpen(false);
      if (editing) toast.updated("Item updated successfully.");
      else toast.created("Item created successfully.");
    }
  });

  const columns: DataTableColumn<Item>[] = [
    { key: "image", label: "Image", render: (i) => <MasterImageCell src={i.image} alt={i.name} /> },
    { key: "code", label: "Code", render: (i) => <span className="font-medium tabular-nums text-amber-700">{i.code}</span> },
    { key: "name", label: "Name", render: (i) => i.name },
    {
      key: "gl",
      label: "GL Account",
      render: (i) => <span className="text-ink-500">{i.generalLedger?.name ?? "—"}</span>,
    },
    { key: "salePrice", label: "Price", render: (i) => <span className="tabular-nums">${i.salePrice.toFixed(2)}</span> },
    {
      key: "visibility",
      label: "Visibility",
      render: (i) => <VisibilityPills pos={i.posAvailability} portal={i.customerPortalAvailability} />,
    },
    {
      key: "status",
      label: "Status",
      render: (i) => (
        <StatusToggleCell
          status={i.status}
          canEdit={canEdit}
          onChange={(status) => patchMasterStatus(update, i._id, status, "Item")}
        />
      ),
    },
  ];

  return (
    <>
      <DataTable
        title="Item Master"
        subtitle="Sellable items — pricing, GL account, categorisation, and POS/inventory behaviour."
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
        createLabel="Add Item"
        emptyMessage="No items yet — create the first one."
        rowActions={(i) => (
          <div className="flex justify-end gap-2">
            {canEdit && <EditIconButton onClick={() => openEdit(i)} />}
            {canCreate && <DeleteIconButton onClick={() => setDeleting(i)} />}
          </div>
        )}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this item?"
        message={deleting ? `"${deleting.name}" will be removed.` : ""}
        confirmLabel="Delete item"
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
            toast.deleted("Item deleted successfully.");
          }
        }}
      />

      <FormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? "Edit Item" : "Add Item"}
        subtitle={editing ? `${editing.name} · ${editing.code}` : "Define a new sellable item."}
        icon={<ShoppingBagIcon />}
        error={create.error || update.error}
        maxWidthClassName="max-w-5xl"
        footer={
          <div className="flex justify-end gap-3">
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={() => setDrawerOpen(false)}>
              Cancel
            </DivineButton>
            <DivineButton variant="flame" fullWidth={false} type="submit" form="item-form" loading={create.submitting || update.submitting}>
              <SaveIcon /> {editing ? "Save changes" : "Save"}
            </DivineButton>
          </div>
        }
      >
        <form id="item-form" onSubmit={submit} noValidate className="space-y-5">
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
            <DivineInput
              staticLabel
              label="Sale Price"
              type="number"
              step="0.01"
              error={errors.salePrice?.message}
              {...register("salePrice", { valueAsNumber: true })}
            />
          </div>
          <p className="-mt-3 pl-1 text-[11.5px] text-ink-500">GST is derived from the selected GL account.</p>

          <DivineTextarea staticLabel label="Description" error={errors.description?.message} {...register("description")} />

          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-3">
            <div className="self-start">
              <Controller
                control={control}
                name="isDeityMappingRequired"
                render={({ field }) => (
                  <DivineRadioGroup
                    boxed
                    label="Deity Mapping Required"
                    value={field.value}
                    onChange={(v) => {
                      field.onChange(v);
                      if (v) setValue("printingGroup", "", { shouldDirty: true, shouldValidate: true });
                      else setValue("deityMapping", [], { shouldDirty: true, shouldValidate: true });
                    }}
                  />
                )}
              />
            </div>
            {isDeityMappingRequired ? (
              <div className="min-w-0 sm:col-span-2">
                <Controller
                  control={control}
                  name="deityMapping"
                  render={({ field }) => (
                    <DivineMultiSelect
                      label="Deity Mapping"
                      values={field.value}
                      onChange={field.onChange}
                      options={deityOptions}
                      placeholder="Select deities"
                      error={errors.deityMapping?.message as string | undefined}
                    />
                  )}
                />
                <p className="mt-1 pl-1 text-[11.5px] text-ink-500">
                  Printing group is taken from the selected deity in Deity Master.
                </p>
              </div>
            ) : (
              <div className="self-start">
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
            )}
          </div>

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
                          // A category swap can orphan the row's current sub
                          // category (it belongs to the old category), so clear it.
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Controller
              control={control}
              name="futureBookingCutOffDate"
              render={({ field }) => (
                <DivineDatePicker staticLabel label="Future Booking Cut-off Date" value={field.value} onChange={field.onChange} placeholder="No cut-off" />
              )}
            />
            <Controller
              control={control}
              name="isFamilyMembersRequired"
              render={({ field }) => (
                <DivineRadioGroup
                  boxed
                  label="Family Members Required"
                  value={field.value}
                  onChange={(v) => {
                    field.onChange(v);
                    // Switching this on gives a sensible starting point —
                    // the count itself stays fully editable afterward.
                    if (v) setValue("maxFamilyMembers", 2);
                  }}
                />
              )}
            />
            {isFamilyMembersRequired && (
              <DivineInput
                staticLabel
                label="Max Members"
                type="number"
                error={errors.maxFamilyMembers?.message}
                {...register("maxFamilyMembers", { valueAsNumber: true })}
              />
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Controller
              control={control}
              name="visibility"
              render={({ field }) => (
                <DivineVisibilitySelect values={field.value} onChange={field.onChange} error={errors.visibility?.message} />
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
          <DivineImageUpload
            label="Item Image"
            value={editing?.image}
            onChange={editing ? setEditImage : setCreateImage}
          />
        </form>
      </FormDrawer>
    </>
  );
}
