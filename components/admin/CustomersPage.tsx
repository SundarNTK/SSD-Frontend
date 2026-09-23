"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import DataTable, { StatusToggleCell, EditIconButton, type DataTableColumn } from "./DataTable";
import FormDrawer from "./FormDrawer";
import ImportExportBar from "./ImportExportBar";
import ImportReviewModal from "./ImportReviewModal";
import TamilNameField from "./TamilNameField";
import DivineInput from "../divine/DivineInput";
import DivineListbox, { type ListboxOption } from "../divine/DivineListbox";
import DivineStatusSelect from "../divine/DivineStatusSelect";
import DivineButton from "../divine/DivineButton";
import { MailIcon, UserIcon, PlusIcon, TrashIcon } from "../divine/icons";
import { authApi, api, unwrap, type ApiEnvelope } from "../../lib/api";
import { useApiResource } from "../../lib/useApiResource";
import { MODULES, usePermissions } from "../../lib/permissions";
import { emailField } from "../../lib/validation";
import { sanitizeMobileInput, isValidSgMobile, SG_MOBILE_ERROR } from "../../lib/mobileNumber";
import { formatTempleDateTime } from "../../lib/datetime";
import { toast } from "../../lib/toastStore";
import { patchMasterStatus } from "../../lib/patchMasterStatus";
import { usePageSize } from "../../lib/usePageSize";

type FamilyMember = {
  nameEnglish: string;
  nameTamil: string;
  natchathiram: { _id: string; name: string; tamilName: string } | null;
};

type Customer = {
  _id: string;
  uid: string;
  uCode: string | null;
  customerCode: string;
  name: string;
  mobileNumber: string | null;
  email: string;
  familyMembers: FamilyMember[];
  maxFamilyMembers: number;
  linkedUserId: string | null;
  status: number;
  /** Resolved from the linked login by the API — a walk-in profile has none. */
  passwordSetAt: string | null;
  hasLogin: boolean;
};

const schema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  email: emailField,
  mobileNumber: z.string().trim().refine((v) => !v || isValidSgMobile(v), SG_MOBILE_ERROR),
  status: z.number(),
});

type FormValues = z.infer<typeof schema>;

/** A locally-edited family member row — `natchathiramId` is the raw listbox value, resolved to an id on submit. */
type EditableFamilyMember = { nameEnglish: string; nameTamil: string; natchathiramId: string };

// Matches Customer.maxFamilyMembers' own schema default — used to cap the Add
// Customer form's family member rows, since there's no customer record yet
// to read an actual cap off of.
const DEFAULT_MAX_FAMILY_MEMBERS = 5;

const createSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  email: emailField,
  mobileNumber: z
    .string()
    .trim()
    .min(1, "Mobile number is required")
    .refine((v) => isValidSgMobile(v), SG_MOBILE_ERROR),
});

type CreateFormValues = z.infer<typeof createSchema>;

function toFamilyMemberPayload(members: EditableFamilyMember[]) {
  return members
    .filter((m) => m.nameEnglish.trim())
    .map((m) => ({
      nameEnglish: m.nameEnglish.trim(),
      nameTamil: m.nameTamil.trim(),
      natchathiram: m.natchathiramId || null,
    }));
}

type FamilyMemberEditorProps = {
  members: EditableFamilyMember[];
  maxMembers: number;
  nakshathiramOptions: ListboxOption[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, patch: Partial<EditableFamilyMember>) => void;
};

/** The add/edit/remove repeater shared by both the Add Customer and Edit Devotee forms. */
function FamilyMemberEditor({ members, maxMembers, nakshathiramOptions, onAdd, onRemove, onUpdate }: FamilyMemberEditorProps) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wide text-amber-600">Family members ({members.length})</p>
        {members.length < maxMembers && (
          <button
            type="button"
            onClick={onAdd}
            className="flex items-center gap-1 text-[12.5px] font-medium text-maroon hover:text-maroon-hover"
          >
            <PlusIcon />
            Add family member
          </button>
        )}
      </div>

      {members.length === 0 ? (
        <p className="rounded-xl border border-gold-500/20 bg-ivory-100 p-3 text-[12.5px] text-ink-500">No family members yet.</p>
      ) : (
        <div className="space-y-3">
          {members.map((m, i) => (
            <div key={i} className="space-y-3 rounded-xl border border-gold-500/20 bg-ivory-100 p-3">
              <div className="flex items-start gap-2">
                <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                  <DivineInput
                    staticLabel
                    label="Name (English)"
                    value={m.nameEnglish}
                    onChange={(e) => onUpdate(i, { nameEnglish: e.target.value })}
                  />
                  <TamilNameField
                    staticLabel
                    label="Name (Tamil)"
                    englishName={m.nameEnglish}
                    value={m.nameTamil}
                    onChange={(v) => onUpdate(i, { nameTamil: v })}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  aria-label="Remove family member"
                  className="mt-6 flex h-8 w-8 shrink-0 items-center justify-center text-crimson-500 transition-transform duration-200 hover:scale-110 hover:text-crimson-600 active:scale-95"
                >
                  <TrashIcon />
                </button>
              </div>
              <DivineListbox
                label="Natchathiram"
                value={m.natchathiramId}
                onChange={(v) => onUpdate(i, { natchathiramId: v })}
                options={nakshathiramOptions}
                placeholder="Select natchathiram"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The devotee master. Read, add, edit, and bulk-import.
 *
 * Adding one here follows the exact same path as public self-registration —
 * Full Name/Email/Mobile drive the login + activation email, with family
 * members optionally filled in on the same form since staff often already
 * have them on hand.
 */
export default function CustomersPage() {
  const { can } = usePermissions();
  const canEdit = can(MODULES.customers, "edit");
  const canCreate = can(MODULES.customers, "fullAccess");

  const { items, total, list, create, update } = useApiResource<Customer>(authApi, "/customers");
  const [nakshathiramOptions, setNakshathiramOptions] = useState<ListboxOption[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = usePageSize();
  const [editing, setEditing] = useState<Customer | null>(null);
  const [familyMembers, setFamilyMembers] = useState<EditableFamilyMember[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [createFamilyMembers, setCreateFamilyMembers] = useState<EditableFamilyMember[]>([]);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    list.run({ page, pageSize, search: search || undefined, status: statusFilter || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, search, statusFilter]);

  useEffect(() => {
    api
      .get<ApiEnvelope<{ items: { _id: string; name: string }[] }>>("/masters/nakshathirams", {
        params: { status: 1, pageSize: 200 },
      })
      .then((res) => {
        setNakshathiramOptions(unwrap(res).items.map((n) => ({ value: n._id, label: n.name })));
      })
      .catch(() => setNakshathiramOptions([]));
  }, []);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const {
    register: registerCreate,
    handleSubmit: handleCreateSubmit,
    reset: resetCreate,
    formState: { errors: createErrors },
  } = useForm<CreateFormValues>({ resolver: zodResolver(createSchema) });

  function openEdit(customer: Customer) {
    setEditing(customer);
    reset({
      name: customer.name,
      email: customer.email,
      mobileNumber: customer.mobileNumber ?? "",
      status: customer.status,
    });
    setFamilyMembers(
      customer.familyMembers.map((m) => ({
        nameEnglish: m.nameEnglish,
        nameTamil: m.nameTamil,
        natchathiramId: m.natchathiram?._id ?? "",
      }))
    );
    update.setError(null);
  }

  function addFamilyMemberRow() {
    setFamilyMembers((prev) => [...prev, { nameEnglish: "", nameTamil: "", natchathiramId: "" }]);
  }

  function removeFamilyMemberRow(index: number) {
    setFamilyMembers((prev) => prev.filter((_, i) => i !== index));
  }

  function updateFamilyMemberRow(index: number, patch: Partial<EditableFamilyMember>) {
    setFamilyMembers((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }

  const submit = handleSubmit(async (values) => {
    if (!editing) return;
    const ok = await update.run(editing._id, {
      ...values,
      mobileNumber: values.mobileNumber || null,
      familyMembers: toFamilyMemberPayload(familyMembers),
    });
    if (ok !== undefined) {
      setEditing(null);
      toast.updated("Devotee profile updated successfully.");
    }
  });

  function openCreate() {
    resetCreate({ name: "", email: "", mobileNumber: "" });
    setCreateFamilyMembers([]);
    create.setError(null);
    setCreateOpen(true);
  }

  function addCreateFamilyMemberRow() {
    setCreateFamilyMembers((prev) => [...prev, { nameEnglish: "", nameTamil: "", natchathiramId: "" }]);
  }

  function removeCreateFamilyMemberRow(index: number) {
    setCreateFamilyMembers((prev) => prev.filter((_, i) => i !== index));
  }

  function updateCreateFamilyMemberRow(index: number, patch: Partial<EditableFamilyMember>) {
    setCreateFamilyMembers((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }

  const submitCreate = handleCreateSubmit(async (values) => {
    const ok = await create.run({
      ...values,
      familyMembers: toFamilyMemberPayload(createFamilyMembers),
    });
    if (ok !== undefined) {
      setCreateOpen(false);
      toast.created("Devotee created — an activation email has been sent.");
    }
  });

  const columns: DataTableColumn<Customer>[] = [
    {
      key: "customerCode",
      label: "Code",
      render: (c) => <span className="whitespace-nowrap font-medium tabular-nums text-amber-700">{c.customerCode}</span>,
    },
    { key: "name", label: "Name", render: (c) => c.name },
    {
      key: "mobileNumber",
      label: "Mobile",
      render: (c) => <span className="text-ink-500">{c.mobileNumber || "—"}</span>,
    },
    { key: "email", label: "Email", render: (c) => <span className="text-ink-500">{c.email}</span> },
    {
      key: "family",
      label: "Family",
      render: (c) => <span className="tabular-nums text-ink-500">{c.familyMembers?.length ?? 0}</span>,
    },
    {
      key: "password",
      label: "Password",
      render: (c) => {
        if (!c.hasLogin) return <span className="text-[12px] text-ink-500">Walk-in</span>;
        return c.passwordSetAt ? (
          <span
            title={`Set on ${formatTempleDateTime(c.passwordSetAt)}`}
            className="inline-flex items-center whitespace-nowrap rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11.5px] font-medium text-emerald-700"
          >
            Set
          </span>
        ) : (
          <span
            title="Activation email sent — the link stays valid until it is used."
            className="inline-flex items-center whitespace-nowrap rounded-md border border-gold-500/30 bg-gold-500/10 px-2 py-0.5 text-[11.5px] font-medium text-amber-700"
          >
            Invite pending
          </span>
        );
      },
    },
    { key: "status", label: "Status", render: (c) => (
      <StatusToggleCell status={c.status} canEdit={canEdit} onChange={(status) => patchMasterStatus(update, c._id, status, "Customer")} />
    ) },
  ];

  return (
    <>
      <DataTable
        title="Customers"
        subtitle="Devotee profiles — from self-registration, from staff accounts, from the Customer Master, and later from the POS counter."
        columns={columns}
        rows={items}
        rowKey={(c) => c._id}
        loading={list.submitting}
        search={search}
        onSearchChange={(v) => {
          setPage(1);
          setSearch(v);
        }}
        searchPlaceholder="Search by code, name, mobile, email…"
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
        createLabel="Add Customer"
        emptyMessage="No devotee profiles yet."
        toolbarActions={
          <ImportExportBar
            client={authApi}
            basePath="/customers"
            entityLabel="Customer"
            canExport={false}
            canDownloadTemplate={canCreate}
            canImport={canCreate}
            onOpenImport={() => setImportOpen(true)}
          />
        }
        rowActions={(c) =>
          canEdit ? (
            <div className="flex justify-end">
              <EditIconButton onClick={() => openEdit(c)} />
            </div>
          ) : null
        }
      />

      <FormDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add Customer"
        subtitle="Registers a devotee the same way self-registration does — they'll get an email to set their own password."
        error={create.error}
        maxWidthClassName="max-w-2xl"
        footer={
          <div className="flex justify-end gap-3">
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={() => setCreateOpen(false)}>
              Cancel
            </DivineButton>
            <DivineButton variant="flame" fullWidth={false} type="submit" form="customer-create-form" loading={create.submitting}>
              Create devotee
            </DivineButton>
          </div>
        }
      >
        <form id="customer-create-form" onSubmit={submitCreate} noValidate className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DivineInput staticLabel label="Full name" icon={<UserIcon />} error={createErrors.name?.message} {...registerCreate("name")} />
            <DivineInput staticLabel label="Email address" type="email" icon={<MailIcon />} error={createErrors.email?.message} {...registerCreate("email")} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DivineInput
              staticLabel
              iconPosition="start"
              label="Mobile number"
              icon={<span className="text-[13.5px] font-semibold text-ink-500">+65</span>}
              error={createErrors.mobileNumber?.message}
              {...registerCreate("mobileNumber", { onChange: (e) => { e.target.value = sanitizeMobileInput(e.target.value); } })}
            />
          </div>

          <FamilyMemberEditor
            members={createFamilyMembers}
            maxMembers={DEFAULT_MAX_FAMILY_MEMBERS}
            nakshathiramOptions={nakshathiramOptions}
            onAdd={addCreateFamilyMemberRow}
            onRemove={removeCreateFamilyMemberRow}
            onUpdate={updateCreateFamilyMemberRow}
          />
        </form>
      </FormDrawer>

      <FormDrawer
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Edit Devotee"
        subtitle={editing ? `${editing.customerCode} · ${editing.email}` : undefined}
        error={update.error}
        maxWidthClassName="max-w-2xl"
        footer={
          <div className="flex justify-end gap-3">
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={() => setEditing(null)}>
              Cancel
            </DivineButton>
            <DivineButton variant="flame" fullWidth={false} type="submit" form="customer-form" loading={update.submitting}>
              Save changes
            </DivineButton>
          </div>
        }
      >
        <form id="customer-form" onSubmit={submit} noValidate className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DivineInput staticLabel label="Full name" icon={<UserIcon />} error={errors.name?.message} {...register("name")} />
            <DivineInput staticLabel label="Email address" type="email" icon={<MailIcon />} error={errors.email?.message} {...register("email")} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DivineInput staticLabel iconPosition="start" label="Mobile number" icon={<span className="text-[13.5px] font-semibold text-ink-500">+65</span>} error={errors.mobileNumber?.message} {...register("mobileNumber", { onChange: (e) => { e.target.value = sanitizeMobileInput(e.target.value); } })} />
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <DivineStatusSelect value={field.value} onChange={field.onChange} />
              )}
            />
          </div>

          <FamilyMemberEditor
            members={familyMembers}
            maxMembers={editing?.maxFamilyMembers ?? DEFAULT_MAX_FAMILY_MEMBERS}
            nakshathiramOptions={nakshathiramOptions}
            onAdd={addFamilyMemberRow}
            onRemove={removeFamilyMemberRow}
            onUpdate={updateFamilyMemberRow}
          />
        </form>
      </FormDrawer>

      <ImportReviewModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        client={authApi}
        basePath="/customers"
        entityLabel="Customer"
        previewFields={[
          { key: "name", label: "Full Name" },
          { key: "email", label: "Email" },
          { key: "mobileNumber", label: "Mobile" },
          { key: "fm1NameEnglish", label: "Family Member 1" },
        ]}
        onImported={() => list.run({ page, pageSize, search: search || undefined, status: statusFilter || undefined })}
      />
    </>
  );
}
