import type { WriteBody } from "./useApiResource";

/**
 * When a photo is attached, the write is multipart (same pattern as
 * Category and User). Nested objects/arrays become JSON strings; the
 * backend's hydrateMultipartBody turns them back before Joi runs.
 */
export function withOptionalImage(values: Record<string, unknown>, image: File | null): WriteBody {
  if (!image) return values;
  const form = new FormData();
  Object.entries(values).forEach(([key, val]) => {
    if (val === undefined) return;
    if (val === null) {
      form.append(key, "null");
      return;
    }
    if (typeof val === "object") {
      form.append(key, JSON.stringify(val));
      return;
    }
    form.append(key, String(val));
  });
  form.append("image", image);
  return form;
}
