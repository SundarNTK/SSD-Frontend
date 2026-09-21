"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import DataTable, { StatusToggleCell, EditIconButton, DeleteIconButton, type DataTableColumn } from "./DataTable";
import FormDrawer from "./FormDrawer";
import ConfirmDialog from "./ConfirmDialog";
import DivineInput from "../divine/DivineInput";
import DivineToggle from "../divine/DivineToggle";
import DivineStatusSelect from "../divine/DivineStatusSelect";
import DivineButton from "../divine/DivineButton";
import DivineListbox, { type ListboxOption } from "../divine/DivineListbox";
import { api, unwrap, type ApiEnvelope } from "../../lib/api";
import { useApiResource } from "../../lib/useApiResource";
import { MODULES, usePermissions } from "../../lib/permissions";
import { toast } from "../../lib/toastStore";
import { patchMasterStatus } from "../../lib/patchMasterStatus";
import { usePageSize } from "../../lib/usePageSize";

type PortalRoute = { key: string; label: string; path: string };
type CmsMeta = { locations: string[]; linkTypes: string[]; portalRoutes: PortalRoute[] };

export type CmsMenu = {
  _id: string;
  code: string;
  name: string;
  tamilName: string;
  location: string;
  parentMenu: { _id: string; name: string; code: string } | null;
  linkType: string;
  cmsPage: { _id: string; title: string; slug: string } | null;
  portalRoute: string | null;
  externalUrl: string;
  openInNewTab: boolean;
  loginRequired: boolean;
  displayOrder: number;
  status: number;
};

const schema = z
  .object({
    code: z.string().trim().min(1, "Code is required").max(30),
    name: z.string().trim().min(1, "Menu name is required").max(100),
    tamilName: z.string().trim().max(100),
    location: z.string().min(1, "Choose where this menu appears"),
    parentMenu: z.string(),
    linkType: z.string().min(1, "Choose what this menu opens"),
    cmsPage: z.string(),
    portalRoute: z.string(),
    externalUrl: z.string().trim().max(500),
    openInNewTab: z.boolean(),
    loginRequired: z.boolean(),
    displayOrder: z.number().int().min(0),
    status: z.number(),
  })
  .superRefine((v, ctx) => {
    if (v.linkType === "CMS Page" && !v.cmsPage) ctx.addIssue({ code: "custom", path: ["cmsPage"], message: "Choose a CMS page" });
    if (v.linkType === "Portal Page" && !v.portalRoute) ctx.addIssue({ code: "custom", path: ["portalRoute"], message: "Choose a portal page" });
    if (v.linkType === "External URL" && !/^https?:\/\/\S+$/i.test(v.externalUrl)) {
      ctx.addIssue({ code: "custom", path: ["externalUrl"], message: "Enter a full http(s) URL" });
    }
  });

type FormValues = z.infer<typeof schema>;

const DEFAULT_VALUES: FormValues = {
  code: "",
  name: "",
  tamilName: "",
  location: "Header",
  parentMenu: "",
  linkType: "CMS Page",
  cmsPage: "",
  portalRoute: "",
  externalUrl: "",
  openInNewTab: false,
  loginRequired: false,
  displayOrder: 0,
  status: 1,
};

const toOptions = (values: string[]): ListboxOption[] => values.map((v) => ({ value: v, label: v }));

/** What a row's link points at, in words the admin recognises. */
function destinationLabel(m: CmsMenu, routes: PortalRoute[]) {
  if (m.linkType === "CMS Page") return m.cmsPage ? `Page · ${m.cmsPage.title}` : "—";
  if (m.linkType === "Portal Page") return `Portal · ${routes.find((r) => r.key === m.portalRoute)?.label ?? m.portalRoute ?? "—"}`;
  return m.externalUrl || "—";
}

/**
 * CMS Menu Master — the Customer Portal's header and footer navigation.
 * Two levels at most (a menu plus its sub-menus). Each entry opens either a
 * CMS Page, a built-in portal screen, or an external URL; the server enforces
 * that exactly one of those destinations is set.
 */
export default function CmsMenuPage() {
  const { can } = usePermissions();
  const canCreate = can(MODULES.cmsMenus, "fullAccess");
  const canEdit = can(MODULES.cmsMenus, "edit");
  const { items, total, list, create, update, remove } = useApiResource<CmsMenu>(api, "/cms/menus");

  const [meta, setMeta] = useState<CmsMeta>({ locations: ["Header", "Footer"], linkTypes: ["CMS Page", "Portal Page", "External URL"], portalRoutes: [] });
  const [pageOptions, setPageOptions] = useState<ListboxOption[]>([]);
  const [topLevelMenus, setTopLevelMenus] = useState<CmsMenu[]>([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = usePageSize();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<CmsMenu | null>(null);
  const [deleting, setDeleting] = useState<CmsMenu | null>(null);

  useEffect(() => {
    api.get<ApiEnvelope<CmsMeta>>("/cms/meta").then((res) => setMeta(unwrap(res))).catch(() => {});
  }, []);

  /** Pages a menu can open, and the top-level menus a sub-menu can hang under — refreshed each time the drawer opens so a just-added page/menu is there. */
  function loadDropdownSources() {
    api
      .get<ApiEnvelope<{ items: { _id: string; title: string }[] }>>("/cms/pages", { params: { status: 1, pageSize: 100 } })
      .then((res) => setPageOptions(unwrap(res).items.map((p) => ({ value: p._id, label: p.title }))))
      .catch(() => {});
    api
      .get<ApiEnvelope<{ items: CmsMenu[] }>>("/cms/menus", { params: { status: 1, pageSize: 100 } })
      .then((res) => setTopLevelMenus(unwrap(res).items.filter((m) => !m.parentMenu)))
      .catch(() => {});
  }

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

  const linkType = watch("linkType");
  const location = watch("location");

  const parentOptions: ListboxOption[] = useMemo(
    () => topLevelMenus.filter((m) => m.location === location && m._id !== editing?._id).map((m) => ({ value: m._id, label: `${m.name} (${m.code})` })),
    [topLevelMenus, location, editing]
  );
  const portalOptions: ListboxOption[] = meta.portalRoutes.map((r) => ({ value: r.key, label: `${r.label} — ${r.path}` }));

  function openCreate() {
    setEditing(null);
    reset(DEFAULT_VALUES);
    create.setError(null);
    loadDropdownSources();
    setDrawerOpen(true);
  }

  function openEdit(m: CmsMenu) {
    setEditing(m);
    reset({
      code: m.code,
      name: m.name,
      tamilName: m.tamilName ?? "",
      location: m.location,
      parentMenu: m.parentMenu?._id ?? "",
      linkType: m.linkType,
      cmsPage: m.cmsPage?._id ?? "",
      portalRoute: m.portalRoute ?? "",
      externalUrl: m.externalUrl ?? "",
      openInNewTab: m.openInNewTab,
      loginRequired: m.loginRequired,
      displayOrder: m.displayOrder,
      status: m.status,
    });
    update.setError(null);
    loadDropdownSources();
    setDrawerOpen(true);
  }

  const submit = handleSubmit(async (values) => {
    const ok = editing ? await update.run(editing._id, values) : await create.run(values);
    if (ok !== undefined) {
      setDrawerOpen(false);
      if (editing) toast.updated("CMS menu updated successfully.");
      else toast.created("CMS menu created successfully.");
      list.run({ page, pageSize, search: search || undefined, status: statusFilter || undefined });
    }
  });

  const columns: DataTableColumn<CmsMenu>[] = [
    { key: "code", label: "Code", render: (m) => <span className="font-medium tabular-nums text-amber-700">{m.code}</span> },
    {
      key: "name",
      label: "Menu",
      render: (m) => (
        <div className={m.parentMenu ? "pl-4" : ""}>
          <span className="font-medium">{m.parentMenu ? "↳ " : ""}{m.name}</span>
          {m.tamilName && <div className="text-[12px] text-ink-500">{m.tamilName}</div>}
        </div>
      ),
    },
    { key: "location", label: "Location", render: (m) => m.location },
    { key: "parentMenu", label: "Parent", render: (m) => <span className="text-ink-500">{m.parentMenu?.name ?? "—"}</span> },
    { key: "linkType", label: "Opens", render: (m) => <span className="text-ink-500">{destinationLabel(m, meta.portalRoutes)}</span> },
    { key: "loginRequired", label: "Login Only", render: (m) => <span className="text-ink-500">{m.loginRequired ? "Yes" : "No"}</span> },
    { key: "displayOrder", label: "Order", render: (m) => <span className="tabular-nums">{m.displayOrder}</span> },
    { key: "status", label: "Status", render: (m) => (
      <StatusToggleCell status={m.status} canEdit={canEdit} onChange={(status) => patchMasterStatus(update, m._id, status, "CMS menu")} />
    ) },
  ];

  return (
    <>
      <DataTable
        title="CMS Menu Master"
        subtitle="Header and footer navigation for the Customer Portal — each menu opens a CMS page, a portal screen or an external link."
        columns={columns}
        rows={items}
        rowKey={(m) => m._id}
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
        createLabel="Add CMS Menu"
        emptyMessage="No CMS menus yet — create the first one."
        rowActions={(m) => (
          <div className="flex justify-end gap-2">
            {canEdit && <EditIconButton onClick={() => openEdit(m)} />}
            {canCreate && <DeleteIconButton onClick={() => setDeleting(m)} />}
          </div>
        )}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this CMS menu?"
        message={deleting ? `"${deleting.name}" will be removed from the portal navigation.` : ""}
        confirmLabel="Delete menu"
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
            toast.deleted("CMS menu deleted successfully.");
          }
        }}
      />

      <FormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? "Edit CMS Menu" : "Add CMS Menu"}
        subtitle={editing ? `${editing.name} · ${editing.code}` : "Add an entry to the Customer Portal navigation."}
        error={create.error || update.error}
        footer={
          <div className="flex justify-end gap-3">
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={() => setDrawerOpen(false)}>
              Cancel
            </DivineButton>
            <DivineButton variant="flame" fullWidth={false} type="submit" form="cms-menu-form" loading={create.submitting || update.submitting}>
              {editing ? "Save changes" : "Save"}
            </DivineButton>
          </div>
        }
      >
        <form id="cms-menu-form" onSubmit={submit} noValidate className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <DivineInput staticLabel label="Code" error={errors.code?.message} {...register("code")} />
            <DivineInput staticLabel label="Display Order" type="number" error={errors.displayOrder?.message} {...register("displayOrder", { valueAsNumber: true })} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <DivineInput staticLabel label="Menu Name" error={errors.name?.message} {...register("name")} />
            <DivineInput staticLabel label="Tamil Name" error={errors.tamilName?.message} {...register("tamilName")} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Controller
              control={control}
              name="location"
              render={({ field }) => (
                <DivineListbox
                  label="Location"
                  value={field.value}
                  onChange={(v) => {
                    field.onChange(v);
                    // A parent must sit in the same location — drop a now-mismatched one.
                    setValue("parentMenu", "");
                  }}
                  options={toOptions(meta.locations)}
                  clearable={false}
                  error={errors.location?.message}
                />
              )}
            />
            <Controller
              control={control}
              name="parentMenu"
              render={({ field }) => (
                <DivineListbox
                  label="Parent Menu"
                  value={field.value}
                  onChange={field.onChange}
                  options={parentOptions}
                  placeholder="None (top-level)"
                  error={errors.parentMenu?.message}
                />
              )}
            />
          </div>

          <Controller
            control={control}
            name="linkType"
            render={({ field }) => (
              <DivineListbox
                label="Opens"
                value={field.value}
                onChange={field.onChange}
                options={toOptions(meta.linkTypes)}
                clearable={false}
                error={errors.linkType?.message}
              />
            )}
          />

          {linkType === "CMS Page" && (
            <Controller
              control={control}
              name="cmsPage"
              render={({ field }) => (
                <DivineListbox
                  label="CMS Page"
                  value={field.value}
                  onChange={field.onChange}
                  options={pageOptions}
                  placeholder="Select a page…"
                  error={errors.cmsPage?.message}
                />
              )}
            />
          )}
          {linkType === "Portal Page" && (
            <Controller
              control={control}
              name="portalRoute"
              render={({ field }) => (
                <DivineListbox
                  label="Portal Page"
                  value={field.value}
                  onChange={field.onChange}
                  options={portalOptions}
                  placeholder="Select a portal page…"
                  error={errors.portalRoute?.message}
                />
              )}
            />
          )}
          {linkType === "External URL" && (
            <DivineInput staticLabel label="External URL" placeholder="https://" error={errors.externalUrl?.message} {...register("externalUrl")} />
          )}

          <div className="grid grid-cols-2 gap-4">
            <Controller
              control={control}
              name="openInNewTab"
              render={({ field }) => <DivineToggle boxed label="Open in New Tab" checked={field.value} onChange={field.onChange} onLabel="Yes" offLabel="No" />}
            />
            <Controller
              control={control}
              name="loginRequired"
              render={({ field }) => <DivineToggle boxed label="Login Required" checked={field.value} onChange={field.onChange} onLabel="Yes" offLabel="No" />}
            />
          </div>

          <Controller
            control={control}
            name="status"
            render={({ field }) => <DivineStatusSelect value={field.value} onChange={field.onChange} />}
          />
        </form>
      </FormDrawer>
    </>
  );
}
