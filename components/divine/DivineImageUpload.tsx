"use client";

import { useEffect, useRef, useState } from "react";
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

  const existing = resolveImageUrl(value);
  const shown = preview ?? existing;

  // Object URLs are leaked unless explicitly revoked when they're replaced.
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

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
      <p className="mb-2 text-[11px] uppercase tracking-wide text-amber-600">{label}</p>

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
    </div>
  );
}
