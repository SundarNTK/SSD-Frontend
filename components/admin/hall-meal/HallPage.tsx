"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import DataTable, { StatusToggleCell, EditIconButton, DeleteIconButton, type DataTableColumn } from "../DataTable";
import FormDrawer from "../FormDrawer";
import ConfirmDialog from "../ConfirmDialog";
import DivineInput from "../../divine/DivineInput";
import DivineListbox from "../../divine/DivineListbox";
import DivineStatusSelect from "../../divine/DivineStatusSelect";
import DivineButton from "../../divine/DivineButton";
import { FORM_LABEL } from "../../divine/formFieldStyles";
import { resolveImageUrl } from "../../../lib/imageUrl";
import { api } from "../../../lib/api";
import { useApiResource, type WriteBody } from "../../../lib/useApiResource";
import { toast } from "../../../lib/toastStore";
import { patchMasterStatus } from "../../../lib/patchMasterStatus";
import { usePageSize } from "../../../lib/usePageSize";

type HallCategory = { _id: string; name: string; status: number };

export type Hall = {
  _id: string;
  name: string;
  code: string;
  category: HallCategory | string;
  capacity: number;
  hallImages: string[];
  floorPlan: string | null;
  individualBookingRate: number | null;
  minimumBookingDuration: number | null;
  depositAmount: number;
  status: number;
};

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  code: z.string().trim().min(1, "Code is required").max(30),
  category: z.string().min(1, "Hall Category is required"),
  capacity: z.number().int().min(1, "Capacity must be greater than zero"),
  individualBookingRate: z.number().min(0).nullable(),
  minimumBookingDuration: z.number().min(0).nullable(),
  depositAmount: z.number().min(0),
  status: z.number(),
});

type FormValues = z.infer<typeof schema>;

type Thumbnail = { key: string; src: string; onRemove: () => void };

/**
 * Both Hall Images and Floor Plan render through this one card so they
 * read as the same field type — a bordered white box, square thumbnails
 * (matching MasterImageCell's `rounded-lg` list style, not the circular
 * avatar treatment DivineImageUpload uses elsewhere), an explicit
 * single-vs-multiple + size caption, and a delete button on every
 * thumbnail, saved ones included. `multiple=false` caps the field at one
 * thumbnail — Floor Plan reuses the same gallery grid rather than a
 * separate single-image component.
 */
function MediaGalleryField({
  label,
  hint,
  multiple,
  thumbnails,
  onAdd,
  addLabel,
}: {
  label: string;
  hint: string;
  multiple: boolean;
  thumbnails: Thumbnail[];
  onAdd: (files: FileList | null) => void;
  addLabel: string;
}) {
  return (
    <div className="w-full">
      <p className={FORM_LABEL}>{label}</p>
      <div className="rounded-xl border border-gold-500/20 bg-white p-3">
        <div className="flex flex-wrap gap-2">
          {thumbnails.map((t) => (
            <span key={t.key} className="relative">
              <img src={t.src} alt="" className="h-16 w-16 rounded-lg border border-gold-500/25 object-cover" />
              <button
                type="button"
                onClick={t.onRemove}
                aria-label="Remove image"
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-crimson-600 text-white"
              >
                ×
              </button>
            </span>
          ))}
          {thumbnails.length === 0 && (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gold-500/25 bg-navy-900">
              <svg className="h-7 w-7 text-ink-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 16l4.5-5 3.5 4 3-3.5L20 16" strokeLinecap="round" strokeLinejoin="round" />
                <rect x="3" y="4" width="18" height="16" rx="2" />
              </svg>
            </span>
          )}
        </div>
        <label className="mt-3 inline-flex cursor-pointer items-center rounded-lg border border-gold-500/30 px-3 py-1.5 text-[12.5px] text-amber-600 transition-colors hover:border-gold-400/60 hover:bg-gold-500/5">
          {addLabel}
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple={multiple} className="hidden" onChange={(e) => onAdd(e.target.files)} />
        </label>
        <p className="mt-1.5 text-[11.5px] text-ink-500">{hint}</p>
      </div>
    </div>
  );
}

/** Reachable only by a Super Admin — see hall-meal/layout.tsx and the API's superAdminOnly middleware. */
export default function HallPage() {
  const { items, total, list, create, update, remove } = useApiResource<Hall>(api, "/hall-meal/halls");
  const categoryResource = useApiResource<HallCategory>(api, "/hall-meal/hall-categories");

  useEffect(() => {
    categoryResource.list.run({ status: 1, pageSize: 100 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const categoryOptions = categoryResource.items.map((c) => ({ value: c._id, label: c.name }));

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = usePageSize();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Hall | null>(null);
  const [deleting, setDeleting] = useState<Hall | null>(null);

  // Hall Images: everything already saved that hasn't been deleted
  // (`keptHallImages`), plus whatever's freshly picked and not yet
  // uploaded (`newHallImages`/`newHallImagePreviews`) — kept as two lists
  // because only the new ones are actual Files to upload; the kept ones
  // are just URLs the server already has.
  const [keptHallImages, setKeptHallImages] = useState<string[]>([]);
  const [newHallImages, setNewHallImages] = useState<File[]>([]);
  const [newHallImagePreviews, setNewHallImagePreviews] = useState<string[]>([]);

  // Floor Plan: same shape, capped at one file.
  const [keptFloorPlan, setKeptFloorPlan] = useState<string | null>(null);
  const [newFloorPlanFile, setNewFloorPlanFile] = useState<File | null>(null);
  const [newFloorPlanPreview, setNewFloorPlanPreview] = useState<string | null>(null);

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
    defaultValues: {
      name: "",
      code: "",
      category: "",
      capacity: 1,
      individualBookingRate: null,
      minimumBookingDuration: null,
      depositAmount: 0,
      status: 1,
    },
  });

  function resetNewMedia() {
    newHallImagePreviews.forEach((url) => URL.revokeObjectURL(url));
    setNewHallImages([]);
    setNewHallImagePreviews([]);
    if (newFloorPlanPreview) URL.revokeObjectURL(newFloorPlanPreview);
    setNewFloorPlanFile(null);
    setNewFloorPlanPreview(null);
  }

  function addHallImages(files: FileList | null) {
    if (!files) return;
    const picked = Array.from(files);
    setNewHallImages((prev) => [...prev, ...picked]);
    setNewHallImagePreviews((prev) => [...prev, ...picked.map((f) => URL.createObjectURL(f))]);
  }

  function removeKeptHallImage(src: string) {
    setKeptHallImages((prev) => prev.filter((s) => s !== src));
  }

  function removeNewHallImage(index: number) {
    URL.revokeObjectURL(newHallImagePreviews[index]);
    setNewHallImages((prev) => prev.filter((_, i) => i !== index));
    setNewHallImagePreviews((prev) => prev.filter((_, i) => i !== index));
  }

  function addFloorPlan(files: FileList | null) {
    const file = files?.[0] ?? null;
    if (newFloorPlanPreview) URL.revokeObjectURL(newFloorPlanPreview);
    if (!file) {
      setNewFloorPlanFile(null);
      setNewFloorPlanPreview(null);
      return;
    }
    setNewFloorPlanFile(file);
    setNewFloorPlanPreview(URL.createObjectURL(file));
  }

  /** One "remove" for the Floor Plan slot regardless of whether it's showing the saved plan or a not-yet-uploaded pick. */
  function removeFloorPlan() {
    if (newFloorPlanPreview) URL.revokeObjectURL(newFloorPlanPreview);
    setNewFloorPlanFile(null);
    setNewFloorPlanPreview(null);
    setKeptFloorPlan(null);
  }

  function openCreate() {
    setEditing(null);
    reset({ name: "", code: "", category: "", capacity: 1, individualBookingRate: null, minimumBookingDuration: null, depositAmount: 0, status: 1 });
    resetNewMedia();
    setKeptHallImages([]);
    setKeptFloorPlan(null);
    create.setError(null);
    setDrawerOpen(true);
  }

  function openEdit(row: Hall) {
    setEditing(row);
    reset({
      name: row.name,
      code: row.code,
      category: typeof row.category === "string" ? row.category : row.category._id,
      capacity: row.capacity,
      individualBookingRate: row.individualBookingRate,
      minimumBookingDuration: row.minimumBookingDuration,
      depositAmount: row.depositAmount,
      status: row.status,
    });
    resetNewMedia();
    setKeptHallImages(row.hallImages);
    setKeptFloorPlan(row.floorPlan);
    update.setError(null);
    setDrawerOpen(true);
  }

  function toPayload(values: FormValues): WriteBody {
    const hallImagesChanged = editing ? JSON.stringify(keptHallImages) !== JSON.stringify(editing.hallImages) : keptHallImages.length > 0;
    const floorPlanChanged = editing ? keptFloorPlan !== editing.floorPlan : Boolean(keptFloorPlan);
    const hasNewFiles = newHallImages.length > 0 || Boolean(newFloorPlanFile);

    if (!hasNewFiles && !hallImagesChanged && !floorPlanChanged) return values;

    const form = new FormData();
    Object.entries(values).forEach(([key, val]) => {
      if (val === null || val === undefined) return;
      form.append(key, String(val));
    });
    // Always send both alongside any new files, so the server can tell "keep
    // these, drop the rest" apart from "nothing was touched" — see
    // common/middleware/upload.js's uploadHallMedia on the backend.
    form.append("existingHallImages", JSON.stringify(keptHallImages));
    newHallImages.forEach((file) => form.append("hallImages", file));
    form.append("existingFloorPlan", keptFloorPlan ?? "");
    if (newFloorPlanFile) form.append("floorPlan", newFloorPlanFile);
    return form;
  }

  const submit = handleSubmit(async (values) => {
    const ok = editing ? await update.run(editing._id, toPayload(values)) : await create.run(toPayload(values));
    if (ok !== undefined) {
      setDrawerOpen(false);
      toast[editing ? "updated" : "created"]("Hall " + (editing ? "updated" : "created") + " successfully.");
    }
  });

  const columns: DataTableColumn<Hall>[] = [
    { key: "name", label: "Hall Name", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "code", label: "Hall Code", render: (r) => <span className="tabular-nums text-amber-700">{r.code}</span> },
    { key: "category", label: "Hall Category", render: (r) => <span>{typeof r.category === "string" ? "—" : r.category.name}</span> },
    { key: "capacity", label: "Capacity", render: (r) => <span className="tabular-nums">{r.capacity}</span> },
    {
      key: "status",
      label: "Status",
      render: (r) => <StatusToggleCell status={r.status} canEdit onChange={(status) => patchMasterStatus(update, r._id, status, "Hall")} />,
    },
  ];

  const hallImageThumbnails: Thumbnail[] = [
    ...keptHallImages.map((src) => ({ key: src, src: resolveImageUrl(src) ?? src, onRemove: () => removeKeptHallImage(src) })),
    ...newHallImagePreviews.map((src, i) => ({ key: `new-${i}-${src}`, src, onRemove: () => removeNewHallImage(i) })),
  ];
  const floorPlanThumbnails: Thumbnail[] = newFloorPlanPreview
    ? [{ key: "new-floor-plan", src: newFloorPlanPreview, onRemove: removeFloorPlan }]
    : keptFloorPlan
      ? [{ key: "kept-floor-plan", src: resolveImageUrl(keptFloorPlan) ?? keptFloorPlan, onRemove: removeFloorPlan }]
      : [];

  return (
    <>
      <DataTable
        title="Hall Master"
        subtitle="The physical, bookable rooms — capacity, images, floor plan, individual rate and deposit."
        columns={columns}
        rows={items}
        rowKey={(r) => r._id}
        loading={list.submitting}
        search={search}
        onSearchChange={(v) => { setPage(1); setSearch(v); }}
        searchPlaceholder="Search halls…"
        statusFilter={statusFilter}
        onStatusFilterChange={(v) => { setPage(1); setStatusFilter(v); }}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPage(1); setPageSize(size); }}
        onCreate={openCreate}
        createLabel="Add Hall"
        emptyMessage="No Halls yet — create the first one."
        rowActions={(r) => (
          <div className="flex justify-end gap-2">
            <EditIconButton onClick={() => openEdit(r)} />
            <DeleteIconButton onClick={() => setDeleting(r)} />
          </div>
        )}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Deactivate this Hall?"
        message={deleting ? `"${deleting.name}" will be deactivated. This is blocked while a future Booking or an Active Hall Package still uses it.` : ""}
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
            toast.deleted("Hall deactivated successfully.");
          }
        }}
      />

      <FormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? "Edit Hall" : "Add Hall"}
        subtitle={editing ? editing.name : "Define a new bookable Hall."}
        maxWidthClassName="max-w-3xl"
        error={create.error || update.error}
        footer={
          <div className="flex justify-end gap-3">
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={() => setDrawerOpen(false)}>
              Cancel
            </DivineButton>
            <DivineButton variant="flame" fullWidth={false} type="submit" form="hall-form" loading={create.submitting || update.submitting}>
              {editing ? "Save changes" : "Save"}
            </DivineButton>
          </div>
        }
      >
        <form id="hall-form" onSubmit={submit} noValidate className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <DivineInput staticLabel label="Hall Name" error={errors.name?.message} {...register("name")} />
            <DivineInput staticLabel label="Hall Code" error={errors.code?.message} {...register("code")} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Controller
              control={control}
              name="category"
              render={({ field }) => (
                <DivineListbox label="Hall Category" value={field.value} onChange={field.onChange} options={categoryOptions} error={errors.category?.message} />
              )}
            />
            <DivineInput
              staticLabel
              label="Capacity"
              type="number"
              error={errors.capacity?.message}
              {...register("capacity", { valueAsNumber: true })}
            />
            <Controller
              control={control}
              name="status"
              render={({ field }) => <DivineStatusSelect value={field.value} onChange={field.onChange} />}
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <DivineInput
              staticLabel
              label="Individual Booking Rate"
              type="number"
              hint="Only where this Hall may be booked on its own"
              {...register("individualBookingRate", { valueAsNumber: true, setValueAs: (v) => (v === "" || Number.isNaN(v) ? null : v) })}
            />
            <DivineInput
              staticLabel
              label="Minimum Booking Duration (hrs)"
              type="number"
              {...register("minimumBookingDuration", { valueAsNumber: true, setValueAs: (v) => (v === "" || Number.isNaN(v) ? null : v) })}
            />
            <DivineInput
              staticLabel
              label="Deposit Amount"
              type="number"
              error={errors.depositAmount?.message}
              {...register("depositAmount", { valueAsNumber: true })}
            />
          </div>

          {/* Same card, same button/caption style for both — they differ
              only in count: Hall Images is a gallery of venue photos (up
              to 6), Floor Plan is a single diagram. Every thumbnail, saved
              or freshly picked, carries its own delete button. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <MediaGalleryField
              label="Hall Images"
              hint="Multiple photos · up to 6 · JPG, PNG or WebP · up to 100 KB each"
              multiple
              thumbnails={hallImageThumbnails}
              onAdd={addHallImages}
              addLabel={hallImageThumbnails.length > 0 ? "Add More Images" : "Choose Hall Images"}
            />
            <MediaGalleryField
              label="Floor Plan"
              hint="Single file · JPG, PNG or WebP · up to 100 KB"
              multiple={false}
              thumbnails={floorPlanThumbnails}
              onAdd={addFloorPlan}
              addLabel={floorPlanThumbnails.length > 0 ? "Replace Floor Plan" : "Choose Floor Plan"}
            />
          </div>
        </form>
      </FormDrawer>
    </>
  );
}
