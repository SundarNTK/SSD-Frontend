"use client";

import { useEffect, useState } from "react";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import DataTable, { StatusPill, type DataTableColumn } from "./DataTable";
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

type Ref = { _id: string; name: string };
type GlRef = { _id: string; name: string; code: string };

export type Service = {
  _id: string;
  code: string;
  name: string;
  tamilName: string;
  description: string;
  isDeityMappingRequired: boolean;
  deityMapping: Ref[];
  categoryDetails: { category: Ref | null; subCategory: Ref | null; salePrice: number; displayOrder: number }[];
  generalLedger: GlRef | null;
  isFamilyMembersRequired: boolean;
  minFamilyMembers: number;
  maxFamilyMembers: number;
  sessionRequired: boolean;
  isInventoryRequired: boolean;
  thresholdCount: number;
  bookingCutoffDate: string | null;
  isPosAvailable: boolean;
  publicAvailability: boolean;
  status: number;
};

const categoryDetailSchema = z.object({
  category: z.string().min(1, "Required"),
  subCategory: z.string().min(1, "Required"),
  salePrice: z.number().min(0, "Must be 0 or more"),
  displayOrder: z.number().int().min(0),
});

const schema = z
  .object({
    code: z.string().trim().min(1, "Code is required").max(30),
    name: z.string().trim().min(1, "Name is required").max(150),
    tamilName: z.string().trim(),
    description: z.string().trim().max(1000),
    isDeityMappingRequired: z.boolean(),
    deityMapping: z.array(z.string()),
    categoryDetails: z.array(categoryDetailSchema),
    generalLedger: z.string().min(1, "GL account is required"),
    isFamilyMembersRequired: z.boolean(),
    minFamilyMembers: z.number().int().min(0),
    maxFamilyMembers: z.number().int().min(0),
    sessionRequired: z.boolean(),
    isInventoryRequired: z.boolean(),
    thresholdCount: z.number().int().min(0),
    bookingCutoffDate: z.string(),
    isPosAvailable: z.boolean(),
    publicAvailability: z.boolean(),
    status: z.number(),
  })
  .refine((data) => !data.isDeityMappingRequired || data.deityMapping.length > 0, {
    message: "Select at least one deity",
    path: ["deityMapping"],
  });

type FormValues = z.infer<typeof schema>;

const PAGE_SIZE = 20;

const DEFAULT_VALUES: FormValues = {
  code: "",
  name: "",
  tamilName: "",
  description: "",
  isDeityMappingRequired: false,
  deityMapping: [],
  categoryDetails: [],
  generalLedger: "",
  isFamilyMembersRequired: false,
  minFamilyMembers: 1,
  maxFamilyMembers: 1,
  sessionRequired: false,
  isInventoryRequired: false,
  thresholdCount: 0,
  bookingCutoffDate: "",
  isPosAvailable: true,
  publicAvailability: true,
  status: 1,
};

async function fetchOptions(path: string, labelField = "name"): Promise<ListboxOption[]> {
  const res = await api.get<ApiEnvelope<{ items: Record<string, unknown>[] }>>(path, {
    params: { status: 1, pageSize: 100 },
  });
  return unwrap(res).items.map((row) => ({ value: String(row._id), label: String(row[labelField]) }));
}

export default function ServicePage() {
  const { can } = usePermissions();
  const canCreate = can(MODULES.services, "fullAccess");
  const canEdit = can(MODULES.services, "edit");
  const { items, total, list, create, update, remove } = useApiResource<Service>(api, "/masters/services");

  const [glOptions, setGlOptions] = useState<ListboxOption[]>([]);
  const [deityOptions, setDeityOptions] = useState<ListboxOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<ListboxOption[]>([]);
  const [subCategoryOptions, setSubCategoryOptions] = useState<ListboxOption[]>([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [deleting, setDeleting] = useState<Service | null>(null);

  useEffect(() => {
    fetchOptions("/masters/general-ledgers").then(setGlOptions);
    fetchOptions("/masters/deities").then(setDeityOptions);
    fetchOptions("/masters/categories").then(setCategoryOptions);
    fetchOptions("/masters/sub-categories").then(setSubCategoryOptions);
  }, []);

  useEffect(() => {
    list.run({ page, pageSize: PAGE_SIZE, search: search || undefined, status: statusFilter || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, statusFilter]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    control,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: DEFAULT_VALUES });

  const { fields, append, remove: removeRow } = useFieldArray({ control, name: "categoryDetails" });
  const isDeityMappingRequired = watch("isDeityMappingRequired");
  const isFamilyMembersRequired = watch("isFamilyMembersRequired");
  const isInventoryRequired = watch("isInventoryRequired");

  function openCreate() {
    setEditing(null);
    reset(DEFAULT_VALUES);
    create.setError(null);
    setDrawerOpen(true);
  }

  function openEdit(service: Service) {
    setEditing(service);
    reset({
      code: service.code,
      name: service.name,
      tamilName: service.tamilName,
      description: service.description,
      isDeityMappingRequired: service.isDeityMappingRequired,
      deityMapping: service.deityMapping.map((d) => d._id),
      categoryDetails: service.categoryDetails.map((c) => ({
        category: c.category?._id ?? "",
        subCategory: c.subCategory?._id ?? "",
        salePrice: c.salePrice,
        displayOrder: c.displayOrder,
      })),
      generalLedger: service.generalLedger?._id ?? "",
      isFamilyMembersRequired: service.isFamilyMembersRequired,
      minFamilyMembers: service.minFamilyMembers,
      maxFamilyMembers: service.maxFamilyMembers,
      sessionRequired: service.sessionRequired,
      isInventoryRequired: service.isInventoryRequired,
      thresholdCount: service.thresholdCount,
      bookingCutoffDate: service.bookingCutoffDate ? service.bookingCutoffDate.slice(0, 10) : "",
      isPosAvailable: service.isPosAvailable,
      publicAvailability: service.publicAvailability,
      status: service.status,
    });
    update.setError(null);
    setDrawerOpen(true);
  }

  const submit = handleSubmit(async (values) => {
    const payload = {
      ...values,
      deityMapping: values.isDeityMappingRequired ? values.deityMapping : [],
      bookingCutoffDate: values.bookingCutoffDate || null,
    };
    const ok = editing ? await update.run(editing._id, payload) : await create.run(payload);
    if (ok !== undefined) {
      setDrawerOpen(false);
      if (editing) toast.updated("Service updated successfully.");
      else toast.created("Service created successfully.");
    }
  });

  const columns: DataTableColumn<Service>[] = [
    { key: "code", label: "Code", render: (s) => <span className="font-medium tabular-nums text-amber-700">{s.code}</span> },
    { key: "name", label: "Name", render: (s) => s.name },
    {
      key: "gl",
      label: "GL Account",
      render: (s) => <span className="text-ink-500">{s.generalLedger?.name ?? "—"}</span>,
    },
    {
      key: "categories",
      label: "Categories",
      render: (s) => <span className="tabular-nums">{s.categoryDetails.length}</span>,
    },
    { key: "status", label: "Status", render: (s) => <StatusPill status={s.status} /> },
  ];

  return (
    <>
      <DataTable
        title="Service Master"
        subtitle="Bookable services — deity mapping, categorisation, pricing, and availability."
        columns={columns}
        rows={items}
        rowKey={(s) => s._id}
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
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
        onCreate={canCreate ? openCreate : undefined}
        createLabel="Add Service"
        emptyMessage="No services yet — create the first one."
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
        title="Delete this service?"
        message={deleting ? `"${deleting.name}" will be removed.` : ""}
        confirmLabel="Delete service"
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
            toast.deleted("Service deleted successfully.");
          }
        }}
      />

      <FormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? "Edit Service" : "Add Service"}
        subtitle={editing ? `${editing.name} · ${editing.code}` : "Define a new bookable service."}
        error={create.error || update.error}
        maxWidthClassName="max-w-2xl"
        footer={
          <div className="flex gap-3">
            <DivineButton variant="ghost" type="button" onClick={() => setDrawerOpen(false)}>
              Cancel
            </DivineButton>
            <DivineButton type="submit" form="service-form" loading={create.submitting || update.submitting}>
              {editing ? "Save changes" : "Save"}
            </DivineButton>
          </div>
        }
      >
        <form id="service-form" onSubmit={submit} noValidate className="space-y-5">
          <div className="grid grid-cols-3 gap-4">
            <DivineInput label="Service Code" error={errors.code?.message} {...register("code")} />
            <DivineInput label="Service Name" error={errors.name?.message} {...register("name")} />
            <DivineInput label="Tamil Name" error={errors.tamilName?.message} {...register("tamilName")} />
          </div>

          <DivineTextarea label="Description" error={errors.description?.message} {...register("description")} />

          <div className="grid grid-cols-2 gap-4">
            <Controller
              control={control}
              name="isDeityMappingRequired"
              render={({ field }) => (
                <DivineRadioGroup label="Deity Mapping Required" value={field.value} onChange={field.onChange} />
              )}
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

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-wide text-amber-600">Category Details</p>
              <button
                type="button"
                onClick={() => append({ category: "", subCategory: "", salePrice: 0, displayOrder: fields.length + 1 })}
                className="flex items-center gap-1.5 rounded-lg border border-gold-500/30 px-2.5 py-1.5 text-[12px] text-amber-600 hover:border-gold-400/60 hover:bg-gold-500/5"
              >
                <PlusIcon /> Add Row
              </button>
            </div>

            {fields.length > 0 && (
              <div className="mb-1 grid grid-cols-[1fr_1fr_110px_90px_28px] gap-2 px-1 text-[11px] uppercase tracking-wide text-ink-500">
                <span>Category</span>
                <span>Sub Category</span>
                <span>Sale Price</span>
                <span>Display Order</span>
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
                <div key={row.id} className="grid grid-cols-[1fr_1fr_110px_90px_28px] items-start gap-2">
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
                  <input
                    type="number"
                    step="0.01"
                    {...register(`categoryDetails.${index}.salePrice`, { valueAsNumber: true })}
                    className="w-full rounded-xl border border-gold-500/20 bg-white px-3 py-2.5 text-[13.5px] text-ink-100 outline-none focus:border-gold-400/60"
                  />
                  <input
                    type="number"
                    {...register(`categoryDetails.${index}.displayOrder`, { valueAsNumber: true })}
                    className="w-full rounded-xl border border-gold-500/20 bg-white px-3 py-2.5 text-[13.5px] text-ink-100 outline-none focus:border-gold-400/60"
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(index)}
                    aria-label="Remove row"
                    className="mt-1 text-crimson-500 hover:text-crimson-600"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

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
          <p className="-mt-3 pl-1 text-[11.5px] text-ink-500">GST is derived from the selected GL account.</p>

          <div className="grid grid-cols-2 gap-4">
            <Controller
              control={control}
              name="isFamilyMembersRequired"
              render={({ field }) => (
                <DivineRadioGroup label="Family Members Required" value={field.value} onChange={field.onChange} />
              )}
            />
            <Controller
              control={control}
              name="sessionRequired"
              render={({ field }) => <DivineRadioGroup label="Session Required" value={field.value} onChange={field.onChange} />}
            />
          </div>

          {isFamilyMembersRequired && (
            <div className="grid grid-cols-2 gap-4">
              <DivineInput
                label="Minimum Family Members"
                type="number"
                error={errors.minFamilyMembers?.message}
                {...register("minFamilyMembers", { valueAsNumber: true })}
              />
              <DivineInput
                label="Maximum Family Members"
                type="number"
                error={errors.maxFamilyMembers?.message}
                {...register("maxFamilyMembers", { valueAsNumber: true })}
              />
            </div>
          )}

          <Controller
            control={control}
            name="isInventoryRequired"
            render={({ field }) => <DivineRadioGroup label="Inventory Applicable" value={field.value} onChange={field.onChange} />}
          />

          {isInventoryRequired && (
            <DivineInput
              label="Threshold"
              type="number"
              hint="Minimum stock level before low stock warning"
              error={errors.thresholdCount?.message}
              {...register("thresholdCount", { valueAsNumber: true })}
            />
          )}

          <div className="grid grid-cols-3 gap-4">
            <Controller
              control={control}
              name="bookingCutoffDate"
              render={({ field }) => (
                <DivineDatePicker label="Future Booking Cut-off Date" value={field.value} onChange={field.onChange} placeholder="No cut-off" />
              )}
            />
            <Controller
              control={control}
              name="isPosAvailable"
              render={({ field }) => <DivineRadioGroup label="POS Availability" value={field.value} onChange={field.onChange} />}
            />
            <Controller
              control={control}
              name="publicAvailability"
              render={({ field }) => (
                <DivineRadioGroup label="Customer Portal Availability" value={field.value} onChange={field.onChange} />
              )}
            />
          </div>

          <Controller
            control={control}
            name="status"
            render={({ field }) => (
              <DivineToggle label="Status" checked={field.value === 1} onChange={(checked) => field.onChange(checked ? 1 : 0)} />
            )}
          />
        </form>
      </FormDrawer>
    </>
  );
}
