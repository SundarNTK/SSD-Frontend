"use client";

import { useEffect, useState } from "react";
import type { Control, FieldErrors, UseFormRegister } from "react-hook-form";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import DataTable, { StatusToggleCell, EditIconButton, DeleteIconButton, type DataTableColumn } from "./DataTable";
import FormDrawer from "./FormDrawer";
import ConfirmDialog from "./ConfirmDialog";
import DivineInput from "../divine/DivineInput";
import DivineTextarea from "../divine/DivineTextarea";
import CmsImageField from "./CmsImageField";
import CmsHtmlEditor from "./CmsHtmlEditor";
import DivineStatusSelect from "../divine/DivineStatusSelect";
import DivineButton from "../divine/DivineButton";
import CmsSectionsEditor, { type SectionValues, type SectionsForm } from "./CmsSectionsEditor";
import { api } from "../../lib/api";
import { useApiResource } from "../../lib/useApiResource";
import { MODULES, usePermissions } from "../../lib/permissions";
import { toast } from "../../lib/toastStore";
import { patchMasterStatus } from "../../lib/patchMasterStatus";
import { usePageSize } from "../../lib/usePageSize";

export type CmsPage = {
  _id: string;
  title: string;
  tamilTitle: string;
  slug: string;
  summary: string;
  content: string;
  tamilContent: string;
  sections: SectionValues[];
  bannerImage: string;
  metaTitle: string;
  metaDescription: string;
  status: number;
  updatedAt?: string;
};

// A link or image the portal may render — same rule as the backend's SAFE_URL.
const SAFE_URL = /^(https?:\/\/\S+|\/\S*|#\S*)?$/i;
const urlField = z.string().trim().max(500).regex(SAFE_URL, "Enter a full http(s) URL or a site path such as /customer/login");

const sectionSchema = z.object({
  type: z.string().min(1),
  enabled: z.boolean(),
  eyebrow: z.string().trim().max(100),
  title: z.string().trim().max(150),
  subtitle: z.string().trim().max(300),
  content: z.string().trim().max(2000),
  image: urlField,
  primaryLabel: z.string().trim().max(40),
  primaryLink: urlField,
  secondaryLabel: z.string().trim().max(40),
  secondaryLink: urlField,
  limit: z.number().int().min(1, "At least 1").max(60, "At most 60"),
  items: z
    .array(
      z.object({
        image: urlField,
        label: z.string().trim().max(60),
        heading: z.string().trim().max(150),
        text: z.string().trim().max(400),
        link: urlField,
      })
    )
    .max(24),
});

const schema = z.object({
  title: z.string().trim().min(1, "Title is required").max(150),
  tamilTitle: z.string().trim().max(150),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Slug is required")
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens, e.g. about-the-temple"),
  summary: z.string().trim().max(300, "Keep the summary under 300 characters"),
  content: z.string().max(100000),
  tamilContent: z.string().max(100000),
  sections: z.array(sectionSchema).max(30),
  bannerImage: urlField,
  metaTitle: z.string().trim().max(70, "Keep the SEO title under 70 characters"),
  metaDescription: z.string().trim().max(160, "Keep the SEO description under 160 characters"),
  status: z.number(),
});

type FormValues = z.infer<typeof schema>;

const DEFAULT_VALUES: FormValues = {
  title: "",
  tamilTitle: "",
  slug: "",
  summary: "",
  content: "",
  tamilContent: "",
  sections: [],
  bannerImage: "",
  metaTitle: "",
  metaDescription: "",
  status: 1,
};

const toSlug = (text: string) =>
  text
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

/**
 * CMS Page Master — the admin-written content pages (About, Contact,
 * Privacy Policy, ...) the Customer Portal serves at /customer/pages/<slug>.
 * Content is basic HTML; the server sanitises it on save (see
 * SSD-Backend controllers/cms/sanitize-content.js).
 */
export default function CmsPagePage() {
  const { can } = usePermissions();
  const canCreate = can(MODULES.cmsPages, "fullAccess");
  const canEdit = can(MODULES.cmsPages, "edit");
  const { items, total, list, create, update, remove } = useApiResource<CmsPage>(api, "/cms/pages");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = usePageSize();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<CmsPage | null>(null);
  const [deleting, setDeleting] = useState<CmsPage | null>(null);
  // Once the admin types in the slug themselves, stop overwriting it from the title.
  const [slugTouched, setSlugTouched] = useState(false);

  useEffect(() => {
    list.run({ page, pageSize, search: search || undefined, status: statusFilter || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, search, statusFilter]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: DEFAULT_VALUES });

  function openCreate() {
    setEditing(null);
    setSlugTouched(false);
    reset(DEFAULT_VALUES);
    create.setError(null);
    setDrawerOpen(true);
  }

  function openEdit(row: CmsPage) {
    setEditing(row);
    setSlugTouched(true);
    reset({
      title: row.title,
      tamilTitle: row.tamilTitle ?? "",
      slug: row.slug,
      summary: row.summary ?? "",
      content: row.content ?? "",
      tamilContent: row.tamilContent ?? "",
      sections: (row.sections ?? []).map((sec) => ({ ...sec, items: sec.items ?? [] })),
      bannerImage: row.bannerImage ?? "",
      metaTitle: row.metaTitle ?? "",
      metaDescription: row.metaDescription ?? "",
      status: row.status,
    });
    update.setError(null);
    setDrawerOpen(true);
  }

  const submit = handleSubmit(async (values) => {
    const ok = editing ? await update.run(editing._id, values) : await create.run(values);
    if (ok !== undefined) {
      setDrawerOpen(false);
      if (editing) toast.updated("CMS page updated successfully.");
      else toast.created("CMS page created successfully.");
    }
  });

  const titleField = register("title");
  const slugField = register("slug");

  const columns: DataTableColumn<CmsPage>[] = [
    { key: "title", label: "Title", render: (p) => <span className="font-medium">{p.title}</span> },
    { key: "tamilTitle", label: "Tamil Title", render: (p) => <span className="text-ink-500">{p.tamilTitle || "—"}</span> },
    { key: "slug", label: "Page URL", render: (p) => <span className="tabular-nums text-amber-700">/customer/pages/{p.slug}</span> },
    { key: "sections", label: "Sections", render: (p) => <span className="tabular-nums text-ink-500">{p.sections?.length ?? 0}</span> },
    { key: "summary", label: "Summary", render: (p) => <span className="line-clamp-2 max-w-xs text-ink-500">{p.summary || "—"}</span> },
    { key: "status", label: "Status", render: (p) => (
      <StatusToggleCell status={p.status} canEdit={canEdit} onChange={(status) => patchMasterStatus(update, p._id, status, "CMS page")} />
    ) },
  ];

  return (
    <>
      <DataTable
        title="CMS Page Master"
        subtitle="Pages for the Customer Portal — the Home page (slug: home), About, Contact, policies and more."
        columns={columns}
        rows={items}
        rowKey={(p) => p._id}
        loading={list.submitting}
        search={search}
        onSearchChange={(v) => {
          setPage(1);
          setSearch(v);
        }}
        searchPlaceholder="Search by title or slug…"
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
        createLabel="Add CMS Page"
        emptyMessage="No CMS pages yet — create the first one."
        rowActions={(p) => (
          <div className="flex justify-end gap-2">
            {canEdit && <EditIconButton onClick={() => openEdit(p)} />}
            {canCreate && <DeleteIconButton onClick={() => setDeleting(p)} />}
          </div>
        )}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this CMS page?"
        message={deleting ? `"${deleting.title}" will be removed from the portal.` : ""}
        confirmLabel="Delete page"
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
            toast.deleted("CMS page deleted successfully.");
          }
        }}
      />

      <FormDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? "Edit CMS Page" : "Add CMS Page"}
        subtitle={editing ? `${editing.title} · /${editing.slug}` : "Create a content page for the Customer Portal."}
        error={create.error || update.error}
        maxWidthClassName="max-w-3xl"
        footer={
          <div className="flex justify-end gap-3">
            <DivineButton variant="ghost" fullWidth={false} type="button" onClick={() => setDrawerOpen(false)}>
              Cancel
            </DivineButton>
            <DivineButton variant="flame" fullWidth={false} type="submit" form="cms-page-form" loading={create.submitting || update.submitting}>
              {editing ? "Save changes" : "Save"}
            </DivineButton>
          </div>
        }
      >
        <form id="cms-page-form" onSubmit={submit} noValidate className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <DivineInput
              staticLabel
              label="Title"
              error={errors.title?.message}
              {...titleField}
              onChange={(e) => {
                titleField.onChange(e);
                if (!slugTouched) setValue("slug", toSlug(e.target.value), { shouldValidate: false });
              }}
            />
            <DivineInput staticLabel label="Tamil Title" error={errors.tamilTitle?.message} {...register("tamilTitle")} />
          </div>

          <DivineInput
            staticLabel
            label="Slug (page URL)"
            error={errors.slug?.message}
            {...slugField}
            onChange={(e) => {
              setSlugTouched(true);
              slugField.onChange(e);
            }}
          />

          <DivineTextarea staticLabel label="Summary" rows={2} hint="Short description shown on cards and link previews (max 300 characters)." error={errors.summary?.message} {...register("summary")} />

          {/* Page sections come first: on a page like Home they ARE the page (the slider, events, services, items). The editor only needs the `sections` slice of this form; the casts hand it that view. */}
          <CmsSectionsEditor
            control={control as unknown as Control<SectionsForm>}
            register={register as unknown as UseFormRegister<SectionsForm>}
            errors={errors as unknown as FieldErrors<SectionsForm>}
          />

          <Controller
            control={control}
            name="content"
            render={({ field }) => (
              <CmsHtmlEditor
                label="Content (English)"
                value={field.value}
                onChange={field.onChange}
                hint="Use the toolbar for headings, lists, links and quotes. Anything unsafe (scripts, embedded frames) is removed when you save."
                error={errors.content?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="tamilContent"
            render={({ field }) => <CmsHtmlEditor label="Content (Tamil)" rows={8} value={field.value} onChange={field.onChange} hint="Optional — shown below the English text." error={errors.tamilContent?.message} />}
          />

          <Controller
            control={control}
            name="bannerImage"
            render={({ field }) => (
              <CmsImageField
                label="Page banner image"
                value={field.value}
                onChange={field.onChange}
                hint="Shown across the top of this page on the portal. JPG, PNG or WebP, up to 1 MB."
                error={errors.bannerImage?.message}
              />
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <DivineInput staticLabel label="SEO Title" error={errors.metaTitle?.message} {...register("metaTitle")} />
            <Controller
              control={control}
              name="status"
              render={({ field }) => <DivineStatusSelect value={field.value} onChange={field.onChange} />}
            />
          </div>
          <DivineTextarea staticLabel label="SEO Description" rows={2} error={errors.metaDescription?.message} {...register("metaDescription")} />
        </form>
      </FormDrawer>
    </>
  );
}
