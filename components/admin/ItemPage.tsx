"use client";

import { useEffect, useState } from "react";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import DataTable, { StatusPill, EditIconButton, DeleteIconButton, type DataTableColumn } from "./DataTable";
import FormDrawer from "./FormDrawer";
import ConfirmDialog from "./ConfirmDialog";
import DivineInput from "../divine/DivineInput";
import DivineTextarea from "../divine/DivineTextarea";
import DivineListbox, { type ListboxOption } from "../divine/DivineListbox";
import DivineMultiSelect from "../divine/DivineMultiSelect";
import DivineDatePicker from "../divine/DivineDatePicker";
import DivineRadioGroup from "../divine/DivineRadioGroup";
import DivineToggle from "../divine/DivineToggle";
import DivineButton from "../divine/DivineButton";
import { PlusIcon } from "../divine/icons";
import { api, unwrap, type ApiEnvelope } from "../../lib/api";
import { useApiResource } from "../../lib/useApiResource";
import { MODULES, usePermissions } from "../../lib/permissions";
import { toast } from "../../lib/toastStore";
import { useTamilAutoTranslate } from "../../lib/useTamilAutoTranslate";

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
};

const UNIT_OPTIONS = ["PCS", "KG", "GRAM", "LTR", "ML", "BOX", "SET", "PACK"].map((u) => ({ value: u, label: u }));

const categoryDetailSchema = z.object({
  category: z.string().min(1, "Required"),
  subCategory: z.string().min(1, "Required"),
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
    printingGroup: z.string().min(1, "Printing group is required"),
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
    posAvailability: z.boolean(),
    customerPortalAvailability: z.boolean(),
    status: z.number(),
  })
  .refine((data) => !data.isDeityMappingRequired || data.deityMapping.length > 0, {
    message: "Select at least one deity",
    path: ["deityMapping"],
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
  posAvailability: true,
  customerPortalAvailability: true,
  status: 1,
};

async function fetchOptions(path: string, labelField = "name"): Promise<ListboxOption[]> {
  const res = await api.get<ApiEnvelope<{ items: Record<string, unknown>[] }>>(path, {
    params: { status: 1, pageSize: 100 },
  });
  return unwrap(res).items.map((row) => ({ value: String(row._id), label: String(row[labelField]) }));
}

export default function ItemPage() {
  const { can } = usePermissions();
  const canCreate = can(MODULES.items, "fullAccess");
  const canEdit = can(MODULES.items, "edit");
  const { items, total, list, create, update, remove } = useApiResource<Item>(api, "/masters/items");

  const [glOptions, setGlOptions] = useState<ListboxOption[]>([]);
  const [deityOptions, setDeityOptions] = useState<ListboxOption[]>([]);
  const [printingGroupOptions, setPrintingGroupOptions] = useState<ListboxOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<ListboxOption[]>([]);
  const [subCategoryOptions, setSubCategoryOptions] = useState<ListboxOption[]>([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState<Item | null>(null);

  useEffect(() => {
    fetchOptions("/masters/general-ledgers").then(setGlOptions);
    fetchOptions("/masters/deities").then(setDeityOptions);
    fetchOptions("/masters/printing-groups").then(setPrintingGroupOptions);
    fetchOptions("/masters/categories").then(setCategoryOptions);
    fetchOptions("/masters/sub-categories").then(setSubCategoryOptions);
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
  const nameValue = watch("name");
  const tamilNameValue = watch("tamilName");
  useTamilAutoTranslate(nameValue, tamilNameValue, (v) => setValue("tamilName", v, { shouldDirty: true }), drawerOpen);

  function openCreate() {
    setEditing(null);
    reset(DEFAULT_VALUES);
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
      posAvailability: item.posAvailability,
      customerPortalAvailability: item.customerPortalAvailability,
      status: item.status,
    });
    update.setError(null);
    setDrawerOpen(true);
  }

  const submit = handleSubmit(async (values) => {
    const payload = {
      ...values,
      deityMapping: values.isDeityMappingRequired ? values.deityMapping : [],
      unitOfMeasure: values.isInventoryApplicable && values.unitOfMeasure ? values.unitOfMeasure : null,
      futureBookingCutOffDate: values.futureBookingCutOffDate || null,
    };
    const ok = editing ? await update.run(editing._id, payload) : await create.run(payload);
    if (ok !== undefined) {
      setDrawerOpen(false);
      if (editing) toast.updated("Item updated successfully.");
      else toast.created("Item created successfully.");
    }
  });

  const columns: DataTableColumn<Item>[] = [
    { key: "code", label: "Code", render: (i) => <span className="font-medium tabular-nums text-amber-700">{i.code}</span> },
    { key: "name", label: "Name", render: (i) => i.name },
    {
      key: "gl",
      label: "GL Account",
      render: (i) => <span className="text-ink-500">{i.generalLedger?.name ?? "—"}</span>,
    },
    { key: "salePrice", label: "Price", render: (i) => <span className="tabular-nums">₹{i.salePrice.toFixed(2)}</span> },
    { key: "status", label: "Status", render: (i) => <StatusPill status={i.status} /> },
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
        error={create.error || update.error}
        maxWidthClassName="max-w-5xl"
        footer={
          <div className="flex justify-end gap-3">
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={() => setDrawerOpen(false)}>
              Cancel
            </DivineButton>
            <DivineButton fullWidth={false} type="submit" form="item-form" loading={create.submitting || update.submitting}>
              {editing ? "Save changes" : "Save"}
            </DivineButton>
          </div>
        }
      >
        <form id="item-form" onSubmit={submit} noValidate className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <DivineInput label="Item Code" error={errors.code?.message} {...register("code")} />
            <DivineInput label="Item Name" error={errors.name?.message} {...register("name")} />
            <DivineInput label="Tamil Name" error={errors.tamilName?.message} {...register("tamilName")} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              label="Sale Price"
              type="number"
              step="0.01"
              error={errors.salePrice?.message}
              {...register("salePrice", { valueAsNumber: true })}
            />
          </div>
          <p className="-mt-3 pl-1 text-[11.5px] text-ink-500">GST is derived from the selected GL account.</p>

          <DivineTextarea label="Description" error={errors.description?.message} {...register("description")} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Controller
              control={control}
              name="isDeityMappingRequired"
              render={({ field }) => <DivineRadioGroup label="Deity Mapping Required" value={field.value} onChange={field.onChange} />}
            />
            {isDeityMappingRequired && (
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
            )}
          </div>

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

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-wide text-amber-600">Category Details</p>
              <button
                type="button"
                onClick={() => append({ category: "", subCategory: "", displayOrder: fields.length + 1 })}
                className="flex items-center gap-1.5 rounded-lg border border-gold-500/30 px-2.5 py-1.5 text-[12px] text-amber-600 hover:border-gold-400/60 hover:bg-gold-500/5"
              >
                <PlusIcon /> Add Row
              </button>
            </div>
            {fields.length > 0 && (
              <div className="mb-1 hidden grid-cols-[1fr_1fr_70px_28px] gap-2 px-1 text-[11px] uppercase tracking-wide text-ink-500 sm:grid">
                <span>Category</span>
                <span>Sub Category</span>
                <span>Order</span>
                <span />
              </div>
            )}

            <div className="space-y-2">
              {fields.length === 0 && (
                <p className="rounded-xl border border-gold-500/15 bg-ivory-100 px-3 py-2.5 text-[12.5px] text-ink-500">
                  No category pairings yet.
                </p>
              )}
              {fields.map((row, index) => (
                <div
                  key={row.id}
                  className="grid grid-cols-1 items-start gap-2 sm:grid-cols-[1fr_1fr_70px_28px]"
                >
                  <Controller
                    control={control}
                    name={`categoryDetails.${index}.category`}
                    render={({ field }) => (
                      <DivineListbox
                        value={field.value}
                        onChange={field.onChange}
                        options={categoryOptions}
                        placeholder="Category"
                        error={errors.categoryDetails?.[index]?.category?.message}
                      />
                    )}
                  />
                  <Controller
                    control={control}
                    name={`categoryDetails.${index}.subCategory`}
                    render={({ field }) => (
                      <DivineListbox
                        value={field.value}
                        onChange={field.onChange}
                        options={subCategoryOptions}
                        placeholder="Sub Category"
                        error={errors.categoryDetails?.[index]?.subCategory?.message}
                      />
                    )}
                  />
                  <div>
                    <span className="mb-1 block text-[11px] uppercase tracking-wide text-ink-500 sm:hidden">Display Order</span>
                    <input
                      type="number"
                      {...register(`categoryDetails.${index}.displayOrder`, { valueAsNumber: true })}
                      className="w-full rounded-xl border border-gold-500/20 bg-white px-3 py-2.5 text-[13.5px] text-ink-100 outline-none focus:border-gold-400/60"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(index)}
                    aria-label="Remove row"
                    className="text-crimson-500 hover:text-crimson-600 sm:mt-1"
                  >
                    <span className="sm:hidden">Remove row</span>
                    <span className="hidden sm:inline">×</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Controller
              control={control}
              name="isInventoryApplicable"
              render={({ field }) => <DivineRadioGroup label="Inventory Applicable" value={field.value} onChange={field.onChange} />}
            />
            {isInventoryApplicable && (
              <>
                <Controller
                  control={control}
                  name="unitOfMeasure"
                  render={({ field }) => (
                    <DivineListbox label="Unit of Measure" value={field.value} onChange={field.onChange} options={UNIT_OPTIONS} placeholder="Select…" />
                  )}
                />
                <DivineInput
                  label="Threshold"
                  type="number"
                  hint="0 - unlimited"
                  error={errors.threshold?.message}
                  {...register("threshold", { valueAsNumber: true })}
                />
              </>
            )}
          </div>

          {isInventoryApplicable && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <DivineInput
                label="Min Quantity"
                type="number"
                error={errors.minQuantity?.message}
                {...register("minQuantity", { valueAsNumber: true })}
              />
              <DivineInput
                label="Max Quantity"
                type="number"
                hint="0 - unlimited"
                error={errors.maxQuantity?.message}
                {...register("maxQuantity", { valueAsNumber: true })}
              />
              <DivineInput
                label="Quantity Reduction"
                type="number"
                error={errors.quantityReduction?.message}
                {...register("quantityReduction", { valueAsNumber: true })}
              />
            </div>
          )}

          <Controller
            control={control}
            name="futureBookingCutOffDate"
            render={({ field }) => (
              <DivineDatePicker label="Future Booking Cut-off Date" value={field.value} onChange={field.onChange} placeholder="No cut-off" />
            )}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Controller
              control={control}
              name="isFamilyMembersRequired"
              render={({ field }) => (
                <DivineRadioGroup
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
            <DivineInput
              label="Max Members"
              type="number"
              error={errors.maxFamilyMembers?.message}
              {...register("maxFamilyMembers", { valueAsNumber: true })}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Controller
              control={control}
              name="posAvailability"
              render={({ field }) => <DivineRadioGroup label="POS Availability" value={field.value} onChange={field.onChange} />}
            />
            <Controller
              control={control}
              name="customerPortalAvailability"
              render={({ field }) => <DivineRadioGroup label="Customer Portal Availability" value={field.value} onChange={field.onChange} />}
            />
          </div>

          <div className="pt-2">
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <DivineToggle label="Status" checked={field.value === 1} onChange={(checked) => field.onChange(checked ? 1 : 0)} />
              )}
            />
          </div>
        </form>
      </FormDrawer>
    </>
  );
}
