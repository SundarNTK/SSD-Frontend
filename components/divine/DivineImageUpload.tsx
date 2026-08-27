"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { resolveImageUrl } from "../../lib/imageUrl";

type DivineImageUploadProps = {
  label: string;
  /** Existing image path from the server, e.g. "/uploads/avatars/ab12.jpg". */
  value?: string | null;
  onChange: (file: File | null) => void;
  hint?: string;
  error?: string;
};

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED = "image/jpeg,image/png,image/webp";

/**
 * Avatar picker with a local preview.
 *
 * The chosen File is handed to the parent rather than uploaded here, so the
 * image and the rest of the form are submitted as one multipart request.
 * Uploading on selection would leave orphaned files on disk every time
 * someone picks a photo and then abandons the form.
 */
export default function DivineImageUpload({ label, value, onChange, hint, error }: DivineImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [viewing, setViewing] = useState(false);

  const existing = resolveImageUrl(value);
  const shown = preview ?? existing;

  // Object URLs are leaked unless explicitly revoked when they're replaced.
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
      setLocalError("Image must be 2 MB or smaller.");
      setPreview(null);
      onChange(null);
      return;
    }

    setPreview(URL.createObjectURL(file));
    onChange(file);
  }

  return (
    <div className="w-full">
      <p className="mb-2 text-[11px] uppercase tracking-wide text-gray-700">{label}</p>

      <div className="flex items-center gap-4 rounded-xl border border-gold-500/20 bg-white p-3">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-gold-500/25 bg-navy-900">
          {shown ? (
            <img src={shown} alt="" className="h-full w-full object-cover" />
          ) : (
            <svg className="h-7 w-7 text-ink-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="8" r="3.5" />
              <path d="M4.5 19.5c1.4-3.5 4.3-5.5 7.5-5.5s6.1 2 7.5 5.5" strokeLinecap="round" />
            </svg>
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            {shown && (
              <button
                type="button"
                onClick={() => setViewing(true)}
                className="rounded-lg border border-gold-500/30 px-3 py-1.5 text-[12.5px] text-amber-600 transition-colors hover:border-gold-400/60 hover:bg-gold-500/5"
              >
                View
              </button>
            )}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-lg border border-gold-500/30 px-3 py-1.5 text-[12.5px] text-amber-600 transition-colors hover:border-gold-400/60 hover:bg-gold-500/5"
            >
              {shown ? "Change photo" : "Choose photo"}
            </button>
            {shown && (
              <button
                type="button"
                onClick={() => {
                  handleFile(null);
                  if (inputRef.current) inputRef.current.value = "";
                }}
                className="rounded-lg px-2.5 py-1.5 text-[12.5px] text-ink-500 transition-colors hover:text-crimson-500"
              >
                Remove
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[11.5px] text-ink-500">{hint ?? "JPG, PNG or WebP · up to 2 MB"}</p>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
      </div>

      {(localError || error) && (
        <p className="mt-1.5 pl-1 text-[12.5px] text-crimson-500">{localError || error}</p>
      )}

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
