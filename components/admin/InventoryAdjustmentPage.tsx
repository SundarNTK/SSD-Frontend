"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import DataTable from "./DataTable";
import FormDrawer from "./FormDrawer";
import DivineListbox, { type ListboxOption } from "../divine/DivineListbox";
import DivineInput from "../divine/DivineInput";
import DivineTextarea from "../divine/DivineTextarea";
import DivineButton from "../divine/DivineButton";
import { MOVEMENT_COLUMNS, type InventoryMovement } from "./InventoryHistoryPage";
import { api, unwrap, type ApiEnvelope } from "../../lib/api";
import { useApiResource } from "../../lib/useApiResource";
import { useAsyncAction } from "../../lib/useAsyncAction";
import { MODULES, usePermissions } from "../../lib/permissions";
import { toast } from "../../lib/toastStore";

const TYPE_OPTIONS: ListboxOption[] = [
  { value: "Item", label: "Item" },
  { value: "Service", label: "Service" },
];

const TYPE_FILTER_OPTIONS: ListboxOption[] = [
  { value: "", label: "All Types" },
  { value: "Item", label: "Item" },
  { value: "Service", label: "Service" },
];

const INVENTORY_TYPE_OPTIONS: ListboxOption[] = [
  { value: "Stock In", label: "Stock In" },
  { value: "Stock Out", label: "Stock Out" },
];

const schema = z.object({
  refType: z.enum(["Item", "Service"]),
  refId: z.string().min(1, "Please make a selection"),
  inventoryType: z.enum(["Stock In", "Stock Out"]),
  quantity: z.number().int().min(1, "Must be at least 1"),
  remarks: z.string().trim().max(500),
});

type FormValues = z.infer<typeof schema>;

const DEFAULT_VALUES: FormValues = {
  refType: "Item",
  refId: "",
  inventoryType: "Stock In",
  quantity: 0,
  remarks: "",
};

const DEFAULT_PAGE_SIZE = 10;

/**
 * The one write screen in Inventory — everything else (Available Stock,
 * Inventory History, Low Stock Report) is a read-only view of what this
 * form has recorded. Lists the same ledger as Inventory History (GET
 * /inventory/history) so a manual entry is visible immediately after
 * saving, plus the create action itself.
 */
export default function InventoryAdjustmentPage() {
  const { can } = usePermissions();
  const canCreate = can(MODULES.inventory, "fullAccess");
  // Read (list) and write (create) live at different paths here — GET
  // /inventory/history vs POST /inventory/adjustments — so useApiResource's
  // bundled create (which always POSTs to the same basePath as the list)
  // doesn't fit; list comes from useApiResource, create is hand-rolled.
  const { items, total, list } = useApiResource<InventoryMovement>(api, "/inventory/history");
  const create = useAsyncAction(async (values: FormValues) => {
    await api.post("/inventory/adjustments", values);
    await list.run({ page, pageSize, search: search || undefined, refType: type || undefined });
    return true;
  });

  const [refOptions, setRefOptions] = useState<ListboxOption[]>([]);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    list.run({ page, pageSize, search: search || undefined, refType: type || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, search, type]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: DEFAULT_VALUES });

  const refType = watch("refType");
  const inventoryType = watch("inventoryType");

  useEffect(() => {
    if (!drawerOpen) return;
    api
      .get<ApiEnvelope<{ items: { _id: string; name: string; code: string }[] }>>("/inventory/options", {
        params: { refType },
      })
      .then((res) => setRefOptions(unwrap(res).items.map((r) => ({ value: r._id, label: `${r.name} (${r.code})` }))));
  }, [drawerOpen, refType]);

  function openCreate() {
    reset(DEFAULT_VALUES);
    create.setError(null);
    setDrawerOpen(true);
  }

  const submit = handleSubmit(async (values) => {
    const ok = await create.run(values);
    if (ok !== undefined) {
      setDrawerOpen(false);
      toast.created("Inventory adjusted successfully.");
    }
  });

  return (
    <>
      <DataTable
        title="Inventory Adjustment"
        subtitle="Manually record a stock movement for an inventory-applicable item or service."
        columns={MOVEMENT_COLUMNS}
        rows={items}
        rowKey={(m) => m._id}
        loading={list.submitting}
        search={search}
        onSearchChange={(v) => {
          setPage(1);
          setSearch(v);
        }}
        searchPlaceholder="Search by name or code…"
        extraFilters={
          <DivineListbox
            value={type}
            onChange={(v) => {
              setPage(1);
              setType(v);
            }}
            options={TYPE_FILTER_OPTIONS}
            className="w-40"
          />
        }
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPage(1);
          setPageSize(size);
        }}
        onCreate={canCreate ? openCreate : undefined}
        createLabel="Add Inventory Adjustment"
        emptyMessage="No inventory adjustments yet."
      />

      <FormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Add Inventory Adjustment"
        subtitle="Record a manual stock movement."
        error={create.error}
        footer={
          <div className="flex justify-end gap-3">
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={() => setDrawerOpen(false)}>
              Cancel
            </DivineButton>
            <DivineButton fullWidth={false} type="submit" form="inventory-adjustment-form" loading={create.submitting}>
              Save
            </DivineButton>
          </div>
        }
      >
        <form id="inventory-adjustment-form" onSubmit={submit} noValidate className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Controller
              control={control}
              name="refType"
              render={({ field }) => (
                <DivineListbox
                  label="Select Type"
                  value={field.value}
                  onChange={(v) => {
                    field.onChange(v);
                    setValue("refId", "");
                  }}
                  options={TYPE_OPTIONS}
                />
              )}
            />

            <Controller
              control={control}
              name="refId"
              render={({ field }) => (
                <DivineListbox
                  label={`Select ${refType}`}
                  value={field.value}
                  onChange={field.onChange}
                  options={refOptions}
                  placeholder={`Select a ${refType.toLowerCase()}…`}
                  error={errors.refId?.message}
                />
              )}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Controller
              control={control}
              name="inventoryType"
              render={({ field }) => (
                <DivineListbox
                  label="Inventory Type"
                  value={field.value}
                  onChange={field.onChange}
                  options={INVENTORY_TYPE_OPTIONS}
                />
              )}
            />

            <DivineInput staticLabel
              label={`${inventoryType} Quantity`}
              type="number"
              error={errors.quantity?.message}
              {...register("quantity", { valueAsNumber: true })}
            />
          </div>

          <DivineTextarea staticLabel label="Remarks" error={errors.remarks?.message} {...register("remarks")} />
        </form>
      </FormDrawer>
    </>
  );
}
