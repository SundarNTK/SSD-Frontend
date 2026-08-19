"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import DataTable, { StatusPill, type DataTableColumn } from "./DataTable";
import FormDrawer from "./FormDrawer";
import ConfirmDialog from "./ConfirmDialog";
import DivineInput from "../divine/DivineInput";
import DivineListbox from "../divine/DivineListbox";
import DivineButton from "../divine/DivineButton";
import { ShieldIcon } from "../divine/icons";
import { authApi } from "../../lib/api";
import { useApiResource } from "../../lib/useApiResource";
import { MODULES, usePermissions } from "../../lib/permissions";
import { toast } from "../../lib/toastStore";

export type Role = {
  _id: string;
  name: string;
  description: string;
  status: number;
  permissions: { module: string; view: boolean; edit: boolean; fullAccess: boolean }[];
  createdAt: string;
  /**
   * Set by the server (a virtual on the Role model) for roles whose access
   * is decided by account type rather than module permissions — Super Admin
   * and Customer. The API refuses to edit, delete, or re-permission them, so
   * the UI hides those controls. Deliberately not a name check here: the
   * list lives in one place on the backend and rides along on the record.
   */
  isLocked?: boolean;
};

const schema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  description: z.string().trim().max(300),
  status: z.number(),
});

type FormValues = z.infer<typeof schema>;

const PAGE_SIZE = 20;
const STATUS_OPTIONS = [
  { value: "1", label: "Active" },
  { value: "0", label: "Inactive" },
];

export default function RolesPage() {
  const router = useRouter();
  const { can } = usePermissions();
  const canCreate = can(MODULES.roles, "fullAccess");
  const canEdit = can(MODULES.roles, "edit");
  const { items, total, list, create, update, remove } = useApiResource<Role>(authApi, "/roles");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [deleting, setDeleting] = useState<Role | null>(null);

  useEffect(() => {
    list.run({ page, pageSize: PAGE_SIZE, search: search || undefined, status: statusFilter || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, statusFilter]);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  function openCreate() {
    setEditing(null);
    reset({ name: "", description: "", status: 1 });
    create.setError(null);
    setDrawerOpen(true);
  }

  function openEdit(role: Role) {
    setEditing(role);
    reset({ name: role.name, description: role.description, status: role.status });
    update.setError(null);
    setDrawerOpen(true);
  }

  const submit = handleSubmit(async (values) => {
    const ok = editing
      ? await update.run(editing._id, values)
      : await create.run({ name: values.name, description: values.description, status: values.status });
    if (ok !== undefined) {
      setDrawerOpen(false);
      if (editing) toast.updated("Role updated successfully.");
      else toast.created("Role created successfully.");
    }
  });

  const columns: DataTableColumn<Role>[] = [
    { key: "name", label: "Name", render: (r) => <span className="font-medium">{r.name}</span> },
    {
      key: "description",
      label: "Description",
      render: (r) => <span className="text-ink-500">{r.description || "—"}</span>,
    },
    {
      key: "permissions",
      label: "Modules granted",
      render: (r) => <span className="text-ink-500">{r.permissions.length || 0}</span>,
    },
    { key: "status", label: "Status", render: (r) => <StatusPill status={r.status} /> },
  ];

  return (
    <>
      <DataTable
        title="Roles"
        subtitle="Named permission bundles assigned to admin users at creation."
        columns={columns}
        rows={items}
        rowKey={(r) => r._id}
        loading={list.submitting}
        search={search}
        onSearchChange={(v) => {
          setPage(1);
          setSearch(v);
        }}
        searchPlaceholder="Search roles…"
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
        createLabel="Create Role"
        emptyMessage="No roles yet — create the first one."
        rowActions={(r) =>
          r.isLocked ? (
            <span
              className="text-[12px] text-ink-500"
              title="Access for this role is decided by account type, not by module permissions."
            >
              System managed
            </span>
          ) : (
            <div className="flex justify-end gap-3">
              {canCreate && (
                <button
                  onClick={() => router.push(`/admin/permissions?role=${r._id}`)}
                  className="flex items-center gap-1.5 text-[12.5px] text-amber-600 hover:underline"
                >
                  <ShieldIcon /> Permissions
                </button>
              )}
              {canEdit && (
                <button onClick={() => openEdit(r)} className="text-[12.5px] text-ink-300 hover:text-ink-100 hover:underline">
                  Edit
                </button>
              )}
              {canCreate && (
                <button
                  onClick={() => setDeleting(r)}
                  className="text-[12.5px] text-crimson-500 hover:underline"
                >
                  Delete
                </button>
              )}
            </div>
          )
        }
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this role?"
        message={
          deleting
            ? `"${deleting.name}" will be removed. This is refused if the role is still assigned to any account that hasn't been deleted — deactivating those accounts isn't enough.`
            : ""
        }
        confirmLabel="Delete role"
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
            toast.deleted("Role deleted successfully.");
          }
        }}
      />

      <FormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? "Edit Role" : "Create Role"}
        subtitle={editing ? editing.name : "Define a named permission bundle."}
        error={create.error || update.error}
        footer={
          <div className="flex gap-3">
            <DivineButton variant="ghost" type="button" onClick={() => setDrawerOpen(false)}>
              Cancel
            </DivineButton>
            <DivineButton type="submit" form="role-form" loading={create.submitting || update.submitting}>
              {editing ? "Save changes" : "Create Role"}
            </DivineButton>
          </div>
        }
      >
        <form id="role-form" onSubmit={submit} noValidate className="space-y-5">
          <DivineInput label="Role name" error={errors.name?.message} {...register("name")} />
          <DivineInput label="Description" error={errors.description?.message} {...register("description")} />
          {/* Shown on create too — it defaults to Active, and an admin
              setting up a role ahead of time should be able to park it
              inactive rather than create it live and edit it straight after. */}
          <Controller
            control={control}
            name="status"
            render={({ field }) => (
              <DivineListbox
                label="Status"
                value={String(field.value)}
                onChange={(v) => field.onChange(Number(v))}
                options={STATUS_OPTIONS}
              />
            )}
          />
        </form>
      </FormDrawer>
    </>
  );
}
