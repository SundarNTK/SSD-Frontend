"use client";

import { ArrowRightIcon } from "./PortalIcons";

type Props = {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
  /** Noun for the summary line, e.g. "events". */
  noun: string;
};

/** 1 … 4 5 [6] 7 8 … 20 — always the first, last and a window around the current page. */
function pageWindow(page: number, count: number): (number | "gap")[] {
  const wanted = new Set([1, count, page - 1, page, page + 1]);
  const pages = [...wanted].filter((p) => p >= 1 && p <= count).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  pages.forEach((p, i) => {
    if (i > 0 && p - pages[i - 1] > 1) out.push("gap");
    out.push(p);
  });
  return out;
}

/** Numbered pager with prev/next and a "Showing 1–9 of 24 events" line. Renders nothing when everything fits on one page. */
export default function PortalPager({ page, pageCount, total, pageSize, onChange, noun }: Props) {
  if (pageCount <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const btn = "flex h-10 min-w-10 items-center justify-center rounded-xl px-3 text-[14px] font-semibold transition";

  return (
    <nav aria-label={`${noun} pages`} className="mt-12 flex flex-col items-center gap-4">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button onClick={() => onChange(page - 1)} disabled={page === 1} aria-label="Previous page" className={`${btn} border border-maroon/25 text-maroon hover:bg-maroon hover:text-white disabled:pointer-events-none disabled:opacity-35`}>
          <ArrowRightIcon className="h-4 w-4 rotate-180" />
        </button>
        {pageWindow(page, pageCount).map((p, i) =>
          p === "gap" ? (
            <span key={`gap-${i}`} className="px-1 text-ink-500" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p)}
              aria-label={`Page ${p}`}
              aria-current={p === page ? "page" : undefined}
              className={`${btn} ${p === page ? "bg-gradient-to-b from-[#9b1c33] to-maroon text-white shadow-[0_10px_20px_-10px_rgba(124,21,39,0.9)]" : "border border-gold-500/30 bg-white text-ink-300 hover:border-maroon/40 hover:text-maroon"}`}
            >
              {p}
            </button>
          )
        )}
        <button onClick={() => onChange(page + 1)} disabled={page === pageCount} aria-label="Next page" className={`${btn} border border-maroon/25 text-maroon hover:bg-maroon hover:text-white disabled:pointer-events-none disabled:opacity-35`}>
          <ArrowRightIcon className="h-4 w-4" />
        </button>
      </div>
      <p className="text-[13px] text-ink-500">
        Showing <strong className="text-ink-300">{from}–{to}</strong> of <strong className="text-ink-300">{total}</strong> {noun}
      </p>
    </nav>
  );
}
