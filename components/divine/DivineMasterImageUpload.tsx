"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { resolveImageUrl } from "../../lib/imageUrl";
import { FORM_LABEL } from "./formFieldStyles";

type DivineMasterImageUploadProps = {
  label: string;
  /** Existing image URL from the server, or null/undefined if none is set. */
  value?: string | null;
  onChange: (file: File | null) => void;
  hint?: string;
  error?: string;
};

const MAX_BYTES = 100 * 1024;
const ACCEPTED = "image/jpeg,image/png,image/webp";

/**
 * The single-image counterpart to Hall Master's gallery cards — same
 * bordered white card, same square `rounded-lg` thumbnail (matching
 * DataTable's MasterImageCell, not a circular avatar crop), same
 * Choose/Replace button and caption placement, and a delete button that
 * actually clears an already-saved image, not just a locally-picked one.
 *
 * `onChange(null)` fires only from the explicit delete button — a
 * cancelled file-picker dialog never fires a change event at all — so the
 * caller can treat it as an unambiguous "remove this image" signal. Every
 * master using this component passes that straight to
 * `withOptionalImage()`'s `imageRemoved` flag so the removal is actually
 * persisted server-side (see SSD-Backend's `makeImageUpload`, which reads
 * a matching `existing<Field>` value the request carries alongside it).
 */
export default function DivineMasterImageUpload({ label, value, onChange, hint, error }: DivineMasterImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);

  const existing = resolveImageUrl(value);
  const shown = preview ?? existing;

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  useEffect(() => {
    if (!viewing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setViewing(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [viewing]);

  function handleFile(file: File | null) {
    setLocalError(null);
    if (preview) URL.revokeObjectURL(preview);

    if (!file) {
      setPreview(null);
      onChange(null);
      return;
    }
    if (file.size > MAX_BYTES) {
      setLocalError("Image must be 100 KB or smaller.");
      setPreview(null);
      onChange(null);
      return;
    }

    setPreview(URL.createObjectURL(file));
    onChange(file);
  }

  function remove() {
    handleFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="w-full">
      <p className={FORM_LABEL}>{label}</p>
      <div className="rounded-xl border border-gold-500/20 bg-white p-3">
        <div className="flex flex-wrap gap-2">
          {shown ? (
            <span className="relative">
              <img
                src={shown}
                alt=""
                onClick={() => setViewing(true)}
                className="h-16 w-16 cursor-pointer rounded-lg border border-gold-500/25 object-cover"
              />
              <button
                type="button"
                onClick={remove}
                aria-label="Remove image"
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-crimson-600 text-white"
              >
                ×
              </button>
            </span>
          ) : (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gold-500/25 bg-navy-900">
              <svg className="h-7 w-7 text-ink-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 16l4.5-5 3.5 4 3-3.5L20 16" strokeLinecap="round" strokeLinejoin="round" />
                <rect x="3" y="4" width="18" height="16" rx="2" />
              </svg>
            </span>
          )}
        </div>
        <label className="mt-3 inline-flex cursor-pointer items-center rounded-lg border border-gold-500/30 px-3 py-1.5 text-[12.5px] text-amber-600 transition-colors hover:border-gold-400/60 hover:bg-gold-500/5">
          {shown ? "Replace Image" : "Choose Image"}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED}
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <p className="mt-1.5 text-[11.5px] text-ink-500">{hint ?? "Single file · JPG, PNG or WebP · up to 100 KB"}</p>
      </div>

      {(localError || error) && <p className="mt-1.5 pl-1 text-[12.5px] text-crimson-500">{localError || error}</p>}

      {createPortal(
        <AnimatePresence>
          {viewing && shown && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setViewing(false)}
                className="fixed inset-0 z-[80] bg-navy-950/85 backdrop-blur-sm"
              />
              <div className="pointer-events-none fixed inset-0 z-[81] flex items-center justify-center p-6">
                <motion.div
                  role="dialog"
                  aria-modal="true"
                  initial={{ opacity: 0, y: 12, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 12, scale: 0.97 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="pointer-events-auto relative max-h-[85vh] max-w-[85vw] overflow-hidden rounded-2xl border border-gold-500/25 bg-navy-900 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.85)]"
                >
                  <button
                    type="button"
                    onClick={() => setViewing(false)}
                    aria-label="Close"
                    className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg bg-crimson-600 text-white shadow-[0_2px_8px_-2px_rgba(0,0,0,0.45)] transition-colors hover:bg-crimson-500"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                    </svg>
                  </button>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={shown} alt="" className="max-h-[85vh] max-w-[85vw] object-contain" />
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
