"use client";

import { useRef, useState } from "react";
import { api, extractErrorMessage, unwrap, type ApiEnvelope } from "../../lib/api";
import { toast } from "../../lib/toastStore";
import { TrashIcon } from "../divine/icons";
import { FORM_LABEL } from "../divine/formFieldStyles";

const MAX_BYTES = 1024 * 1024; // matches the backend's CMS upload cap
const ACCEPT = "image/jpeg,image/png,image/webp";

type Props = {
  label: string;
  /** The stored URL — an uploaded (Cloudinary) address, or a site path such as /logo.webp. */
  value: string;
  onChange: (url: string) => void;
  hint?: string;
  error?: string;
};

/**
 * Upload-and-preview for any CMS image (page banner, site logo, section
 * photo). The file goes to POST /cms/upload right away and the returned URL is
 * what the surrounding form keeps — so it works inside nested section lists
 * without any multipart form — and Remove simply clears the URL.
 */
export default function CmsImageField({ label, value, onChange, hint, error }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!ACCEPT.split(",").includes(file.type)) return toast.error("Image must be a JPG, PNG or WebP file.");
    if (file.size > MAX_BYTES) return toast.error("Image must be 1 MB or smaller.");

    setUploading(true);
    try {
      const body = new FormData();
      body.append("image", file);
      const res = await api.post<ApiEnvelope<{ url: string }>>("/cms/upload", body);
      onChange(unwrap(res).url);
      toast.created("Image uploaded.");
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="w-full">
      <span className={FORM_LABEL}>{label}</span>
      <div className={`flex items-center gap-4 rounded-lg border bg-white p-3 ${error ? "border-crimson-500" : "border-[#f0b4a0]"}`}>
        <div className="flex h-20 w-32 shrink-0 items-center justify-center overflow-hidden rounded-md border border-gold-500/25 bg-ivory-50">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-full w-full object-contain" />
          ) : (
            <span className="px-2 text-center text-[11px] text-ink-500">No image</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="rounded-md border border-maroon/40 bg-maroon px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-maroon-hover disabled:opacity-60"
            >
              {uploading ? "Uploading…" : value ? "Replace image" : "Upload image"}
            </button>
            {value && !uploading && (
              <button type="button" onClick={() => onChange("")} className="inline-flex items-center gap-1 rounded-md border border-crimson-500/40 px-3 py-1.5 text-[12.5px] font-semibold text-crimson-500 hover:bg-crimson-500/5">
                <TrashIcon className="h-3.5 w-3.5" /> Remove
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[11.5px] text-ink-500">{hint ?? "JPG, PNG or WebP, up to 1 MB."}</p>
        </div>
        <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
      </div>
      {error && <p className="mt-1 text-[12px] text-crimson-500">{error}</p>}
    </div>
  );
}
