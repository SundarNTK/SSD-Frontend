"use client";

import { useState } from "react";
import { Controller, useFieldArray, type Control, type FieldErrors, type UseFormRegister } from "react-hook-form";
import DivineInput from "../divine/DivineInput";
import DivineTextarea from "../divine/DivineTextarea";
import DivineListbox from "../divine/DivineListbox";
import CmsImageField from "./CmsImageField";
import { ArrowDownIcon, ArrowUpIcon, ChevronIcon, PlusIcon, TrashIcon } from "../divine/icons";

/**
 * The sections a CMS page is built from — the Customer Portal renders them in
 * this order. Mirrors SSD-Backend's SECTION_TYPES and the per-type field
 * meanings documented in controllers/cms/request-objects.js.
 */

export type SectionItemValues = { image: string; label: string; heading: string; text: string; link: string };
export type SectionValues = {
  type: string;
  enabled: boolean;
  eyebrow: string;
  title: string;
  subtitle: string;
  content: string;
  image: string;
  primaryLabel: string;
  primaryLink: string;
  secondaryLabel: string;
  secondaryLink: string;
  limit: number;
  items: SectionItemValues[];
};

/** The slice of the page form this editor works on — a structural type so it can sit inside any parent form. */
export type SectionsForm = { sections: SectionValues[] };

type Field = "eyebrow" | "title" | "subtitle" | "content" | "image" | "primary" | "secondary" | "primaryLabel" | "secondaryLabel" | "limit";
type ItemField = { key: keyof SectionItemValues; label: string; multiline?: boolean; suggestions?: string[]; image?: boolean };

type TypeConfig = {
  description: string;
  fields: Field[];
  /** Per-type wording for the shared fields. */
  labels?: Partial<Record<Field, string>>;
  itemsLabel?: string;
  /** Cap on the number of rows (the banner slider holds at most five images). */
  maxItems?: number;
  itemFields?: ItemField[];
};

const CONTACT_LABELS = ["Address", "Phone", "Email", "Working Hours", "Facebook", "Instagram", "YouTube"];

/**
 * Every visible section is filled from a master, so here an administrator only
 * sets its heading and how many records to show. (Mirrors SSD-Backend's
 * SECTION_TYPES.)
 */
const CONFIG: Record<string, TypeConfig> = {
  Banner: {
    description: "The image slider at the top of the page: up to 5 uploaded images, each shown in full. Nothing to do with events.",
    fields: ["title"],
    labels: { title: "Headline (read by search engines)" },
    itemsLabel: "Slider images",
    maxItems: 5,
    itemFields: [
      { key: "image", label: "Slider image", image: true },
      { key: "heading", label: "Alt text — describe the image (not shown on the page)" },
      { key: "link", label: "Link when the image is clicked (optional, e.g. /customer#events)" },
    ],
  },
  Events: {
    description: "Upcoming events from the Event master, shown as cards (their Slider image) with a pager.",
    fields: ["title", "subtitle", "limit"],
    labels: { limit: "Cards per page (3 per row — 9 fills three rows)" },
  },
  Services: {
    description: "Services from the Service master (active, available online), as cards with a pager.",
    fields: ["title", "subtitle", "limit"],
    labels: { limit: "Cards per page (3 per row — 9 fills three rows)" },
  },
  Items: {
    description: "Items from the Item master (active, available online), in a searchable row the visitor scrolls.",
    fields: ["title", "subtitle", "limit"],
    labels: { limit: "Minimum items to load (all available up to this many, at least 24)" },
  },
  Footer: {
    description: "Not shown on the page: the wording of the portal footer. Footer links come from CMS Menu (location: Footer).",
    fields: ["content", "primaryLabel", "secondaryLabel", "eyebrow", "subtitle"],
    labels: {
      content: "About text under the logo",
      primaryLabel: "Links column heading",
      secondaryLabel: "Hours column heading",
      eyebrow: "Note under the hours",
      subtitle: "Copyright line — {year} becomes the current year",
    },
    itemsLabel: "Opening hours",
    itemFields: [
      { key: "label", label: "Days (e.g. Mon-Sun)" },
      { key: "text", label: "Times (e.g. 6:00 AM - 9:00 PM)" },
    ],
  },
  SiteDetails: {
    description: "Not shown on the page: the logo, address, phone, hours and social links used by the portal's header and footer.",
    fields: ["image", "content"],
    labels: { image: "Temple logo", content: "Footer blurb" },
    itemsLabel: "Contact details",
    itemFields: [
      { key: "label", label: "Type", suggestions: CONTACT_LABELS },
      { key: "text", label: "Value (text, or full URL for social links)" },
    ],
  },
};

export const SECTION_TYPE_OPTIONS = Object.keys(CONFIG);

const EMPTY_ITEM: SectionItemValues = { image: "", label: "", heading: "", text: "", link: "" };

const DEFAULTS: Record<string, { title: string; subtitle: string; limit: number }> = {
  Banner: { title: "Welcome to Sri Siva Durga Temple", subtitle: "", limit: 5 },
  Events: { title: "Upcoming Events", subtitle: "Festivals and special occasions at the temple", limit: 9 },
  Services: { title: "Book a Service", subtitle: "Choose from our available pooja and seva services", limit: 9 },
  Items: { title: "Offerings & Items", subtitle: "Make an offering online", limit: 30 },
  SiteDetails: { title: "", subtitle: "", limit: 6 },
  Footer: { title: "", subtitle: "© {year} Sri Siva Durga Temple. All rights reserved.", limit: 6 },
};

export function newSection(type: string): SectionValues {
  const d = DEFAULTS[type] ?? DEFAULTS.Events;
  return {
    type,
    enabled: true,
    eyebrow: "",
    title: d.title,
    subtitle: d.subtitle,
    content: "",
    image: "",
    primaryLabel: type === "Footer" ? "Quick Links" : "",
    primaryLink: "",
    secondaryLabel: type === "Footer" ? "Working Hours" : "",
    secondaryLink: "",
    limit: d.limit,
    items:
      type === "SiteDetails"
        ? ["Address", "Phone", "Email", "Working Hours", "Facebook", "Instagram", "YouTube"].map((label) => ({ image: "", label, heading: "", text: "", link: "" }))
        : type === "Footer"
          ? [{ image: "", label: "Mon-Sun", heading: "", text: "", link: "" }]
          : [],
  };
}

type Props = {
  // Structural control/register so the editor doesn't depend on the parent's full form type.
  control: Control<SectionsForm>;
  register: UseFormRegister<SectionsForm>;
  errors: FieldErrors<SectionsForm>;
};

export default function CmsSectionsEditor({ control, register, errors }: Props) {
  const { fields, append, remove, move } = useFieldArray({ control, name: "sections" });
  // Sections start OPEN — an admin opening a page should see its slider images and settings straight
  // away, not a list of collapsed rows — so this tracks the ones they have collapsed.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-maroon">Page Sections</h3>
          <p className="text-[12.5px] text-ink-500">Blocks shown on the portal page, in this order. Leave empty for a plain text page.</p>
        </div>
        <div className="w-56">
          <DivineListbox
            label="Add a section"
            value=""
            onChange={(type) => {
              if (!type) return;
              append(newSection(type));
            }}
            options={SECTION_TYPE_OPTIONS.map((t) => ({ value: t, label: t }))}
            placeholder="Choose type…"
            clearable={false}
            icon={<PlusIcon />}
          />
        </div>
      </div>

      {fields.length === 0 && (
        <p className="rounded-xl border border-dashed border-gold-500/40 bg-ivory-50 px-4 py-6 text-center text-[13px] text-ink-500">
          No sections yet — add one above.
        </p>
      )}

      {fields.map((field, index) => {
        const cfg = CONFIG[field.type] ?? CONFIG.Announcement;
        const isOpen = !collapsed.has(field.id);
        const base = `sections.${index}` as const;
        const sectionErrors = errors.sections?.[index];
        const has = (f: Field) => cfg.fields.includes(f);
        const label = (f: Field, fallback: string) => cfg.labels?.[f] ?? fallback;

        return (
          <div key={field.id} className="overflow-hidden rounded-xl border border-gold-500/30 bg-white">
            <div className="flex items-center gap-2 bg-ivory-50 px-3 py-2.5">
              <button type="button" onClick={() => toggle(field.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={isOpen}>
                <ChevronIcon className={`h-4 w-4 shrink-0 text-maroon transition ${isOpen ? "rotate-180" : ""}`} />
                <span className="rounded-md bg-maroon px-2 py-0.5 text-[11px] font-semibold text-white">{field.type}</span>
                <span className="min-w-0 truncate text-[13px] text-ink-300" title={cfg.description}>{cfg.description}</span>
              </button>
              <Controller
                control={control}
                name={`${base}.enabled`}
                render={({ field: f }) => (
                  <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[12px] text-ink-500">
                    <input type="checkbox" checked={f.value} onChange={(e) => f.onChange(e.target.checked)} className="h-4 w-4 accent-[#7c1527]" />
                    Visible
                  </label>
                )}
              />
              <button type="button" disabled={index === 0} onClick={() => move(index, index - 1)} aria-label="Move up" className="rounded p-1.5 text-ink-500 hover:bg-white hover:text-maroon disabled:opacity-30">
                <ArrowUpIcon />
              </button>
              <button type="button" disabled={index === fields.length - 1} onClick={() => move(index, index + 1)} aria-label="Move down" className="rounded p-1.5 text-ink-500 hover:bg-white hover:text-maroon disabled:opacity-30">
                <ArrowDownIcon />
              </button>
              <button type="button" onClick={() => remove(index)} aria-label="Remove section" className="rounded p-1.5 text-crimson-500 hover:bg-white">
                <TrashIcon />
              </button>
            </div>

            {isOpen && (
              <div className="space-y-4 border-t border-gold-500/20 p-4">
                {has("eyebrow") && <DivineInput staticLabel label={label("eyebrow", "Small heading")} {...register(`${base}.eyebrow`)} />}
                {has("title") && <DivineInput staticLabel label={label("title", "Title")} {...register(`${base}.title`)} />}
                {has("subtitle") && <DivineInput staticLabel label={label("subtitle", "Subtitle")} {...register(`${base}.subtitle`)} />}
                {has("content") && <DivineTextarea staticLabel label={label("content", "Text")} rows={3} {...register(`${base}.content`)} />}
                {has("primaryLabel") && <DivineInput staticLabel label={label("primaryLabel", "Label")} {...register(`${base}.primaryLabel`)} />}
                {has("secondaryLabel") && <DivineInput staticLabel label={label("secondaryLabel", "Second label")} {...register(`${base}.secondaryLabel`)} />}
                {has("image") && (
                  <Controller
                    control={control}
                    name={`${base}.image`}
                    render={({ field: f }) => (
                      <CmsImageField label={label("image", "Image")} value={f.value} onChange={f.onChange} error={sectionErrors?.image?.message} />
                    )}
                  />
                )}
                {has("primary") && (
                  <div className="grid grid-cols-2 gap-4">
                    <DivineInput staticLabel label={`${label("primary", "Button")} text`} {...register(`${base}.primaryLabel`)} />
                    <DivineInput staticLabel label={`${label("primary", "Button")} link`} error={sectionErrors?.primaryLink?.message} {...register(`${base}.primaryLink`)} />
                  </div>
                )}
                {has("secondary") && (
                  <div className="grid grid-cols-2 gap-4">
                    <DivineInput staticLabel label="Second button text" {...register(`${base}.secondaryLabel`)} />
                    <DivineInput staticLabel label="Second button link" error={sectionErrors?.secondaryLink?.message} {...register(`${base}.secondaryLink`)} />
                  </div>
                )}
                {has("limit") && (
                  <DivineInput staticLabel type="number" min={1} max={60} label={label("limit", "How many to show")} error={sectionErrors?.limit?.message} {...register(`${base}.limit`, { valueAsNumber: true })} />
                )}
                {cfg.itemFields && <SectionItems sectionIndex={index} cfg={cfg} control={control} register={register} itemErrors={sectionErrors?.items as unknown as ItemErrors} />}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Validation messages for one section's items, indexed like the items themselves. */
type ItemErrors = ({ link?: { message?: string } } | undefined)[];

function SectionItems({
  sectionIndex,
  cfg,
  control,
  register,
  itemErrors,
}: {
  sectionIndex: number;
  cfg: TypeConfig;
  control: Control<SectionsForm>;
  register: UseFormRegister<SectionsForm>;
  itemErrors?: ItemErrors;
}) {
  const { fields, append, remove, move } = useFieldArray({ control, name: `sections.${sectionIndex}.items` });
  const listId = `contact-labels-${sectionIndex}`;

  return (
    <div className="space-y-3 rounded-xl bg-ivory-50 p-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold text-maroon">
          {cfg.itemsLabel}
          {cfg.maxItems ? <span className="ml-1.5 font-normal text-ink-500">({fields.length} of {cfg.maxItems})</span> : null}
        </p>
        <button
          type="button"
          disabled={Boolean(cfg.maxItems) && fields.length >= (cfg.maxItems ?? Infinity)}
          onClick={() => append({ ...EMPTY_ITEM })}
          title={cfg.maxItems && fields.length >= cfg.maxItems ? `Maximum ${cfg.maxItems} reached` : undefined}
          className="inline-flex items-center gap-1 rounded-md border border-maroon/30 px-2.5 py-1 text-[12px] font-semibold text-maroon hover:bg-maroon hover:text-white disabled:pointer-events-none disabled:opacity-40"
        >
          <PlusIcon /> Add
        </button>
      </div>
      {cfg.itemFields?.some((f) => f.suggestions) && (
        <datalist id={listId}>
          {CONTACT_LABELS.map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
      )}
      {fields.length === 0 && <p className="text-[12.5px] text-ink-500">Nothing added yet.</p>}
      {fields.map((item, i) => (
        <div key={item.id} className="rounded-lg border border-gold-500/25 bg-white p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {cfg.itemFields!.map((f) =>
              f.image ? (
                <div key={f.key} className="sm:col-span-2">
                  <Controller
                    control={control}
                    name={`sections.${sectionIndex}.items.${i}.image`}
                    render={({ field: img }) => <CmsImageField label={f.label} value={img.value ?? ""} onChange={img.onChange} hint="Shown in full, never cropped. Wide artwork works best — JPG, PNG or WebP, up to 1 MB." />}
                  />
                </div>
              ) : f.multiline ? (
                <div key={f.key} className="sm:col-span-2">
                  <DivineTextarea staticLabel label={f.label} rows={2} {...register(`sections.${sectionIndex}.items.${i}.${f.key}`)} />
                </div>
              ) : (
                <DivineInput
                  key={f.key}
                  staticLabel
                  label={f.label}
                  list={f.suggestions ? listId : undefined}
                  error={f.key === "link" ? itemErrors?.[i]?.link?.message : undefined}
                  {...register(`sections.${sectionIndex}.items.${i}.${f.key}`)}
                />
              )
            )}
          </div>
          <div className="mt-2 flex justify-end gap-1">
            <button type="button" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label="Move up" className="rounded p-1.5 text-ink-500 hover:text-maroon disabled:opacity-30">
              <ArrowUpIcon />
            </button>
            <button type="button" disabled={i === fields.length - 1} onClick={() => move(i, i + 1)} aria-label="Move down" className="rounded p-1.5 text-ink-500 hover:text-maroon disabled:opacity-30">
              <ArrowDownIcon />
            </button>
            <button type="button" onClick={() => remove(i)} aria-label="Remove" className="rounded p-1.5 text-crimson-500">
              <TrashIcon />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
