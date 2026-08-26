"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import DataTable, { StatusPill, EditIconButton, DeleteIconButton, type DataTableColumn } from "./DataTable";
import FormDrawer from "./FormDrawer";
import ConfirmDialog from "./ConfirmDialog";
import DivineInput from "../divine/DivineInput";
import DivineListbox, { type ListboxOption } from "../divine/DivineListbox";
import DivineToggle from "../divine/DivineToggle";
import DivineButton from "../divine/DivineButton";
import { api, unwrap, type ApiEnvelope } from "../../lib/api";
import { useApiResource } from "../../lib/useApiResource";
import { MODULES, usePermissions } from "../../lib/permissions";
import { toast } from "../../lib/toastStore";

type Ref = { _id: string; name: string };

export type Deity = {
  _id: string;
  name: string;
  tamilName: string;
  printingGroup: Ref | null;
  status: number;
};

const schema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  tamilName: z.string().trim(),
  printingGroup: z.string().min(1, "Printing group is required"),
  status: z.number(),
});

type FormValues = z.infer<typeof schema>;

const DEFAULT_PAGE_SIZE = 10;

export default function DeityPage() {
  const { can } = usePermissions();
  const canCreate = can(MODULES.deities, "fullAccess");
  const canEdit = can(MODULES.deities, "edit");
  const { items, total, list, create, update, remove } = useApiResource<Deity>(api, "/masters/deities");

  const [printingGroups, setPrintingGroups] = useState<ListboxOption[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Deity | null>(null);
  const [deleting, setDeleting] = useState<Deity | null>(null);

  useEffect(() => {
    api
      .get<ApiEnvelope<{ items: { _id: string; name: string }[] }>>("/masters/printing-groups", {
        params: { status: 1, pageSize: 100 },
      })
      .then((res) => setPrintingGroups(unwrap(res).items.map((g) => ({ value: g._id, label: g.name }))));
  }, []);

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
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  function openCreate() {
    setEditing(null);
    reset({ name: "", tamilName: "", printingGroup: "", status: 1 });
    create.setError(null);
    setDrawerOpen(true);
  }

  function openEdit(deity: Deity) {
    setEditing(deity);
    reset({
      name: deity.name,
      tamilName: deity.tamilName,
      printingGroup: deity.printingGroup?._id ?? "",
      status: deity.status,
    });
    update.setError(null);
    setDrawerOpen(true);
  }

  const submit = handleSubmit(async (values) => {
    const ok = editing ? await update.run(editing._id, values) : await create.run(values);
    if (ok !== undefined) {
      setDrawerOpen(false);
      if (editing) toast.updated("Deity updated successfully.");
      else toast.created("Deity created successfully.");
    }
  });

  const columns: DataTableColumn<Deity>[] = [
    { key: "name", label: "Name", render: (d) => <span className="font-medium">{d.name}</span> },
    { key: "tamilName", label: "Tamil Name", render: (d) => <span className="text-ink-500">{d.tamilName || "—"}</span> },
    {
      key: "printingGroup",
      label: "Printing Group",
      render: (d) => <span className="text-ink-500">{d.printingGroup?.name ?? "—"}</span>,
    },
    { key: "status", label: "Status", render: (d) => <StatusPill status={d.status} /> },
  ];

  return (
    <>
      <DataTable
        title="Deity Master"
        subtitle="Deities available for archana/seva bookings, grouped for printing."
        columns={columns}
        rows={items}
        rowKey={(d) => d._id}
        loading={list.submitting}
        search={search}
        onSearchChange={(v) => {
          setPage(1);
          setSearch(v);
        }}
        searchPlaceholder="Search deities…"
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
        createLabel="Add Deity"
        emptyMessage="No deities yet — create the first one."
        rowActions={(d) => (
          <div className="flex justify-end gap-2">
            {canEdit && <EditIconButton onClick={() => openEdit(d)} />}
            {canCreate && <DeleteIconButton onClick={() => setDeleting(d)} />}
          </div>
        )}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this deity?"
        message={deleting ? `"${deleting.name}" will be removed.` : ""}
        confirmLabel="Delete deity"
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
            toast.deleted("Deity deleted successfully.");
          }
        }}
      />

      <FormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? "Edit Deity" : "Add Deity"}
        subtitle={editing ? editing.name : "Define a new deity."}
        error={create.error || update.error}
        footer={
          <div className="flex justify-end gap-3">
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={() => setDrawerOpen(false)}>
              Cancel
            </DivineButton>
            <DivineButton fullWidth={false} type="submit" form="deity-form" loading={create.submitting || update.submitting}>
              {editing ? "Save changes" : "Save"}
            </DivineButton>
          </div>
        }
      >
        <form id="deity-form" onSubmit={submit} noValidate className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DivineInput label="Name" error={errors.name?.message} {...register("name")} />
            <DivineInput label="Tamil Name" error={errors.tamilName?.message} {...register("tamilName")} />
          </div>
          <Controller
            control={control}
            name="printingGroup"
            render={({ field }) => (
              <DivineListbox
                label="Printing Group"
                value={field.value}
                onChange={field.onChange}
                options={printingGroups}
                placeholder="Select printing group"
                error={errors.printingGroup?.message}
              />
            )}
          />
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
