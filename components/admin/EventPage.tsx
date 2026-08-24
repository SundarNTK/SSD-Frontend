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
import DivineOptionGroup from "../divine/DivineOptionGroup";
import DivineToggle from "../divine/DivineToggle";
import DivineButton from "../divine/DivineButton";
import { PlusIcon } from "../divine/icons";
import { formatTempleDate } from "../../lib/datetime";
import { api, unwrap, type ApiEnvelope } from "../../lib/api";
import { useApiResource } from "../../lib/useApiResource";
import { MODULES, usePermissions } from "../../lib/permissions";
import { toast } from "../../lib/toastStore";

type Ref = { _id: string; name: string };

export type Event = {
  _id: string;
  code: string;
  name: string;
  tamilName: string;
  description: string;
  category: Ref | null;
  subCategory: Ref | null;
  deityMapping: Ref[];
  startDate: string;
  endDate: string;
  isSlotRequired: boolean;
  slotDetails: {
    slotName: string;
    date: string;
    startTime: string;
    endTime: string;
    totalSeats: number;
    status: number;
  }[];
  salePrice: number;
  gstClassification: string;
  displayOrder: number;
  posVisibility: boolean;
  publicVisibility: boolean;
  status: number;
};

const GST_CLASSIFICATION_OPTIONS = [
  { value: "APPLICABLE", label: "Applicable" },
  { value: "EXEMPTED", label: "Exempted" },
  { value: "OUT_OF_SCOPE", label: "Out of Scope" },
];

const SLOT_STATUS_OPTIONS = [
  { value: "1", label: "Active" },
  { value: "0", label: "Inactive" },
];

const slotDetailSchema = z.object({
  slotName: z.string().trim().min(1, "Required"),
  date: z.string().min(1, "Required"),
  startTime: z.string().min(1, "Required"),
  endTime: z.string().min(1, "Required"),
  totalSeats: z.number().int().min(0),
  status: z.number(),
});

const schema = z
  .object({
    code: z.string().trim().min(1, "Code is required").max(30),
    name: z.string().trim().min(1, "Name is required").max(150),
    tamilName: z.string().trim(),
    description: z.string().trim().max(1000),
    category: z.string().min(1, "Category is required"),
    subCategory: z.string(),
    deityMapping: z.array(z.string()),
    startDate: z.string().min(1, "Start date is required"),
    endDate: z.string().min(1, "End date is required"),
    isSlotRequired: z.boolean(),
    slotDetails: z.array(slotDetailSchema),
    salePrice: z.number().min(0, "Must be 0 or more"),
    gstClassification: z.string().min(1, "GST classification is required"),
    displayOrder: z.number().int().min(0),
    posVisibility: z.boolean(),
    publicVisibility: z.boolean(),
    status: z.number(),
  })
  .refine((data) => !data.startDate || !data.endDate || data.endDate >= data.startDate, {
    message: "End date cannot be before the start date",
    path: ["endDate"],
  })
  .refine((data) => !data.isSlotRequired || data.slotDetails.length > 0, {
    message: "Add at least one slot",
    path: ["slotDetails"],
  })
  .refine(
    (data) =>
      !data.isSlotRequired ||
      data.slotDetails.every((s) => (!s.date || !data.startDate || s.date >= data.startDate) && (!s.date || !data.endDate || s.date <= data.endDate)),
    { message: "Every slot date must fall between the start and end date", path: ["slotDetails"] }
  );

type FormValues = z.infer<typeof schema>;

const DEFAULT_PAGE_SIZE = 10;

const DEFAULT_VALUES: FormValues = {
  code: "",
  name: "",
  tamilName: "",
  description: "",
  category: "",
  subCategory: "",
  deityMapping: [],
  startDate: "",
  endDate: "",
  isSlotRequired: false,
  slotDetails: [],
  salePrice: 0,
  gstClassification: "",
  displayOrder: 1,
  posVisibility: true,
  publicVisibility: true,
  status: 1,
};

async function fetchOptions(path: string, labelField = "name"): Promise<ListboxOption[]> {
  const res = await api.get<ApiEnvelope<{ items: Record<string, unknown>[] }>>(path, {
    params: { status: 1, pageSize: 100 },
  });
  return unwrap(res).items.map((row) => ({ value: String(row._id), label: String(row[labelField]) }));
}

export default function EventPage() {
  const { can } = usePermissions();
  const canCreate = can(MODULES.events, "fullAccess");
  const canEdit = can(MODULES.events, "edit");
  const { items, total, list, create, update, remove } = useApiResource<Event>(api, "/masters/events");

  const [categoryOptions, setCategoryOptions] = useState<ListboxOption[]>([]);
  const [subCategoryOptions, setSubCategoryOptions] = useState<ListboxOption[]>([]);
  const [deityOptions, setDeityOptions] = useState<ListboxOption[]>([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Event | null>(null);
  const [deleting, setDeleting] = useState<Event | null>(null);

  useEffect(() => {
    fetchOptions("/masters/categories").then(setCategoryOptions);
    fetchOptions("/masters/sub-categories").then(setSubCategoryOptions);
    fetchOptions("/masters/deities").then(setDeityOptions);
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
    control,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: DEFAULT_VALUES });

  const { fields: slotFields, append: appendSlot, remove: removeSlot } = useFieldArray({ control, name: "slotDetails" });
  const isSlotRequired = watch("isSlotRequired");
  const startDate = watch("startDate");
  const endDate = watch("endDate");

  function openCreate() {
    setEditing(null);
    reset(DEFAULT_VALUES);
    create.setError(null);
    setDrawerOpen(true);
  }

  function openEdit(event: Event) {
    setEditing(event);
    reset({
      code: event.code,
      name: event.name,
      tamilName: event.tamilName,
      description: event.description,
      category: event.category?._id ?? "",
      subCategory: event.subCategory?._id ?? "",
      deityMapping: event.deityMapping.map((d) => d._id),
      startDate: event.startDate.slice(0, 10),
      endDate: event.endDate.slice(0, 10),
      isSlotRequired: event.isSlotRequired,
      slotDetails: event.slotDetails.map((s) => ({
        slotName: s.slotName,
        date: s.date.slice(0, 10),
        startTime: s.startTime,
        endTime: s.endTime,
        totalSeats: s.totalSeats,
        status: s.status,
      })),
      salePrice: event.salePrice,
      gstClassification: event.gstClassification,
      displayOrder: event.displayOrder,
      posVisibility: event.posVisibility,
      publicVisibility: event.publicVisibility,
      status: event.status,
    });
    update.setError(null);
    setDrawerOpen(true);
  }

  const submit = handleSubmit(async (values) => {
    const payload = {
      ...values,
      subCategory: values.subCategory || null,
      slotDetails: values.isSlotRequired ? values.slotDetails : [],
    };
    const ok = editing ? await update.run(editing._id, payload) : await create.run(payload);
    if (ok !== undefined) {
      setDrawerOpen(false);
      if (editing) toast.updated("Event updated successfully.");
      else toast.created("Event created successfully.");
    }
  });

  const columns: DataTableColumn<Event>[] = [
    { key: "code", label: "Code", render: (e) => <span className="font-medium tabular-nums text-amber-700">{e.code}</span> },
    { key: "name", label: "Name", render: (e) => e.name },
    {
      key: "category",
      label: "Category",
      render: (e) => <span className="text-ink-500">{e.category?.name ?? "—"}</span>,
    },
    {
      key: "dates",
      label: "Dates",
      render: (e) => (
        <span className="tabular-nums text-ink-500">
          {formatTempleDate(new Date(e.startDate))} – {formatTempleDate(new Date(e.endDate))}
        </span>
      ),
    },
    { key: "status", label: "Status", render: (e) => <StatusPill status={e.status} /> },
  ];

  return (
    <>
      <DataTable
        title="Event Master"
        subtitle="Temple events — deity mapping, date range, slot capacity, and visibility."
        columns={columns}
        rows={items}
        rowKey={(e) => e._id}
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
        createLabel="Add Event"
        emptyMessage="No events yet — create the first one."
        rowActions={(e) => (
          <div className="flex justify-end gap-3">
            {canEdit && (
              <button onClick={() => openEdit(e)} className="text-[12.5px] text-ink-300 hover:text-ink-100 hover:underline">
                Edit
              </button>
            )}
            {canCreate && (
              <button onClick={() => setDeleting(e)} className="text-[12.5px] text-crimson-500 hover:underline">
                Delete
              </button>
            )}
          </div>
        )}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this event?"
        message={deleting ? `"${deleting.name}" will be removed.` : ""}
        confirmLabel="Delete event"
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
            toast.deleted("Event deleted successfully.");
          }
        }}
      />

      <FormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? "Edit Event" : "Add Event"}
        subtitle={editing ? `${editing.name} · ${editing.code}` : "Define a new temple event."}
        error={create.error || update.error}
        maxWidthClassName="max-w-2xl"
        footer={
          <div className="flex justify-end gap-3">
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={() => setDrawerOpen(false)}>
              Cancel
            </DivineButton>
            <DivineButton fullWidth={false} type="submit" form="event-form" loading={create.submitting || update.submitting}>
              {editing ? "Save changes" : "Save"}
            </DivineButton>
          </div>
        }
      >
        <form id="event-form" onSubmit={submit} noValidate className="space-y-5">
          <div className="grid grid-cols-3 gap-4">
            <DivineInput label="Event Code" error={errors.code?.message} {...register("code")} />
            <DivineInput label="Event Name" error={errors.name?.message} {...register("name")} />
            <DivineInput label="Tamil Name" error={errors.tamilName?.message} {...register("tamilName")} />
          </div>

          <DivineTextarea label="Description" error={errors.description?.message} {...register("description")} />

          <div className="grid grid-cols-3 gap-4">
            <Controller
              control={control}
              name="category"
              render={({ field }) => (
                <DivineListbox
                  label="Category"
                  value={field.value}
                  onChange={field.onChange}
                  options={categoryOptions}
                  placeholder="Select Category"
                  error={errors.category?.message}
                />
              )}
            />
            <Controller
              control={control}
              name="subCategory"
              render={({ field }) => (
                <DivineListbox
                  label="Sub Category"
                  value={field.value}
                  onChange={field.onChange}
                  options={subCategoryOptions}
                  placeholder="Select Sub Category"
                />
              )}
            />
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
                />
              )}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Controller
              control={control}
              name="startDate"
              render={({ field }) => (
                <DivineDatePicker label="Start Date" value={field.value} onChange={field.onChange} error={errors.startDate?.message} />
              )}
            />
            <Controller
              control={control}
              name="endDate"
              render={({ field }) => (
                <DivineDatePicker label="End Date" value={field.value} onChange={field.onChange} error={errors.endDate?.message} />
              )}
            />
            <Controller
              control={control}
              name="isSlotRequired"
              render={({ field }) => <DivineRadioGroup label="Slot Required" value={field.value} onChange={field.onChange} />}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <DivineInput
              label="Sale Price (GST Inclusive)"
              type="number"
              step="0.01"
              error={errors.salePrice?.message}
              {...register("salePrice", { valueAsNumber: true })}
            />
            <Controller
              control={control}
              name="gstClassification"
              render={({ field }) => (
                <DivineOptionGroup
                  label="GST Classification"
                  value={field.value}
                  onChange={field.onChange}
                  options={GST_CLASSIFICATION_OPTIONS}
                  error={errors.gstClassification?.message}
                />
              )}
            />
            <DivineInput
              label="Display Order"
              type="number"
              error={errors.displayOrder?.message}
              {...register("displayOrder", { valueAsNumber: true })}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Controller
              control={control}
              name="posVisibility"
              render={({ field }) => <DivineRadioGroup label="POS Visibility" value={field.value} onChange={field.onChange} />}
            />
            <Controller
              control={control}
              name="publicVisibility"
              render={({ field }) => <DivineRadioGroup label="Customer Portal Visibility" value={field.value} onChange={field.onChange} />}
            />
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <DivineToggle label="Status" checked={field.value === 1} onChange={(checked) => field.onChange(checked ? 1 : 0)} />
              )}
            />
          </div>

          {isSlotRequired && (
            <div>
              <div className="mb-2 flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-amber-600">Slot Details</p>
                  <p className="mt-0.5 text-[11.5px] text-ink-500">Slot date must be between Event Start Date and End Date.</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    appendSlot({ slotName: "", date: "", startTime: "", endTime: "", totalSeats: 0, status: 1 })
                  }
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gold-500/30 px-2.5 py-1.5 text-[12px] text-amber-600 hover:border-gold-400/60 hover:bg-gold-500/5"
                >
                  <PlusIcon /> Add Slot
                </button>
              </div>

              {slotFields.length > 0 && (
                <div className="mb-1 grid grid-cols-[1fr_128px_100px_100px_86px_96px_24px] gap-2 px-1 text-[11px] uppercase tracking-wide text-ink-500">
                  <span>Slot Name</span>
                  <span>Slot Date</span>
                  <span>Start Time</span>
                  <span>End Time</span>
                  <span>No. of Seats</span>
                  <span>Status</span>
                  <span />
                </div>
              )}

              <div className="space-y-2">
                {slotFields.length === 0 && (
                  <p className="rounded-xl border border-gold-500/15 bg-ivory-100 px-3 py-2.5 text-[12.5px] text-ink-500">
                    No slots yet.
                  </p>
                )}
                {slotFields.map((row, index) => (
                  <div key={row.id} className="grid grid-cols-[1fr_128px_100px_100px_86px_96px_24px] items-start gap-2">
                    <input
                      placeholder="Slot Name"
                      {...register(`slotDetails.${index}.slotName`)}
                      className="w-full rounded-xl border border-gold-500/20 bg-white px-3 py-2.5 text-[13.5px] text-ink-100 outline-none focus:border-gold-400/60"
                    />
                    <input
                      type="date"
                      min={startDate || undefined}
                      max={endDate || undefined}
                      {...register(`slotDetails.${index}.date`)}
                      className="w-full rounded-xl border border-gold-500/20 bg-white px-3 py-2.5 text-[13.5px] text-ink-100 outline-none focus:border-gold-400/60"
                    />
                    <input
                      type="time"
                      {...register(`slotDetails.${index}.startTime`)}
                      className="w-full rounded-xl border border-gold-500/20 bg-white px-3 py-2.5 text-[13.5px] text-ink-100 outline-none focus:border-gold-400/60"
                    />
                    <input
                      type="time"
                      {...register(`slotDetails.${index}.endTime`)}
                      className="w-full rounded-xl border border-gold-500/20 bg-white px-3 py-2.5 text-[13.5px] text-ink-100 outline-none focus:border-gold-400/60"
                    />
                    <input
                      type="number"
                      {...register(`slotDetails.${index}.totalSeats`, { valueAsNumber: true })}
                      className="w-full rounded-xl border border-gold-500/20 bg-white px-3 py-2.5 text-[13.5px] text-ink-100 outline-none focus:border-gold-400/60"
                    />
                    <Controller
                      control={control}
                      name={`slotDetails.${index}.status`}
                      render={({ field }) => (
                        <DivineListbox
                          value={String(field.value)}
                          onChange={(v) => field.onChange(Number(v))}
                          options={SLOT_STATUS_OPTIONS}
                        />
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => removeSlot(index)}
                      aria-label="Remove slot"
                      className="mt-1 text-crimson-500 hover:text-crimson-600"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              {errors.slotDetails?.message && (
                <p className="mt-1.5 pl-1 text-[12.5px] text-crimson-500">{errors.slotDetails.message}</p>
              )}
            </div>
          )}
        </form>
      </FormDrawer>
    </>
  );
}
