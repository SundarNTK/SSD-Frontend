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
import DivineStatusSelect from "../divine/DivineStatusSelect";
import DivineButton from "../divine/DivineButton";
import { MailIcon, UserIcon } from "../divine/icons";
import { authApi } from "../../lib/api";
import { useApiResource } from "../../lib/useApiResource";
import { MODULES, usePermissions } from "../../lib/permissions";
import { emailField } from "../../lib/validation";
import { sanitizeMobileInput, isValidSgMobile, SG_MOBILE_ERROR } from "../../lib/mobileNumber";
import { formatTempleDateTime } from "../../lib/datetime";
import { toast } from "../../lib/toastStore";

type Customer = {
  _id: string;
  uid: string;
  uCode: string | null;
  customerCode: string;
  name: string;
  mobileNumber: string | null;
  email: string;
  dateOfBirth: string | null;
  gender: "MALE" | "FEMALE" | "OTHER" | null;
  familyMembers: { name: string; nakshatra: string }[];
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
  dateOfBirth: z.string(),
  gender: z.string(),
  status: z.number(),
});

type FormValues = z.infer<typeof schema>;

const DEFAULT_PAGE_SIZE = 10;
const GENDER_OPTIONS = [
  { value: "", label: "Not specified" },
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
];

/**
 * The devotee master. Read and edit only — a profile is created either by a
 * registration or (once POS lands) at the counter, both of which carry
 * context a bare "add customer" form here would lose.
 */
export default function CustomersPage() {
  const { can } = usePermissions();
  const canEdit = can(MODULES.customers, "edit");

  const { items, total, list, update } = useApiResource<Customer>(authApi, "/customers");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [editing, setEditing] = useState<Customer | null>(null);

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

  function openEdit(customer: Customer) {
    setEditing(customer);
    reset({
      name: customer.name,
      email: customer.email,
      mobileNumber: customer.mobileNumber ?? "",
      dateOfBirth: customer.dateOfBirth ? customer.dateOfBirth.slice(0, 10) : "",
      gender: customer.gender ?? "",
      status: customer.status,
    });
    update.setError(null);
  }

  const submit = handleSubmit(async (values) => {
    if (!editing) return;
    const ok = await update.run(editing._id, {
      ...values,
      mobileNumber: values.mobileNumber || null,
      dateOfBirth: values.dateOfBirth || null,
      gender: values.gender || null,
    });
    if (ok !== undefined) {
      setEditing(null);
      toast.updated("Devotee profile updated successfully.");
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
    { key: "status", label: "Status", render: (c) => <StatusPill status={c.status} /> },
  ];

  return (
    <>
      <DataTable
        title="Customers"
        subtitle="Devotee profiles — from self-registration, from staff accounts, and later from the POS counter."
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
        emptyMessage="No devotee profiles yet."
        rowActions={(c) =>
          canEdit ? (
            <div className="flex justify-end">
              <EditIconButton onClick={() => openEdit(c)} />
            </div>
          ) : null
        }
      />

      <FormDrawer
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Edit Devotee"
        subtitle={editing ? `${editing.customerCode} · ${editing.email}` : undefined}
        error={update.error}
        footer={
          <div className="flex justify-end gap-3">
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={() => setEditing(null)}>
              Cancel
            </DivineButton>
            <DivineButton fullWidth={false} type="submit" form="customer-form" loading={update.submitting}>
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
              name="dateOfBirth"
              render={({ field }) => (
                <DivineDatePicker staticLabel
                  label="Date of birth"
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  placeholder="Not recorded"
                />
              )}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Controller
              control={control}
              name="gender"
              render={({ field }) => (
                <DivineListbox label="Gender" value={field.value ?? ""} onChange={field.onChange} options={GENDER_OPTIONS} />
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

          {editing && editing.familyMembers.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] uppercase tracking-wide text-amber-600">
                Family members ({editing.familyMembers.length})
              </p>
              <ul className="space-y-1.5 rounded-xl border border-gold-500/20 bg-ivory-100 p-3">
                {editing.familyMembers.map((m, i) => (
                  <li key={`${m.name}-${i}`} className="flex justify-between text-[13px] text-ink-100">
                    <span>{m.name}</span>
                    <span className="text-ink-500">{m.nakshatra || "—"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </form>
      </FormDrawer>
    </>
  );
}
