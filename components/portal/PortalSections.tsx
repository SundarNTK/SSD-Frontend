"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import type { PortalRecord, PortalSection } from "../../lib/portalApi";
import { dateTile, formatDateRange } from "../../lib/portalDates";
import { EVENT_FALLBACKS } from "../../lib/portalTheme";
import BookButton from "./BookButton";
import BannerSlider from "./BannerSlider";
import PortalPager from "./PortalPager";
import { ArrowRightIcon, CalendarIcon, CubeIcon, SearchIcon, SparkleIcon, TempleIcon } from "./PortalIcons";

/**
 * Renders a CMS page's sections in the order the administrator arranged them
 * (CMS Page master -> Sections). Every visible section is filled live from its
 * master — Events (banner + list), Services, Items — so the CMS only holds
 * each section's heading and how many records to show; the records and their
 * images come from the Event, Service and Item masters.
 *
 * A Client Component only because of the scroll-driven motion. It is still
 * server-rendered for the first paint, and all data arrives as props.
 */

const EASE = [0.16, 1, 0.3, 1] as const;
type Tone = "cream" | "white";
const TONE_BG: Record<Tone, string> = { cream: "bg-ivory-50", white: "bg-white" };
const TONE_FILL: Record<Tone, string> = { cream: "#fbf6ea", white: "#ffffff" };

export default function PortalSections({ sections }: { sections: PortalSection[] }) {
  // Cream/white bands alternate over the sections that are bands, so reordering
  // in the CMS never leaves two identical neighbours. Each band also learns the
  // tone above it, to draw its wavy top edge in that colour. Worked out up front
  // in a plain loop so the render below stays a pure map.
  const plan: { tone: Tone; from: Tone | null }[] = [];
  let bands = 0;
  let previous: Tone | null = null;
  for (const section of sections) {
    if (section.type === "Banner") {
      // The banner draws its own wavy edge, which lands on cream.
      plan.push({ tone: "cream", from: null });
      previous = "cream";
      bands = 1;
    } else {
      const tone: Tone = bands++ % 2 === 0 ? "cream" : "white";
      plan.push({ tone, from: previous === tone ? null : previous });
      previous = tone;
    }
  }
  return (
    <>
      {sections.map((section, i) => (
        <SectionBlock key={i} section={section} tone={plan[i].tone} from={plan[i].from} />
      ))}
    </>
  );
}

function SectionBlock({ section, tone, from }: { section: PortalSection; tone: Tone; from: Tone | null }) {
  switch (section.type) {
    case "Banner":
      return <BannerSlider slides={section.slides ?? []} headline={section.title} />;
    case "Events":
      return <Events s={section} tone={tone} from={from} />;
    case "Services":
      return <Services s={section} tone={tone} from={from} />;
    case "Items":
      return <Items s={section} tone={tone} from={from} />;
    default:
      return null;
  }
}

// ---------- shared pieces ----------

/** A section band: alternating background, a wavy top edge, and two gold orbs that drift at their own speed as you scroll past. */
function Band({ tone, from, id, children }: { tone: Tone; from: Tone | null; id?: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const orbA = useTransform(scrollYProgress, [0, 1], [70, -70]);
  const orbB = useTransform(scrollYProgress, [0, 1], [-50, 90]);

  return (
    <section ref={ref} id={id} className={`relative scroll-mt-20 overflow-hidden ${TONE_BG[tone]} py-16 sm:py-20`}>
      <motion.span style={{ y: orbA }} className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-gold-300/25 blur-3xl" aria-hidden="true" />
      <motion.span style={{ y: orbB }} className="pointer-events-none absolute -right-20 bottom-4 h-80 w-80 rounded-full bg-crimson-500/8 blur-3xl" aria-hidden="true" />
      {from && (
        <svg className="pointer-events-none absolute inset-x-0 top-0 h-6 w-full sm:h-9" viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 0H1440V14C1260 54 1080 4 900 22S560 58 360 26 120 0 0 30Z" fill={TONE_FILL[from]} />
        </svg>
      )}
      <div className="relative mx-auto max-w-6xl px-4">{children}</div>
    </section>
  );
}

/** Heading whose words rise out of a mask one after another, then a gold rule draws itself beneath. */
function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  if (!title && !subtitle) return null;
  const words = title.split(" ");
  return (
    <div className="mb-12 text-center">
      {title && (
        // The heading itself is what scrolls into view; its words follow through
        // variants. (Observing each word directly wouldn't work — a word parked
        // below its mask is clipped away entirely, so it never counts as visible.)
        <motion.h2
          className="font-portal text-[34px] font-bold leading-tight text-maroon sm:text-[44px]"
          aria-label={title}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.09 } } }}
        >
          {words.map((w, i) => (
            <span key={i} className="inline-block overflow-hidden pb-1 align-bottom" aria-hidden="true">
              <motion.span className="inline-block" variants={{ hidden: { y: "110%" }, visible: { y: 0, transition: { duration: 0.7, ease: EASE } } }}>
                {w}
                {i < words.length - 1 ? " " : ""}
              </motion.span>
            </span>
          ))}
        </motion.h2>
      )}
      <motion.div
        initial={{ scaleX: 0, opacity: 0 }}
        whileInView={{ scaleX: 1, opacity: 1 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.8, delay: 0.25, ease: EASE }}
        className="mx-auto mt-3 flex w-36 items-center gap-2"
        aria-hidden="true"
      >
        <span className="h-px flex-1 bg-gradient-to-r from-transparent to-gold-500" />
        <motion.span animate={{ rotate: [45, 225, 45] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }} className="h-2 w-2 bg-gold-500" />
        <span className="h-px flex-1 bg-gradient-to-l from-transparent to-gold-500" />
      </motion.div>
      {subtitle && (
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, delay: 0.35 }}
          className="mx-auto mt-4 max-w-xl text-[15px] text-ink-500"
        >
          {subtitle}
        </motion.p>
      )}
    </div>
  );
}

const money = (n: number) => `$${n.toFixed(2)}`;

/** A record's photo from its master, or a themed placeholder when it has none. */
function RecordImage({ r, className, icon }: { r: PortalRecord; className: string; icon: ReactNode }) {
  if (r.image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={r.image} alt={r.name} loading="lazy" className={`${className} object-cover`} />;
  }
  return <div className={`${className} flex items-center justify-center bg-gradient-to-br from-[#fbf1cf] to-[#f1dfae] text-amber-600`}>{icon}</div>;
}

// ---------- paged card grid ----------

const cardVariants = {
  hidden: { opacity: 0, y: 40, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.6, ease: EASE } },
};

/**
 * A grid that shows `pageSize` cards at a time (3 per row on a wide screen, so
 * the default 9 is three full rows) with a pager underneath. Changing page
 * brings the new cards in one after another and scrolls back to the top of the
 * section, so the visitor never lands mid-list.
 */
function PagedGrid({
  id,
  records,
  pageSize,
  noun,
  gridClass,
  renderCard,
}: {
  id: string;
  records: PortalRecord[];
  pageSize: number;
  noun: string;
  gridClass: string;
  renderCard: (r: PortalRecord, index: number) => ReactNode;
}) {
  const [page, setPage] = useState(1);
  const size = Math.max(1, pageSize);
  const pageCount = Math.max(1, Math.ceil(records.length / size));
  const current = Math.min(page, pageCount);
  const slice = records.slice((current - 1) * size, current * size);

  function go(next: number) {
    setPage(next);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      {/* Keyed by page, so turning the page remounts the grid and its cards enter afresh. */}
      <motion.div
        key={current}
        className={gridClass}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-40px" }}
        variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.07 } } }}
      >
        {slice.map((r, i) => renderCard(r, (current - 1) * size + i))}
      </motion.div>
      <PortalPager page={current} pageCount={pageCount} total={records.length} pageSize={size} onChange={go} noun={noun} />
    </>
  );
}

// ---------- Events ----------

function Events({ s, tone, from }: { s: PortalSection; tone: Tone; from: Tone | null }) {
  const records = s.records ?? [];
  if (records.length === 0) return null;
  return (
    <Band tone={tone} from={from} id="events">
      <SectionHeading title={s.title} subtitle={s.subtitle} />
      <PagedGrid
        id="events"
        records={records}
        pageSize={s.limit || 9}
        noun="events"
        gridClass="grid gap-7 sm:grid-cols-2 lg:grid-cols-3"
        renderCard={(r, i) => <EventCard key={r.id} r={r} index={i} />}
      />
    </Band>
  );
}

/**
 * A poster-style card: the event's slider image fills the card (a themed
 * backdrop when it has none) with the date, name and Book button laid over a
 * soft gradient. The only hover motion is a gentle lift and a slow image zoom.
 */
function EventCard({ r, index }: { r: PortalRecord; index: number }) {
  const tile = dateTile(r.startDate);
  return (
    <motion.article
      variants={cardVariants}
      className="group relative isolate flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-[28px] bg-[#1a0509] shadow-[0_20px_44px_-24px_rgba(58,20,8,0.7)] ring-1 ring-black/5 transition-[translate,box-shadow] duration-300 hover:-translate-y-1.5 hover:shadow-[0_30px_56px_-24px_rgba(124,21,39,0.7)]"
    >
      {r.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={r.image} alt="" loading="lazy" className="absolute inset-0 -z-20 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
      ) : (
        <div className={`absolute inset-0 -z-20 bg-gradient-to-br ${EVENT_FALLBACKS[index % EVENT_FALLBACKS.length]}`}>
          <svg className="absolute -right-16 -top-16 h-72 w-72 text-gold-300/20" viewBox="0 0 100 100" fill="none" aria-hidden="true">
            <circle cx="50" cy="50" r="46" stroke="currentColor" strokeWidth="0.6" strokeDasharray="1 2.5" />
            <circle cx="50" cy="50" r="34" stroke="currentColor" strokeWidth="0.6" />
            <circle cx="50" cy="50" r="22" stroke="currentColor" strokeWidth="0.6" strokeDasharray="2 3" />
          </svg>
        </div>
      )}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/35 to-black/5" aria-hidden="true" />

      <div className="absolute inset-x-4 top-4 flex items-start justify-between">
        <span className="flex flex-col items-center rounded-xl bg-white px-3 py-1.5 text-center leading-none text-maroon shadow-lg">
          <span className="font-portal text-[22px] font-bold">{tile.day}</span>
          <span className="mt-0.5 text-[10px] font-bold tracking-widest">{tile.month}</span>
        </span>
        {r.price > 0 && <span className="rounded-full bg-white/90 px-3 py-1 font-portal text-[16px] font-bold text-maroon shadow-md backdrop-blur">{money(r.price)}</span>}
      </div>

      <div className="p-6 text-white">
        <p className="inline-flex items-center gap-1.5 rounded-full border border-white/35 bg-white/15 px-3 py-1 text-[12px] font-medium backdrop-blur-md">
          <CalendarIcon className="h-3.5 w-3.5 text-gold-300" />
          {formatDateRange(r.startDate, r.endDate)}
        </p>
        <h3 className="mt-3 font-portal text-[25px] font-bold leading-tight drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]">{r.name}</h3>
        {r.tamilName && <p className="mt-0.5 text-[14px] text-gold-200">{r.tamilName}</p>}
        {r.description && <p className="mt-2 line-clamp-2 text-[13.5px] leading-6 text-white/85">{r.description}</p>}
        <div className="mt-4 flex items-center justify-between">
          <span className="text-[12.5px] font-semibold text-gold-200">{r.price > 0 ? "Ticketed event" : "Open to all"}</span>
          <BookButton onDark returnTo="/customer#events" />
        </div>
      </div>
    </motion.article>
  );
}

// ---------- Services ----------

function Services({ s, tone, from }: { s: PortalSection; tone: Tone; from: Tone | null }) {
  const records = s.records ?? [];
  if (records.length === 0) return null;
  return (
    <Band tone={tone} from={from} id="services">
      <SectionHeading title={s.title} subtitle={s.subtitle} />
      <PagedGrid
        id="services"
        records={records}
        pageSize={s.limit || 9}
        noun="services"
        gridClass="grid gap-7 sm:grid-cols-2 lg:grid-cols-3"
        renderCard={(r) => <ServiceCard key={r.id} r={r} />}
      />
    </Band>
  );
}

function ServiceCard({ r }: { r: PortalRecord }) {
  return (
    <motion.article
      variants={cardVariants}
      className="group relative flex flex-col overflow-hidden rounded-3xl border border-gold-500/25 bg-white shadow-[0_14px_36px_-24px_rgba(58,20,8,0.5)] transition-[translate,box-shadow] duration-300 hover:-translate-y-1.5 hover:shadow-[0_30px_56px_-26px_rgba(124,21,39,0.5)]"
    >
      <div className="relative h-48 overflow-hidden">
        <RecordImage r={r} className="h-full w-full transition duration-700 group-hover:scale-105" icon={<TempleIcon className="h-14 w-14" />} />
        <span className="absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent opacity-70" aria-hidden="true" />
        <span className="absolute right-3 top-3 rounded-full bg-white/90 px-3 py-1 font-portal text-[18px] font-bold text-maroon shadow-md backdrop-blur">{money(r.price)}</span>
      </div>
      <div className="flex flex-1 flex-col p-6">
        <h3 className="font-portal text-[24px] font-bold leading-tight text-ink-100">{r.name}</h3>
        {r.tamilName && <p className="mt-0.5 text-[13.5px] text-amber-700">{r.tamilName}</p>}
        {r.description && <p className="mt-3 line-clamp-2 text-[13.5px] leading-6 text-ink-500">{r.description}</p>}
        <div className="mt-auto flex items-center justify-between pt-5">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-wide text-ink-500">
            <SparkleIcon className="h-3.5 w-3.5 text-gold-500" /> Per booking
          </span>
          <BookButton returnTo="/customer#services" />
        </div>
      </div>
    </motion.article>
  );
}

// ---------- Items (searchable, scrollable) ----------

function Items({ s, tone, from }: { s: PortalSection; tone: Tone; from: Tone | null }) {
  const records = s.records ?? [];
  if (records.length === 0) return null;
  return (
    <Band tone={tone} from={from} id="items">
      <SectionHeading title={s.title} subtitle={s.subtitle} />
      <ItemsBrowser records={records} />
    </Band>
  );
}

/**
 * Every item sits on one row the visitor scrolls themselves — with arrows, a
 * swipe or the scrollbar — and stops on exact cards (scroll-snap), so nothing
 * slides away from under the cursor the way an endless auto-scroll does. A
 * search box narrows the row to matching names, in English or Tamil.
 */
function ItemsBrowser({ records }: { records: PortalRecord[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [edges, setEdges] = useState({ start: true, end: false });

  const q = query.trim().toLowerCase();
  const shown = q ? records.filter((r) => r.name.toLowerCase().includes(q) || r.tamilName.toLowerCase().includes(q)) : records;

  const syncEdges = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  // ResizeObserver reports the initial size too, so the arrows are right on first
  // paint and again whenever the row's width or its content changes.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(syncEdges);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [syncEdges, shown.length]);

  const scrollBy = (dir: 1 | -1) => scroller.current?.scrollBy({ left: dir * scroller.current.clientWidth * 0.85, behavior: "smooth" });

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <label className="relative block w-full max-w-sm">
          <span className="sr-only">Search items</span>
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              scroller.current?.scrollTo({ left: 0 });
            }}
            placeholder="Find an item…"
            className="w-full rounded-full border border-gold-500/40 bg-white py-2.5 pl-10 pr-4 text-[14px] text-ink-100 shadow-sm outline-none transition placeholder:text-ink-500/70 focus:border-maroon/60 focus:ring-2 focus:ring-maroon/15"
          />
        </label>
        <div className="flex items-center gap-3">
          <p className="text-[13px] text-ink-500" aria-live="polite">
            {q ? `${shown.length} of ${records.length} items` : `${records.length} items`}
          </p>
          <div className="flex gap-2">
            <button onClick={() => scrollBy(-1)} disabled={edges.start} aria-label="Scroll items left" className="flex h-10 w-10 items-center justify-center rounded-full border border-maroon/30 bg-white text-maroon transition hover:bg-maroon hover:text-white disabled:pointer-events-none disabled:opacity-35">
              <ArrowRightIcon className="h-4 w-4 rotate-180" />
            </button>
            <button onClick={() => scrollBy(1)} disabled={edges.end} aria-label="Scroll items right" className="flex h-10 w-10 items-center justify-center rounded-full border border-maroon/30 bg-white text-maroon transition hover:bg-maroon hover:text-white disabled:pointer-events-none disabled:opacity-35">
              <ArrowRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gold-500/40 bg-white/70 px-6 py-12 text-center text-[14px] text-ink-500">No items match &ldquo;{query}&rdquo;.</p>
      ) : (
        <div className="relative">
          <div
            ref={scroller}
            onScroll={syncEdges}
            tabIndex={0}
            role="region"
            aria-label="Items — scroll sideways to browse"
            className="portal-scroll flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth pb-5 pt-1 outline-none focus-visible:ring-2 focus-visible:ring-maroon/30"
          >
            {shown.map((r) => (
              <div key={r.id} className="w-[220px] shrink-0 snap-start">
                <ItemCard r={r} />
              </div>
            ))}
          </div>
          <span className={`pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-ivory-50/90 to-transparent transition-opacity ${edges.start ? "opacity-0" : "opacity-100"}`} aria-hidden="true" />
          <span className={`pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-ivory-50/90 to-transparent transition-opacity ${edges.end ? "opacity-0" : "opacity-100"}`} aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

function ItemCard({ r }: { r: PortalRecord }) {
  return (
    <article className="group flex h-full flex-col items-center rounded-3xl border border-gold-500/25 bg-white p-5 text-center shadow-[0_12px_30px_-22px_rgba(58,20,8,0.5)] transition duration-300 hover:-translate-y-1.5 hover:shadow-[0_26px_44px_-24px_rgba(124,21,39,0.5)]">
      <RecordImage r={r} className="h-24 w-24 rounded-full border-4 border-white shadow-md ring-1 ring-gold-500/30" icon={<CubeIcon className="h-9 w-9" />} />
      <h3 className="mt-3 text-[14.5px] font-semibold leading-snug text-ink-100">{r.name}</h3>
      {r.tamilName && <p className="text-[12.5px] text-amber-700">{r.tamilName}</p>}
      <div className="mt-3 flex w-full items-center justify-between">
        <span className="font-portal text-[20px] font-bold text-maroon">{money(r.price)}</span>
        <BookButton compact returnTo="/customer#items" />
      </div>
    </article>
  );
}
