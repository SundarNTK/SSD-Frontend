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
import DivineMultiSelect from "../../divine/DivineMultiSelect";
import DivineToggle from "../../divine/DivineToggle";
import DivineStatusSelect from "../../divine/DivineStatusSelect";
import DivineMasterImageUpload from "../../divine/DivineMasterImageUpload";
import DivineButton from "../../divine/DivineButton";
import { api } from "../../../lib/api";
import { useApiResource } from "../../../lib/useApiResource";
import { toast } from "../../../lib/toastStore";
import { withOptionalImage } from "../../../lib/withOptionalImage";
import { patchMasterStatus } from "../../../lib/patchMasterStatus";
import { usePageSize } from "../../../lib/usePageSize";

type Ref = { _id: string; name: string };

export type HallPackage = {
  _id: string;
  name: string;
  hallPurpose: Ref | string;
  halls: (Ref | string)[];
  standardSessionDuration: number;
  packagePrice: number;
  bookingAdvanceAmount: number;
  depositAmount: number;
  additionalHourRate: number;
  gstApplicable: boolean;
  description: string;
  additionalServices: (Ref | string)[];
  termsAndConditions: string;
  image: string | null;
  status: number;
};

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(150),
  hallPurpose: z.string().min(1, "Hall Purpose is required"),
  halls: z.array(z.string()).min(1, "At least one Hall is required"),
  standardSessionDuration: z.number().gt(0, "Must be greater than zero"),
  packagePrice: z.number().min(0),
  bookingAdvanceAmount: z.number().min(0),
  depositAmount: z.number().min(0),
  additionalHourRate: z.number().min(0),
  gstApplicable: z.boolean(),
  description: z.string().trim().max(1000),
  additionalServices: z.array(z.string()),
  termsAndConditions: z.string().trim().max(2000),
  status: z.number(),
});

type FormValues = z.infer<typeof schema>;

const refId = (r: Ref | string) => (typeof r === "string" ? r : r._id);
const refName = (r: Ref | string) => (typeof r === "string" ? r : r.name);

/** Reachable only by a Super Admin — see hall-meal/layout.tsx and the API's superAdminOnly middleware. */
export default function HallPackagePage() {
  const { items, total, list, create, update, remove } = useApiResource<HallPackage>(api, "/hall-meal/hall-packages");
  const purposeResource = useApiResource<Ref>(api, "/hall-meal/hall-purposes");
  const hallResource = useApiResource<Ref>(api, "/hall-meal/halls");
  const serviceResource = useApiResource<Ref>(api, "/hall-meal/additional-services");

  useEffect(() => {
    purposeResource.list.run({ status: 1, pageSize: 100 });
    hallResource.list.run({ status: 1, pageSize: 100 });
    serviceResource.list.run({ status: 1, pageSize: 100 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const purposeOptions = purposeResource.items.map((p) => ({ value: p._id, label: p.name }));
  const hallOptions = hallResource.items.map((h) => ({ value: h._id, label: h.name }));
  const serviceOptions = serviceResource.items.map((s) => ({ value: s._id, label: s.name }));

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = usePageSize();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<HallPackage | null>(null);
  const [deleting, setDeleting] = useState<HallPackage | null>(null);
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
    defaultValues: {
      name: "",
      hallPurpose: "",
      halls: [],
      standardSessionDuration: 1,
      packagePrice: 0,
      bookingAdvanceAmount: 0,
      depositAmount: 0,
      additionalHourRate: 0,
      gstApplicable: false,
      description: "",
      additionalServices: [],
      termsAndConditions: "",
      status: 1,
    },
  });

  function openCreate() {
    setEditing(null);
    reset({
      name: "",
      hallPurpose: "",
      halls: [],
      standardSessionDuration: 1,
      packagePrice: 0,
      bookingAdvanceAmount: 0,
      depositAmount: 0,
      additionalHourRate: 0,
      gstApplicable: false,
      description: "",
      additionalServices: [],
      termsAndConditions: "",
      status: 1,
    });
    setImage(null);
    setImageRemoved(false);
    create.setError(null);
    setDrawerOpen(true);
  }

  function openEdit(row: HallPackage) {
    setEditing(row);
    reset({
      name: row.name,
      hallPurpose: refId(row.hallPurpose),
      halls: row.halls.map(refId),
      standardSessionDuration: row.standardSessionDuration,
      packagePrice: row.packagePrice,
      bookingAdvanceAmount: row.bookingAdvanceAmount,
      depositAmount: row.depositAmount,
      additionalHourRate: row.additionalHourRate,
      gstApplicable: row.gstApplicable,
      description: row.description,
      additionalServices: row.additionalServices.map(refId),
      termsAndConditions: row.termsAndConditions,
      status: row.status,
    });
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
      toast[editing ? "updated" : "created"]("Hall Package " + (editing ? "updated" : "created") + " successfully.");
    }
  });

  const columns: DataTableColumn<HallPackage>[] = [
    { key: "image", label: "Image", render: (r) => <MasterImageCell src={r.image} alt={r.name} /> },
    { key: "name", label: "Package Name", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "hallPurpose", label: "Hall Purpose", render: (r) => <span>{refName(r.hallPurpose)}</span> },
    { key: "halls", label: "Halls", render: (r) => <span>{r.halls.map(refName).join(", ") || "—"}</span> },
    { key: "packagePrice", label: "Package Price", render: (r) => <span className="tabular-nums">{r.packagePrice.toFixed(2)}</span> },
    { key: "gstApplicable", label: "GST", render: (r) => <span>{r.gstApplicable ? "Yes" : "No"}</span> },
    {
      key: "status",
      label: "Status",
      render: (r) => <StatusToggleCell status={r.status} canEdit onChange={(status) => patchMasterStatus(update, r._id, status, "Hall Package")} />,
    },
  ];

  return (
    <>
      <DataTable
        title="Hall Package Management"
        subtitle="Bundles one or more Halls with a Purpose, package price and optional add-on services. Booking a Package reserves every Hall in it."
        columns={columns}
        rows={items}
        rowKey={(r) => r._id}
        loading={list.submitting}
        search={search}
        onSearchChange={(v) => { setPage(1); setSearch(v); }}
        searchPlaceholder="Search hall packages…"
        statusFilter={statusFilter}
        onStatusFilterChange={(v) => { setPage(1); setStatusFilter(v); }}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPage(1); setPageSize(size); }}
        onCreate={openCreate}
        createLabel="Add Hall Package"
        emptyMessage="No Hall Packages yet — create the first one."
        rowActions={(r) => (
          <div className="flex justify-end gap-2">
            <EditIconButton onClick={() => openEdit(r)} />
            <DeleteIconButton onClick={() => setDeleting(r)} />
          </div>
        )}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Deactivate this Hall Package?"
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
            toast.deleted("Hall Package deactivated successfully.");
          }
        }}
      />

      <FormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? "Edit Hall Package" : "Add Hall Package"}
        subtitle={editing ? editing.name : "Define a new Hall Package."}
        maxWidthClassName="max-w-3xl"
        error={create.error || update.error}
        footer={
          <div className="flex justify-end gap-3">
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={() => setDrawerOpen(false)}>
              Cancel
            </DivineButton>
            <DivineButton variant="flame" fullWidth={false} type="submit" form="hall-package-form" loading={create.submitting || update.submitting}>
              {editing ? "Save changes" : "Save"}
            </DivineButton>
          </div>
        }
      >
        <form id="hall-package-form" onSubmit={submit} noValidate className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <DivineInput staticLabel label="Package Name" error={errors.name?.message} {...register("name")} />
            <Controller
              control={control}
              name="hallPurpose"
              render={({ field }) => (
                <DivineListbox label="Hall Purpose" value={field.value} onChange={field.onChange} options={purposeOptions} error={errors.hallPurpose?.message} />
              )}
            />
          </div>

          <Controller
            control={control}
            name="halls"
            render={({ field }) => (
              <DivineMultiSelect label="Halls" values={field.value} onChange={field.onChange} options={hallOptions} error={errors.halls?.message} />
            )}
          />

          <div className="grid grid-cols-3 gap-4">
            <DivineInput
              staticLabel
              label="Standard Session Duration (hrs)"
              type="number"
              error={errors.standardSessionDuration?.message}
              {...register("standardSessionDuration", { valueAsNumber: true })}
            />
            <DivineInput staticLabel label="Package Price" type="number" error={errors.packagePrice?.message} {...register("packagePrice", { valueAsNumber: true })} />
            <DivineInput staticLabel label="Additional Hour Rate" type="number" {...register("additionalHourRate", { valueAsNumber: true })} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <DivineInput staticLabel label="Booking Advance Amount" type="number" {...register("bookingAdvanceAmount", { valueAsNumber: true })} />
            <DivineInput staticLabel label="Deposit Amount" type="number" {...register("depositAmount", { valueAsNumber: true })} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Controller
              control={control}
              name="gstApplicable"
              render={({ field }) => <DivineToggle label="GST Applicable" checked={field.value} onChange={field.onChange} onLabel="Yes" offLabel="No" />}
            />
            <Controller
              control={control}
              name="status"
              render={({ field }) => <DivineStatusSelect value={field.value} onChange={field.onChange} />}
            />
          </div>

          <Controller
            control={control}
            name="additionalServices"
            render={({ field }) => (
              <DivineMultiSelect label="Additional Services" values={field.value} onChange={field.onChange} options={serviceOptions} placeholder="None" />
            )}
          />

          <DivineTextarea staticLabel label="Description / Inclusions" error={errors.description?.message} {...register("description")} />
          <DivineTextarea staticLabel label="Terms and Conditions" error={errors.termsAndConditions?.message} {...register("termsAndConditions")} />
          <DivineMasterImageUpload
            label="Package Image"
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
