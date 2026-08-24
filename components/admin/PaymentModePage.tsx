"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import DataTable, { StatusPill, type DataTableColumn } from "./DataTable";
import FormDrawer from "./FormDrawer";
import DivineTextarea from "../divine/DivineTextarea";
import DivineRadioGroup from "../divine/DivineRadioGroup";
import DivineToggle from "../divine/DivineToggle";
import DivineButton from "../divine/DivineButton";
import { EyeIcon, PencilIcon } from "../divine/icons";
import { api } from "../../lib/api";
import { useApiResource } from "../../lib/useApiResource";
import { MODULES, usePermissions } from "../../lib/permissions";
import { toast } from "../../lib/toastStore";

export type PaymentMode = {
  _id: string;
  name: string;
  description: string;
  publicAvailability: boolean;
  status: number;
};

function AvailabilityPill({ available }: { available: boolean }) {
  return available ? (
    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] tracking-wide text-emerald-400">
      Yes
    </span>
  ) : (
    <span className="rounded-full border border-ink-500/30 bg-ink-500/10 px-2.5 py-1 text-[11px] tracking-wide text-ink-500">
      No
    </span>
  );
}

const schema = z.object({
  description: z.string().trim().max(500),
  publicAvailability: z.boolean(),
  status: z.number(),
});

type FormValues = z.infer<typeof schema>;

const DEFAULT_PAGE_SIZE = 10;

export default function PaymentModePage() {
  const { can } = usePermissions();
  const canEdit = can(MODULES.paymentModes, "edit");
  const { items, total, list, update } = useApiResource<PaymentMode>(api, "/masters/payment-modes");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [editing, setEditing] = useState<PaymentMode | null>(null);
  const [viewing, setViewing] = useState<PaymentMode | null>(null);

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

  function openEdit(mode: PaymentMode) {
    setEditing(mode);
    reset({ description: mode.description, publicAvailability: mode.publicAvailability, status: mode.status });
    update.setError(null);
  }

  const submit = handleSubmit(async (values) => {
    if (!editing) return;
    const ok = await update.run(editing._id, values);
    if (ok !== undefined) {
      setEditing(null);
      toast.updated("Payment mode updated successfully.");
    }
  });

  const columns: DataTableColumn<PaymentMode>[] = [
    { key: "name", label: "Payment Mode", render: (m) => <span className="font-medium">{m.name}</span> },
    { key: "description", label: "Description", render: (m) => <span className="text-ink-500">{m.description || "—"}</span> },
    {
      key: "publicAvailability",
      label: "Public Availability",
      render: (m) => <AvailabilityPill available={m.publicAvailability} />,
    },
    { key: "status", label: "Status", render: (m) => <StatusPill status={m.status} /> },
  ];

  return (
    <>
      <DataTable
        title="Payment Mode Master"
        subtitle="Manage payment modes (view and edit only)."
        columns={columns}
        rows={items}
        rowKey={(m) => m._id}
        loading={list.submitting}
        search={search}
        onSearchChange={(v) => {
          setPage(1);
          setSearch(v);
        }}
        searchPlaceholder="Search payment modes…"
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
        emptyMessage="No payment modes yet."
        rowActions={(m) => (
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setViewing(m)}
              aria-label="View payment mode"
              className="text-ink-300 hover:text-ink-100"
            >
              <EyeIcon />
            </button>
            {canEdit && (
              <button onClick={() => openEdit(m)} aria-label="Edit payment mode" className="text-amber-600 hover:text-amber-700">
                <PencilIcon />
              </button>
            )}
          </div>
        )}
      />

      <FormDrawer
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title="View Payment Mode"
        subtitle={viewing?.name}
        footer={
          <DivineButton variant="ghost" type="button" onClick={() => setViewing(null)}>
            Close
          </DivineButton>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-amber-600">Payment Mode</p>
            <p className="mt-1 text-[15px] text-ink-100">{viewing?.name}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-amber-600">Description</p>
            <p className="mt-1 text-[14px] text-ink-100">{viewing?.description || "—"}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-amber-600">Public Availability</p>
              <div className="mt-1.5">
                <AvailabilityPill available={Boolean(viewing?.publicAvailability)} />
              </div>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-amber-600">Status</p>
              <div className="mt-1.5">
                <StatusPill status={viewing?.status ?? 0} />
              </div>
            </div>
          </div>
        </div>
      </FormDrawer>

      <FormDrawer
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Edit Payment Mode"
        subtitle="Update details for this payment mode."
        error={update.error}
        footer={
          <div className="flex justify-end gap-3">
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={() => setEditing(null)}>
              Cancel
            </DivineButton>
            <DivineButton fullWidth={false} type="submit" form="payment-mode-form" loading={update.submitting}>
              Save changes
            </DivineButton>
          </div>
        }
      >
        <form id="payment-mode-form" onSubmit={submit} noValidate className="space-y-5">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-amber-600">Payment Mode</p>
            <p className="mt-1 text-[15px] text-ink-100">{editing?.name}</p>
          </div>
          <DivineTextarea label="Description" error={errors.description?.message} {...register("description")} />
          <div className="grid grid-cols-2 gap-4">
            <Controller
              control={control}
              name="publicAvailability"
              render={({ field }) => (
                <DivineRadioGroup label="Public Availability" value={field.value} onChange={field.onChange} />
              )}
            />
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <DivineToggle label="Status" checked={field.value === 1} onChange={(checked) => field.onChange(checked ? 1 : 0)} />
              )}
            />
          </div>
        </form>
      </FormDrawer>
    </>
  );
}
