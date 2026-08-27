"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import DataTable, { StatusPill, EditIconButton, type DataTableColumn } from "./DataTable";
import FormDrawer from "./FormDrawer";
import DivineInput from "../divine/DivineInput";
import DivineListbox from "../divine/DivineListbox";
import DivineDatePicker from "../divine/DivineDatePicker";
import DivineImageUpload from "../divine/DivineImageUpload";
import DivineToggle from "../divine/DivineToggle";
import { resolveImageUrl } from "../../lib/imageUrl";
import DivineButton from "../divine/DivineButton";
import { MailIcon, UserIcon } from "../divine/icons";
import { startOfToday, formatTempleDateTime } from "../../lib/datetime";
import { sanitizeMobileInput, isValidSgMobile, SG_MOBILE_ERROR } from "../../lib/mobileNumber";
import { authApi, unwrap, type ApiEnvelope } from "../../lib/api";
import { useApiResource, type WriteBody } from "../../lib/useApiResource";
import { MODULES, usePermissions } from "../../lib/permissions";
import { emailField } from "../../lib/validation";
import { USER_TYPES, USER_TYPE_LABEL } from "../../lib/userTypes";
import { toast } from "../../lib/toastStore";

/** Names only — the assignable-roles endpoint deliberately omits permissions. */
type AssignableRole = { _id: string; name: string };

type AdminUser = {
  _id: string;
  uid: string;
  uCode: string | null;
  name: string;
  email: string;
  mobileNumber: string | null;
  profileImage: string | null;
  userType: string;
  status: number;
  posAccess: boolean;
  accessUpto: string | null;
  passwordSetAt: string | null;
  hasSetPassword: boolean;
  entities: { entity: string; roles: { _id: string; name: string }[]; default: boolean }[];
};


// No userType field — the API decides it (always Admin_Users from here).
const createSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  email: emailField,
  mobileNumber: z.string().trim().refine((v) => !v || isValidSgMobile(v), SG_MOBILE_ERROR),
  roleIds: z.array(z.string()),
  accessUpto: z.string(),
  status: z.number(),
  posAccess: z.boolean(),
});

const editSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  email: emailField,
  mobileNumber: z.string().trim().refine((v) => !v || isValidSgMobile(v), SG_MOBILE_ERROR),
  roleIds: z.array(z.string()),
  accessUpto: z.string(),
  status: z.number(),
  posAccess: z.boolean(),
});

type CreateValues = z.infer<typeof createSchema>;
type EditValues = z.infer<typeof editSchema>;

const DEFAULT_PAGE_SIZE = 10;

export default function UsersPage() {
  const { can, user: currentUser } = usePermissions();
  const canCreate = can(MODULES.users, "fullAccess");
  const canEdit = can(MODULES.users, "edit");
  const isSuperAdmin = currentUser?.userType === USER_TYPES.SUPER_ADMIN;

  const { items, total, list, create, update } = useApiResource<AdminUser>(authApi, "/users");
  const [roles, setRoles] = useState<AssignableRole[]>([]);
  const [createImage, setCreateImage] = useState<File | null>(null);
  const [editImage, setEditImage] = useState<File | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);

  // Reads from /users/assignable-roles, not /roles. Assigning a role belongs
  // to managing users; inspecting what a role *grants* is the Roles master's
  // own permission. Pointing this at /roles would have meant nobody could
  // give someone a role without also being able to rewrite the permission
  // system. The endpoint returns names only, already filtered to what this
  // admin is allowed to hand out.
  const canAssignRoles = can(MODULES.users, "edit");
  useEffect(() => {
    if (!canAssignRoles) return;
    authApi
      .get<ApiEnvelope<AssignableRole[]>>("/users/assignable-roles")
      .then((res) => setRoles(unwrap(res)));
  }, [canAssignRoles]);

  const roleOptions = roles.map((r) => ({ value: r._id, label: r.name }));

  useEffect(() => {
    list.run({ page, pageSize, search: search || undefined, status: statusFilter || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, search, statusFilter]);

  const createForm = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { roleIds: [], status: 1, posAccess: false },
  });
  const editForm = useForm<EditValues>({ resolver: zodResolver(editSchema) });

  function openCreate() {
    setEditing(null);
    createForm.reset({ name: "", email: "", mobileNumber: "", roleIds: [], accessUpto: "", status: 1, posAccess: false });
    setCreateImage(null);
    create.setError(null);
    setDrawerOpen(true);
  }

  function openEdit(user: AdminUser) {
    setEditing(user);
    const assignedRoleIds = user.entities[0]?.roles.map((r) => r._id) ?? [];
    editForm.reset({
      name: user.name,
      email: user.email,
      mobileNumber: user.mobileNumber ?? "",
      roleIds: assignedRoleIds,
      accessUpto: user.accessUpto ? user.accessUpto.slice(0, 10) : "",
      status: user.status,
      posAccess: user.posAccess,
    });
    setEditImage(null);
    update.setError(null);
    setDrawerOpen(true);
  }

  /**
   * Sent as multipart only when a photo was picked, so the common case stays
   * a plain JSON body. `roleIds` is JSON-encoded because multipart carries
   * strings — the API's validation accepts either shape.
   */
  function toPayload(values: Record<string, unknown>, image: File | null): WriteBody {
    const body = {
      ...values,
      mobileNumber: values.mobileNumber || null,
      accessUpto: values.accessUpto || null,
    };
    if (!image) return body;

    const form = new FormData();
    Object.entries(body).forEach(([key, val]) => {
      if (val === null || val === undefined) return;
      form.append(key, Array.isArray(val) ? JSON.stringify(val) : String(val));
    });
    form.append("profileImage", image);
    return form;
  }

  const submitCreate = createForm.handleSubmit(async (values) => {
    const ok = await create.run(toPayload(values, createImage));
    if (ok !== undefined) {
      setDrawerOpen(false);
      toast.created("Admin user created — activation email sent.");
    }
  });

  const submitEdit = editForm.handleSubmit(async (values) => {
    if (!editing) return;
    const ok = await update.run(editing._id, toPayload(values, editImage));
    if (ok !== undefined) {
      setDrawerOpen(false);
      toast.updated("Admin user updated successfully.");
    }
  });

  const columns: DataTableColumn<AdminUser>[] = [
    {
      key: "uCode",
      label: "Code",
      render: (u) => <span className="whitespace-nowrap tabular-nums text-amber-700">{u.uCode ?? "—"}</span>,
    },
    {
      key: "name",
      label: "Name",
      render: (u) => (
        <span className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gold-500/20 bg-navy-900 text-[10px] text-amber-600">
            {u.profileImage ? (
              <img src={resolveImageUrl(u.profileImage) ?? ""} alt="" className="h-full w-full object-cover" />
            ) : (
              u.name.slice(0, 1).toUpperCase()
            )}
          </span>
          <span className="font-medium">{u.name}</span>
        </span>
      ),
    },
    { key: "email", label: "Email", render: (u) => <span className="text-ink-500">{u.email}</span> },
    { key: "userType", label: "Type", render: (u) => USER_TYPE_LABEL[u.userType] ?? u.userType },
    {
      key: "roles",
      label: "Roles",
      render: (u) => (
        <span className="text-ink-500">{u.entities[0]?.roles.map((r) => r.name).join(", ") || "—"}</span>
      ),
    },
    {
      key: "password",
      label: "Password",
      render: (u) => <PasswordStatePill setAt={u.passwordSetAt} />,
    },
    { key: "status", label: "Status", render: (u) => <StatusPill status={u.status} /> },
  ];

  return (
    <>
      <DataTable
        title="Admin Users"
        subtitle="Accounts with access to this panel. Customer accounts are created via self-registration, not here."
        columns={columns}
        rows={items}
        rowKey={(u) => u._id}
        loading={list.submitting}
        search={search}
        onSearchChange={(v) => {
          setPage(1);
          setSearch(v);
        }}
        searchPlaceholder="Search by name, email, mobile…"
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
        createLabel="Create Admin User"
        emptyMessage="No admin users yet."
        rowActions={(u) => {
          // Mirrors the server's rules exactly: Customer accounts aren't
          // edited from this screen, and only a System Admin may touch a
          // System Admin account.
          if (u.userType === USER_TYPES.CUSTOMER || !canEdit) return null;
          if (u.userType === USER_TYPES.SUPER_ADMIN && !isSuperAdmin) return null;
          return (
            <div className="flex justify-end">
              <EditIconButton onClick={() => openEdit(u)} />
            </div>
          );
        }}
      />

      <FormDrawer
        open={drawerOpen && !editing}
        onClose={() => setDrawerOpen(false)}
        title="Create Admin User"
        subtitle="Sends a set-password activation email — never set a password here directly."
        error={create.error}
        footer={
          <div className="flex justify-end gap-3">
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={() => setDrawerOpen(false)}>
              Cancel
            </DivineButton>
            <DivineButton fullWidth={false} type="submit" form="user-create-form" loading={create.submitting}>
              Create &amp; Send Activation
            </DivineButton>
          </div>
        }
      >
        <form id="user-create-form" onSubmit={submitCreate} noValidate className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DivineInput staticLabel label="Full name" icon={<UserIcon />} error={createForm.formState.errors.name?.message} {...createForm.register("name")} />
            <DivineInput staticLabel label="Mobile number" icon={<span className="text-[13.5px] font-semibold text-ink-500">+65</span>} error={createForm.formState.errors.mobileNumber?.message} {...createForm.register("mobileNumber", { onChange: (e) => { e.target.value = sanitizeMobileInput(e.target.value); } })} />
          </div>
          <DivineInput staticLabel label="Email address" type="email" icon={<MailIcon />} error={createForm.formState.errors.email?.message} {...createForm.register("email")} />
          <DivineImageUpload label="Profile photo" onChange={setCreateImage} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Controller
              control={createForm.control}
              name="roleIds"
              render={({ field }) => (
                <DivineListbox
                  label="Roles"
                  value={field.value?.[0] ?? ""}
                  onChange={(v) => field.onChange(v ? [v] : [])}
                  options={roleOptions}
                  placeholder={canAssignRoles ? "Select a role" : "You can't assign roles"}
                />
              )}
            />
            <Controller
              control={createForm.control}
              name="accessUpto"
              render={({ field }) => (
                <DivineDatePicker staticLabel
                  label="Access upto"
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  minDate={startOfToday()}
                  placeholder="No expiry"
                  hint="Leave empty for access that doesn't expire."
                />
              )}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Controller
              control={createForm.control}
              name="status"
              render={({ field }) => (
                <DivineToggle boxed label="Status" checked={field.value === 1} onChange={(checked) => field.onChange(checked ? 1 : 0)} />
              )}
            />
            <Controller
              control={createForm.control}
              name="posAccess"
              render={({ field }) => (
                <DivineToggle boxed label="POS Access" checked={field.value} onChange={field.onChange} />
              )}
            />
          </div>
        </form>
      </FormDrawer>

      <FormDrawer
        open={drawerOpen && Boolean(editing)}
        onClose={() => setDrawerOpen(false)}
        title="Edit Admin User"
        subtitle={editing?.email}
        error={update.error}
        footer={
          <div className="flex justify-end gap-3">
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={() => setDrawerOpen(false)}>
              Cancel
            </DivineButton>
            <DivineButton fullWidth={false} type="submit" form="user-edit-form" loading={update.submitting}>
              Save changes
            </DivineButton>
          </div>
        }
      >
        <form id="user-edit-form" onSubmit={submitEdit} noValidate className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DivineInput staticLabel label="Full name" icon={<UserIcon />} error={editForm.formState.errors.name?.message} {...editForm.register("name")} />
            <DivineInput staticLabel label="Mobile number" icon={<span className="text-[13.5px] font-semibold text-ink-500">+65</span>} error={editForm.formState.errors.mobileNumber?.message} {...editForm.register("mobileNumber", { onChange: (e) => { e.target.value = sanitizeMobileInput(e.target.value); } })} />
          </div>
          <DivineInput staticLabel label="Email address" type="email" icon={<MailIcon />} error={editForm.formState.errors.email?.message} {...editForm.register("email")} />
          <DivineImageUpload label="Profile photo" value={editing?.profileImage} onChange={setEditImage} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Controller
              control={editForm.control}
              name="roleIds"
              render={({ field }) => (
                <DivineListbox
                  label="Roles"
                  value={field.value?.[0] ?? ""}
                  onChange={(v) => field.onChange(v ? [v] : [])}
                  options={roleOptions}
                  placeholder={canAssignRoles ? "Select a role" : "You can't assign roles"}
                />
              )}
            />
            <Controller
              control={editForm.control}
              name="accessUpto"
              render={({ field }) => (
                <DivineDatePicker staticLabel
                  label="Access upto"
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  placeholder="No expiry"
                  hint="Leave empty for access that doesn't expire."
                />
              )}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Controller
              control={editForm.control}
              name="status"
              render={({ field }) => (
                <DivineToggle boxed label="Status" checked={field.value === 1} onChange={(checked) => field.onChange(checked ? 1 : 0)} />
              )}
            />
            <Controller
              control={editForm.control}
              name="posAccess"
              render={({ field }) => (
                <DivineToggle boxed label="POS Access" checked={field.value} onChange={field.onChange} />
              )}
            />
          </div>
        </form>
      </FormDrawer>
    </>
  );
}

/**
 * The invitation never times out, so "pending" here means genuinely
 * outstanding rather than possibly-expired — the only thing that ends its
 * life is being used.
 */
function PasswordStatePill({ setAt }: { setAt: string | null }) {
  if (setAt) {
    return (
      <span
        title={`Set on ${formatTempleDateTime(setAt)}`}
        className="whitespace-nowrap rounded-full bg-gradient-to-b from-emerald-400 to-emerald-600 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-white shadow-[0_1px_4px_-1px_rgba(16,185,129,0.5)]"
      >
        Set
      </span>
    );
  }
  return (
    <span
      title="Activation email sent — the link stays valid until it is used."
      className="whitespace-nowrap rounded-full bg-gradient-to-b from-gold-400 to-gold-600 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-navy-950 shadow-[0_1px_4px_-1px_rgba(212,175,55,0.5)]"
    >
      Invite pending
    </span>
  );
}
