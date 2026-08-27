"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import DataTable, { StatusPill, EditIconButton, type DataTableColumn } from "./DataTable";
import FormDrawer from "./FormDrawer";
import DivineInput from "../divine/DivineInput";
import DivineTextarea from "../divine/DivineTextarea";
import DivineListbox, { type ListboxOption } from "../divine/DivineListbox";
import DivineToggle from "../divine/DivineToggle";
import DivineButton from "../divine/DivineButton";
import { api, unwrap, type ApiEnvelope } from "../../lib/api";
import { useApiResource } from "../../lib/useApiResource";
import { MODULES, usePermissions } from "../../lib/permissions";
import { toast } from "../../lib/toastStore";

type Ref = { _id: string; name: string };

export type GlGroup = {
  _id: string;
  level: 1 | 2 | 3;
  name: string;
  description: string;
  status: number;
  level1?: Ref | null;
  level2?: Ref | null;
};

const schema = z.object({
  level1: z.string().optional(),
  level2: z.string().optional(),
  name: z.string().trim().min(1, "Name is required").max(150),
  description: z.string().trim().max(300),
  status: z.number(),
});

type FormValues = z.infer<typeof schema>;

const DEFAULT_PAGE_SIZE = 10;
const TABS: { level: 1 | 2 | 3; label: string }[] = [
  { level: 1, label: "Level 1" },
  { level: 2, label: "Level 2" },
  { level: 3, label: "Level 3" },
];

/**
 * One collection, three tabs — matches how the backend stores this
 * (models/gl-groups: a single GlGroup schema distinguished by `level`).
 * Each tab's table always shows every row at that level; the "Select
 * Level 1"/"Select Level 2" dropdowns only appear inside the Add modal,
 * to pick a parent, never to filter the table itself.
 */
export default function GlGroupPage() {
  const { can } = usePermissions();
  const canCreate = can(MODULES.glGroups, "fullAccess");
  const canEdit = can(MODULES.glGroups, "edit");

  const [activeLevel, setActiveLevel] = useState<1 | 2 | 3>(1);
  const { items, total, list, create, update } = useApiResource<GlGroup>(api, "/masters/gl-groups");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<GlGroup | null>(null);

  const [level1Options, setLevel1Options] = useState<ListboxOption[]>([]);
  const [level2Options, setLevel2Options] = useState<ListboxOption[]>([]);

  useEffect(() => {
    setPage(1);
    setSearch("");
    setStatusFilter("");
  }, [activeLevel]);

  useEffect(() => {
    list.run({
      level: activeLevel,
      page,
      pageSize,
      search: search || undefined,
      status: statusFilter || undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLevel, page, pageSize, search, statusFilter]);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    control,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const selectedLevel1 = watch("level1");

  async function loadLevel1Options() {
    const res = await api.get<ApiEnvelope<{ items: GlGroup[] }>>("/masters/gl-groups", {
      params: { level: 1, status: 1, pageSize: 100 },
    });
    setLevel1Options(unwrap(res).items.map((g) => ({ value: g._id, label: g.name })));
  }

  async function loadLevel2Options(level1Id: string) {
    if (!level1Id) {
      setLevel2Options([]);
      return;
    }
    const res = await api.get<ApiEnvelope<{ items: GlGroup[] }>>("/masters/gl-groups", {
      params: { level: 2, level1: level1Id, status: 1, pageSize: 100 },
    });
    setLevel2Options(unwrap(res).items.map((g) => ({ value: g._id, label: g.name })));
  }

  useEffect(() => {
    if (activeLevel >= 2) loadLevel1Options();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLevel, drawerOpen]);

  useEffect(() => {
    if (activeLevel === 3) loadLevel2Options(selectedLevel1 || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLevel1, activeLevel]);

  function openCreate() {
    setEditing(null);
    reset({ level1: "", level2: "", name: "", description: "", status: 1 });
    create.setError(null);
    setDrawerOpen(true);
  }

  function openEdit(group: GlGroup) {
    setEditing(group);
    reset({
      level1: group.level1?._id ?? "",
      level2: group.level2?._id ?? "",
      name: group.name,
      description: group.description,
      status: group.status,
    });
    update.setError(null);
    setDrawerOpen(true);
  }

  const submit = handleSubmit(async (values) => {
    if (editing) {
      const ok = await update.run(editing._id, {
        name: values.name,
        description: values.description,
        status: values.status,
      });
      if (ok !== undefined) {
        setDrawerOpen(false);
        toast.updated(`Level ${editing.level} group updated successfully.`);
      }
      return;
    }

    const body: Record<string, unknown> = {
      level: activeLevel,
      name: values.name,
      description: values.description,
      status: values.status,
    };
    if (activeLevel >= 2) body.level1 = values.level1;
    if (activeLevel === 3) body.level2 = values.level2;

    const ok = await create.run(body);
    if (ok !== undefined) {
      setDrawerOpen(false);
      toast.created(`Level ${activeLevel} group created successfully.`);
    }
  });

  const columns: DataTableColumn<GlGroup>[] = [
    ...(activeLevel >= 2
      ? [{ key: "level1", label: "Level 1", render: (g: GlGroup) => <span className="text-ink-500">{g.level1?.name ?? "—"}</span> }]
      : []),
    ...(activeLevel === 3
      ? [{ key: "level2", label: "Level 2", render: (g: GlGroup) => <span className="text-ink-500">{g.level2?.name ?? "—"}</span> }]
      : []),
    { key: "name", label: "Name", render: (g) => <span className="font-medium">{g.name}</span> },
    { key: "description", label: "Description", render: (g) => <span className="text-ink-500">{g.description || "—"}</span> },
    { key: "status", label: "Status", render: (g) => <StatusPill status={g.status} /> },
  ];

  return (
    <>
      <div className="mb-5 space-y-1">
        <h1 className="font-display text-[28px] font-bold text-ink-100">GL Group Master</h1>
        <p className="text-[13px] text-ink-500">Manage GL Group hierarchy by Level 1, 2, 3.</p>
      </div>

      {/* A recessed "groove" the active tab visibly pops out of — shadow-inner
          on the track, an outer drop shadow plus a lifted -translate-y and a
          glossy inset top highlight on whichever tab is active, so it reads
          as a raised physical button rather than a flat color swap. */}
      <div className="mb-5 flex gap-1.5 rounded-2xl bg-ivory-100 p-1.5 shadow-inner">
        {TABS.map((tab) => {
          const isActive = activeLevel === tab.level;
          return (
            <button
              key={tab.level}
              onClick={() => setActiveLevel(tab.level)}
              className={`flex-1 rounded-xl py-2.5 text-[13.5px] font-semibold transition-all duration-200 ${
                isActive
                  ? "-translate-y-0.5 bg-gradient-to-b from-crimson-500 via-flame-500 to-[#FFC145] text-white shadow-[0_6px_14px_-4px_rgba(220,38,38,0.55),inset_0_1px_0_rgba(255,255,255,0.35)]"
                  : "text-ink-300 hover:bg-white hover:text-ink-100"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <DataTable
        title=""
        columns={columns}
        rows={items}
        rowKey={(g) => g._id}
        loading={list.submitting}
        search={search}
        onSearchChange={(v) => {
          setPage(1);
          setSearch(v);
        }}
        searchPlaceholder={`Search Level ${activeLevel} groups…`}
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
        createLabel={`Add Level ${activeLevel}`}
        emptyMessage={`No Level ${activeLevel} groups yet.`}
        rowActions={(g) =>
          canEdit ? (
            <div className="flex justify-end">
              <EditIconButton onClick={() => openEdit(g)} />
            </div>
          ) : null
        }
      />

      <FormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? `Edit Level ${editing.level}` : `Add Level ${activeLevel}`}
        subtitle={editing ? editing.name : undefined}
        error={create.error || update.error}
        footer={
          <div className="flex justify-end gap-3">
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={() => setDrawerOpen(false)}>
              Cancel
            </DivineButton>
            <DivineButton fullWidth={false} type="submit" form="gl-group-form" loading={create.submitting || update.submitting}>
              Save
            </DivineButton>
          </div>
        }
      >
        <form id="gl-group-form" onSubmit={submit} noValidate className="space-y-5">
          {activeLevel >= 2 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {editing ? (
                <div className="w-full">
                  <p className="mb-2 text-[11px] uppercase tracking-wide text-amber-600">Level 1</p>
                  <div className="rounded-xl border border-gold-500/15 bg-ivory-100 px-4 py-2.5 text-[15px] text-ink-300">
                    {editing.level1?.name ?? "—"}
                  </div>
                </div>
              ) : (
                <Controller
                  control={control}
                  name="level1"
                  render={({ field }) => (
                    <DivineListbox
                      label="Level 1"
                      value={field.value ?? ""}
                      onChange={(v) => {
                        field.onChange(v);
                        if (activeLevel === 3) setValue("level2", "");
                      }}
                      options={level1Options}
                      placeholder="Select Level 1"
                    />
                  )}
                />
              )}
              {activeLevel === 3 &&
                (editing ? (
                  <div className="w-full">
                    <p className="mb-2 text-[11px] uppercase tracking-wide text-amber-600">Level 2</p>
                    <div className="rounded-xl border border-gold-500/15 bg-ivory-100 px-4 py-2.5 text-[15px] text-ink-300">
                      {editing.level2?.name ?? "—"}
                    </div>
                  </div>
                ) : (
                  <Controller
                    control={control}
                    name="level2"
                    render={({ field }) => (
                      <DivineListbox
                        label="Level 2"
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        options={level2Options}
                        placeholder={selectedLevel1 ? "Select Level 2" : "Select Level 1 first"}
                      />
                    )}
                  />
                ))}
            </div>
          )}
          {editing && activeLevel >= 2 && (
            <p className="-mt-3 pl-1 text-[11.5px] text-ink-500">
              The hierarchy can&rsquo;t be changed after creation — delete and recreate this group if it needs a different parent.
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DivineInput staticLabel
              label={`Level ${editing?.level ?? activeLevel} Name`}
              error={errors.name?.message}
              {...register("name")}
            />
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <DivineToggle boxed label="Status" checked={field.value === 1} onChange={(checked) => field.onChange(checked ? 1 : 0)} />
              )}
            />
          </div>
          <DivineTextarea staticLabel label="Description" error={errors.description?.message} {...register("description")} />
        </form>
      </FormDrawer>
    </>
  );
}
