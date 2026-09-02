"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import DataTable, { StatusPill, EditIconButton, DeleteIconButton, type DataTableColumn } from "./DataTable";
import FormDrawer from "./FormDrawer";
import ConfirmDialog from "./ConfirmDialog";
import DivineInput from "../divine/DivineInput";
import DivineToggle from "../divine/DivineToggle";
import DivineStatusSelect from "../divine/DivineStatusSelect";
import DivineButton from "../divine/DivineButton";
import TamilNameField from "./TamilNameField";
import { api } from "../../lib/api";
import { useApiResource } from "../../lib/useApiResource";
import { MODULES, usePermissions } from "../../lib/permissions";
import { toast } from "../../lib/toastStore";

export type Nakshathiram = {
  _id: string;
  code: string;
  displayOrder: number;
  name: string;
  tamilName: string;
  rasi: string;
  tamilRasi: string;
  mainFlag: boolean;
  status: number;
};

const schema = z.object({
  code: z.string().trim().min(1, "Code is required").max(20),
  displayOrder: z.number().int().min(0),
  name: z.string().trim().min(1, "Nakshathiram is required").max(100),
  tamilName: z.string().trim().min(1, "Tamil name is required").max(100),
  rasi: z.string().trim().min(1, "Rasi is required").max(100),
  tamilRasi: z.string().trim().min(1, "Tamil Rasi is required").max(100),
  mainFlag: z.boolean(),
  status: z.number(),
});

type FormValues = z.infer<typeof schema>;

const DEFAULT_PAGE_SIZE = 10;

const DEFAULT_VALUES: FormValues = {
  code: "",
  displayOrder: 1,
  name: "",
  tamilName: "",
  rasi: "",
  tamilRasi: "",
  mainFlag: false,
  status: 1,
};

export default function NakshathiramPage() {
  const { can } = usePermissions();
  const canCreate = can(MODULES.nakshathirams, "fullAccess");
  const canEdit = can(MODULES.nakshathirams, "edit");
  const { items, total, list, create, update, remove } = useApiResource<Nakshathiram>(api, "/masters/nakshathirams");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Nakshathiram | null>(null);
  const [deleting, setDeleting] = useState<Nakshathiram | null>(null);

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
  const nameValue = watch("name") ?? "";
  const tamilNameValue = watch("tamilName") ?? "";

  function openCreate() {
    setEditing(null);
    reset(DEFAULT_VALUES);
    create.setError(null);
    setDrawerOpen(true);
  }

  function openEdit(nakshathiram: Nakshathiram) {
    setEditing(nakshathiram);
    reset({
      code: nakshathiram.code,
      displayOrder: nakshathiram.displayOrder,
      name: nakshathiram.name,
      tamilName: nakshathiram.tamilName,
      rasi: nakshathiram.rasi,
      tamilRasi: nakshathiram.tamilRasi,
      mainFlag: nakshathiram.mainFlag,
      status: nakshathiram.status,
    });
    update.setError(null);
    setDrawerOpen(true);
  }

  const submit = handleSubmit(async (values) => {
    const ok = editing ? await update.run(editing._id, values) : await create.run(values);
    if (ok !== undefined) {
      setDrawerOpen(false);
      if (editing) toast.updated("Nakshathiram updated successfully.");
      else toast.created("Nakshathiram created successfully.");
    }
  });

  const columns: DataTableColumn<Nakshathiram>[] = [
    { key: "code", label: "Code", render: (n) => <span className="font-medium tabular-nums text-amber-700">{n.code}</span> },
    { key: "displayOrder", label: "Order", render: (n) => <span className="tabular-nums">{n.displayOrder}</span> },
    { key: "name", label: "Nakshathiram", render: (n) => n.name },
    { key: "tamilName", label: "Tamil", render: (n) => <span className="text-ink-500">{n.tamilName}</span> },
    { key: "rasi", label: "Rasi", render: (n) => n.rasi },
    { key: "mainFlag", label: "Main Flag", render: (n) => <span className="text-ink-500">{n.mainFlag ? "Yes" : "No"}</span> },
    { key: "status", label: "Status", render: (n) => <StatusPill status={n.status} /> },
  ];

  return (
    <>
      <DataTable
        title="Nakshathiram Master"
        subtitle="Birth stars and their Rasi mapping, used for devotee profiles and bookings."
        columns={columns}
        rows={items}
        rowKey={(n) => n._id}
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
        createLabel="Add Nakshathiram"
        emptyMessage="No nakshathirams yet — create the first one."
        rowActions={(n) => (
          <div className="flex justify-end gap-2">
            {canEdit && <EditIconButton onClick={() => openEdit(n)} />}
            {canCreate && <DeleteIconButton onClick={() => setDeleting(n)} />}
          </div>
        )}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this nakshathiram?"
        message={deleting ? `"${deleting.name}" will be removed.` : ""}
        confirmLabel="Delete nakshathiram"
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
            toast.deleted("Nakshathiram deleted successfully.");
          }
        }}
      />

      <FormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? "Edit Nakshathiram" : "Add Nakshathiram"}
        subtitle={editing ? `${editing.name} · ${editing.code}` : "Define a new nakshathiram."}
        error={create.error || update.error}
        footer={
          <div className="flex justify-end gap-3">
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={() => setDrawerOpen(false)}>
              Cancel
            </DivineButton>
            <DivineButton fullWidth={false} type="submit" form="nakshathiram-form" loading={create.submitting || update.submitting}>
              {editing ? "Save changes" : "Save"}
            </DivineButton>
          </div>
        }
      >
        <form id="nakshathiram-form" onSubmit={submit} noValidate className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <DivineInput staticLabel label="Code" error={errors.code?.message} {...register("code")} />
            <DivineInput staticLabel
              label="Display Order"
              type="number"
              error={errors.displayOrder?.message}
              {...register("displayOrder", { valueAsNumber: true })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <DivineInput staticLabel label="Nakshathiram" error={errors.name?.message} {...register("name")} />
            <TamilNameField staticLabel
              label="Tamil"
              englishName={nameValue}
              value={tamilNameValue}
              onChange={(v) => setValue("tamilName", v, { shouldDirty: true })}
              error={errors.tamilName?.message}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <DivineInput staticLabel label="Rasi" error={errors.rasi?.message} {...register("rasi")} />
            <DivineInput staticLabel label="Tamil Rasi" error={errors.tamilRasi?.message} {...register("tamilRasi")} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Controller
              control={control}
              name="mainFlag"
              render={({ field }) => (
                <DivineToggle boxed label="Main Flag" checked={field.value} onChange={field.onChange} onLabel="Yes" offLabel="No" />
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
        </form>
      </FormDrawer>
    </>
  );
}
