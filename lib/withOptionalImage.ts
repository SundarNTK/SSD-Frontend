import type { WriteBody } from "./useApiResource";

/**
 * When a photo is attached OR an existing one was explicitly removed, the
 * write is multipart (same pattern as Category and User). Nested
 * objects/arrays become JSON strings; the backend's hydrateMultipartBody
 * turns them back before Joi runs.
 *
 * `imageRemoved` distinguishes "the image field was never touched" from
 * "the person clicked delete" — both look identical as `image === null`
 * otherwise. Without it, deleting an already-saved image had nothing to
 * tell the server: no new file meant this function used to return the
 * plain JSON body, which never even mentions the image field, so the old
 * value just stayed. Passing `imageRemoved: true` always sends the
 * `existing<Field>` companion field empty, which SSD-Backend's
 * `makeImageUpload` reads to know the field should be cleared. Omitting
 * the third argument (or leaving `imageRemoved` false) keeps every
 * existing call site's behaviour exactly as it was.
 */
export function withOptionalImage(
  values: Record<string, unknown>,
  image: File | null,
  options?: { fieldName?: string; existingValue?: string | null; imageRemoved?: boolean }
): WriteBody {
  const fieldName = options?.fieldName ?? "image";
  const removed = options?.imageRemoved ?? false;

  if (!image && !removed) return values;

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

  const existingFieldName = `existing${fieldName.charAt(0).toUpperCase()}${fieldName.slice(1)}`;
  form.append(existingFieldName, removed ? "" : options?.existingValue ?? "");
  if (image) form.append(fieldName, image);
  return form;
}
