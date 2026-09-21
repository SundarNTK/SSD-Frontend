"use client";

import { useRef, useState } from "react";
import { FORM_CONTROL_SHELL, FORM_LABEL } from "../divine/formFieldStyles";

type Props = {
  label: string;
  value: string;
  onChange: (html: string) => void;
  rows?: number;
  hint?: string;
  error?: string;
};

type Action = { label: string; title: string; before: string; after: string; block?: boolean };

const ACTIONS: Action[] = [
  { label: "B", title: "Bold", before: "<strong>", after: "</strong>" },
  { label: "I", title: "Italic", before: "<em>", after: "</em>" },
  { label: "H2", title: "Heading", before: "<h2>", after: "</h2>", block: true },
  { label: "H3", title: "Sub-heading", before: "<h3>", after: "</h3>", block: true },
  { label: "• List", title: "Bullet list", before: "<ul>\n  <li>", after: "</li>\n</ul>", block: true },
  { label: "1. List", title: "Numbered list", before: "<ol>\n  <li>", after: "</li>\n</ol>", block: true },
  { label: "Quote", title: "Quote", before: "<blockquote>", after: "</blockquote>", block: true },
  { label: "Line", title: "Horizontal line", before: "<hr>", after: "", block: true },
];

// Page CSS doesn't reach an iframe, so the preview carries the portal's prose look itself.
const PREVIEW_STYLE = `body{font:16px/1.75 Inter,system-ui,sans-serif;color:#4a3b26;margin:16px}h2,h3,h4{color:#7c1527;line-height:1.2}h2{font-size:1.7rem}h3{font-size:1.3rem}a{color:#c2410c}img{max-width:100%;border-radius:10px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ead9b0;padding:.5em .8em;text-align:left}th{background:#f5ecd6;color:#7c1527}blockquote{border-left:3px solid #d4af37;margin:0;padding-left:1em;color:#7d6c4d;font-style:italic}ul{list-style:disc}ol{list-style:decimal}`;

/**
 * A small HTML editor for page content: a formatting toolbar that wraps the
 * selected text in the right tags, plus a Preview tab. Deliberately light — no
 * editor library — because the server sanitises whatever is saved anyway (see
 * SSD-Backend controllers/cms/sanitize-content.js), so the toolbar only has to
 * make the common tags one click instead of hand-typed.
 */
export default function CmsHtmlEditor({ label, value, onChange, rows = 12, hint, error }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [tab, setTab] = useState<"write" | "preview">("write");

  function apply(action: Action) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end);
    const lead = action.block && start > 0 && value[start - 1] !== "\n" ? "\n" : "";
    const inserted = `${lead}${action.before}${selected}${action.after}`;
    onChange(value.slice(0, start) + inserted + value.slice(end));
    // Put the cursor inside the new tags (or after them when nothing was selected).
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + lead.length + action.before.length + selected.length;
      el.setSelectionRange(pos, pos);
    });
  }

  function addLink() {
    const url = window.prompt("Link address (https://…)");
    if (!url) return;
    apply({ label: "", title: "", before: `<a href="${url.replace(/"/g, "&quot;")}">`, after: "</a>" });
  }

  return (
    <div className="w-full">
      <span className={FORM_LABEL}>{label}</span>
      <div className={`${FORM_CONTROL_SHELL} overflow-hidden ${error ? "!border-crimson-500" : ""}`}>
        <div className="flex flex-wrap items-center gap-1 border-b border-[#f0b4a0]/60 bg-ivory-50 px-2 py-1.5">
          {tab === "write" &&
            ACTIONS.map((a) => (
              <button key={a.label} type="button" title={a.title} onClick={() => apply(a)} className="rounded px-2 py-1 text-[12.5px] font-semibold text-maroon transition hover:bg-white">
                {a.label}
              </button>
            ))}
          {tab === "write" && (
            <button type="button" title="Link" onClick={addLink} className="rounded px-2 py-1 text-[12.5px] font-semibold text-maroon transition hover:bg-white">
              Link
            </button>
          )}
          <div className="ml-auto flex overflow-hidden rounded-md border border-[#f0b4a0]/70 text-[12px] font-semibold">
            {(["write", "preview"] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTab(t)} className={`px-3 py-1 capitalize transition ${tab === t ? "bg-maroon text-white" : "bg-white text-ink-300 hover:text-maroon"}`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {tab === "write" ? (
          <textarea
            ref={ref}
            value={value}
            rows={rows}
            onChange={(e) => onChange(e.target.value)}
            spellCheck
            className="block w-full resize-y bg-white px-3.5 py-3 font-mono text-[13px] leading-6 text-ink-100 outline-none"
          />
        ) : (
          // Sandboxed with no permissions: nothing typed here can run script in the admin session.
          <iframe title="Preview" sandbox="" srcDoc={`<style>${PREVIEW_STYLE}</style>${value || "<p style='color:#999'>Nothing to preview yet.</p>"}`} className="block w-full bg-white" style={{ height: `${Math.max(rows, 8) * 24 + 24}px` }} />
        )}
      </div>
      {hint && !error && <p className="mt-1 text-[11.5px] text-ink-500">{hint}</p>}
      {error && <p className="mt-1 text-[12px] text-crimson-500">{error}</p>}
    </div>
  );
}
