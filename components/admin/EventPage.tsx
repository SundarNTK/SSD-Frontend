"use client";

import { useEffect, useState } from "react";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import DataTable, { StatusPill, EditIconButton, DeleteIconButton, MasterImageCell, type DataTableColumn } from "./DataTable";
import FormDrawer from "./FormDrawer";
import ConfirmDialog from "./ConfirmDialog";
import DivineInput from "../divine/DivineInput";
import DivineTextarea from "../divine/DivineTextarea";
import DivineListbox, { type ListboxOption } from "../divine/DivineListbox";
import DivineMultiSelect from "../divine/DivineMultiSelect";
import DivineDatePicker from "../divine/DivineDatePicker";
import DivineRadioGroup from "../divine/DivineRadioGroup";
import DivineOptionGroup from "../divine/DivineOptionGroup";
import DivineStatusSelect from "../divine/DivineStatusSelect";
import DivineButton from "../divine/DivineButton";
import DivineImageUpload from "../divine/DivineImageUpload";
import TamilNameField from "./TamilNameField";
import { withOptionalImage } from "../../lib/withOptionalImage";
import { PlusIcon, CalendarIcon, CloseIcon } from "../divine/icons";
import { formatTempleDate, parseISODateString } from "../../lib/datetime";
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
  image: string | null;
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
  const [createImage, setCreateImage] = useState<File | null>(null);
  const [editImage, setEditImage] = useState<File | null>(null);

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
    setValue,
    control,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: DEFAULT_VALUES });

  const { fields: slotFields, append: appendSlot, remove: removeSlot } = useFieldArray({ control, name: "slotDetails" });
  const isSlotRequired = watch("isSlotRequired");
  const startDate = watch("startDate");
  const endDate = watch("endDate");
  const nameValue = watch("name") ?? "";
  const tamilNameValue = watch("tamilName") ?? "";

  function openCreate() {
    setEditing(null);
    reset(DEFAULT_VALUES);
    setCreateImage(null);
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
    setEditImage(null);
    update.setError(null);
    setDrawerOpen(true);
  }

  const submit = handleSubmit(async (values) => {
    const payload = withOptionalImage(
      {
        ...values,
        subCategory: values.subCategory || null,
        slotDetails: values.isSlotRequired ? values.slotDetails : [],
      },
      editing ? editImage : createImage,
    );
    const ok = editing ? await update.run(editing._id, payload) : await create.run(payload);
    if (ok !== undefined) {
      setDrawerOpen(false);
      if (editing) toast.updated("Event updated successfully.");
      else toast.created("Event created successfully.");
    }
  });

  const columns: DataTableColumn<Event>[] = [
    { key: "image", label: "Image", render: (e) => <MasterImageCell src={e.image} alt={e.name} /> },
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
          <div className="flex justify-end gap-2">
            {canEdit && <EditIconButton onClick={() => openEdit(e)} />}
            {canCreate && <DeleteIconButton onClick={() => setDeleting(e)} />}
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
        maxWidthClassName="max-w-6xl"
        footer={
          <div className="flex justify-end gap-3">
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={() => setDrawerOpen(false)}>
              Cancel
            </DivineButton>
            <DivineButton variant="flame" fullWidth={false} type="submit" form="event-form" loading={create.submitting || update.submitting}>
              {editing ? "Save changes" : "Save"}
            </DivineButton>
          </div>
        }
      >
        <form id="event-form" onSubmit={submit} noValidate className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <DivineInput staticLabel label="Event Code" error={errors.code?.message} {...register("code")} />
            <DivineInput staticLabel label="Event Name" error={errors.name?.message} {...register("name")} />
            <TamilNameField staticLabel
              englishName={nameValue}
              value={tamilNameValue}
              onChange={(v) => setValue("tamilName", v, { shouldDirty: true })}
              error={errors.tamilName?.message}
            />
          </div>

          <DivineTextarea staticLabel label="Description" error={errors.description?.message} {...register("description")} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Controller
              control={control}
              name="startDate"
              render={({ field }) => (
                <DivineDatePicker staticLabel
                  label="Start Date"
                  value={field.value}
                  onChange={field.onChange}
                  maxDate={parseISODateString(endDate)}
                  error={errors.startDate?.message}
                />
              )}
            />
            <Controller
              control={control}
              name="endDate"
              render={({ field }) => (
                <DivineDatePicker staticLabel
                  label="End Date"
                  value={field.value}
                  onChange={field.onChange}
                  minDate={parseISODateString(startDate)}
                  error={errors.endDate?.message}
                />
              )}
            />
            <Controller
              control={control}
              name="isSlotRequired"
              render={({ field }) => <DivineRadioGroup boxed label="Slot Required" value={field.value} onChange={field.onChange} />}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <DivineInput staticLabel
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
                <DivineOptionGroup boxed
                  label="GST Classification"
                  value={field.value}
                  onChange={field.onChange}
                  options={GST_CLASSIFICATION_OPTIONS}
                  error={errors.gstClassification?.message}
                />
              )}
            />
            <DivineInput staticLabel
              label="Display Order"
              type="number"
              error={errors.displayOrder?.message}
              {...register("displayOrder", { valueAsNumber: true })}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Controller
              control={control}
              name="posVisibility"
              render={({ field }) => <DivineRadioGroup boxed label="POS Visibility" value={field.value} onChange={field.onChange} />}
            />
            <Controller
              control={control}
              name="publicVisibility"
              render={({ field }) => <DivineRadioGroup boxed label="Customer Portal Visibility" value={field.value} onChange={field.onChange} />}
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
            label="Event Image"
            value={editing?.image}
            onChange={editing ? setEditImage : setCreateImage}
          />

          {isSlotRequired && (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-orange-100 bg-orange-50 px-4 py-3">
                <div>
                  <p className="flex items-center gap-2 text-[13px] font-bold text-ink-100">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-orange-100 text-orange-600">
                      <CalendarIcon className="h-4 w-4" />
                    </span>
                    SLOT DETAILS
                  </p>
                  <p className="mt-1 text-[11.5px] text-ink-500">Slot date must be between Event Start Date and End Date.</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    appendSlot({ slotName: "", date: "", startTime: "", endTime: "", totalSeats: 0, status: 1 })
                  }
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-orange-300 bg-white px-2.5 py-1.5 text-[12px] font-medium text-orange-600 transition-colors hover:bg-orange-50"
                >
                  <PlusIcon /> Add Slot
                </button>
              </div>

              <div className="overflow-x-auto">
              {slotFields.length > 0 && (
                <div className="hidden min-w-[56rem] grid-cols-[minmax(10rem,1.4fr)_10.5rem_8rem_8rem_7rem_11rem_2.75rem] gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2 text-[11px] uppercase tracking-wide text-gray-500 lg:grid">
                  <span>Slot Name</span>
                  <span>Slot Date</span>
                  <span>Start Time</span>
                  <span>End Time</span>
                  <span>No. of Seats</span>
                  <span>Status</span>
                  <span />
                </div>
              )}

              <div className="divide-y divide-gray-100">
                {slotFields.length === 0 && <p className="px-4 py-3 text-[12.5px] text-ink-500">No slots yet.</p>}
                {slotFields.map((row, index) => (
                  <div
                    key={row.id}
                    className="grid min-w-0 grid-cols-1 items-start gap-2 px-4 py-3 sm:grid-cols-2 lg:min-w-[56rem] lg:grid-cols-[minmax(10rem,1.4fr)_10.5rem_8rem_8rem_7rem_11rem_2.75rem]"
                  >
                    <input
                      placeholder="Slot Name"
                      {...register(`slotDetails.${index}.slotName`)}
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[13.5px] text-ink-100 outline-none focus:border-gold-400/60 sm:col-span-2 lg:col-span-1"
                    />
                    <input
                      type="date"
                      min={startDate || undefined}
                      max={endDate || undefined}
                      {...register(`slotDetails.${index}.date`)}
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[13.5px] text-ink-100 outline-none focus:border-gold-400/60"
                    />
                    <input
                      type="time"
                      {...register(`slotDetails.${index}.startTime`)}
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[13.5px] text-ink-100 outline-none focus:border-gold-400/60"
                    />
                    <input
                      type="time"
                      {...register(`slotDetails.${index}.endTime`)}
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[13.5px] text-ink-100 outline-none focus:border-gold-400/60"
                    />
                    <input
                      type="number"
                      {...register(`slotDetails.${index}.totalSeats`, { valueAsNumber: true })}
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-[13.5px] text-ink-100 outline-none focus:border-gold-400/60"
                    />
                    <Controller
                      control={control}
                      name={`slotDetails.${index}.status`}
                      render={({ field }) => (
                        <DivineListbox
                          value={String(field.value)}
                          onChange={(v) => field.onChange(Number(v))}
                          options={SLOT_STATUS_OPTIONS}
                          clearable={false}
                        />
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => removeSlot(index)}
                      aria-label="Remove slot"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-crimson-500/10 text-crimson-500 transition-colors hover:bg-crimson-500/20 lg:justify-self-start"
                    >
                      <CloseIcon className="h-4 w-4" />
                      <span className="sr-only">Remove slot</span>
                    </button>
                  </div>
                ))}
              </div>
              </div>
              {errors.slotDetails?.message && (
                <p className="px-4 pb-3 text-[12.5px] text-crimson-500">{errors.slotDetails.message}</p>
              )}
            </div>
          )}
        </form>
      </FormDrawer>
    </>
  );
}
