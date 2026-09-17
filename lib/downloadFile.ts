import type { AxiosInstance } from "axios";

/**
 * Triggers a browser download for a file the API returns as a binary
 * response (an .xlsx export or sample template) — one implementation every
 * master's Export/Sample-template button can share, instead of each screen
 * hand-rolling the same blob-URL dance.
 *
 * Reads the real filename off `Content-Disposition` when the server sent
 * one (see the backend's import-export-controller.js), falling back to
 * `fallbackFilename` only if that header is missing.
 */
export async function downloadFile(client: AxiosInstance, url: string, fallbackFilename: string): Promise<void> {
  const response = await client.get(url, { responseType: "blob" });

  // A server-side failure (e.g. no permission, unexpected error) still
  // answers the usual `{ success:false, message }` JSON envelope — but
  // axios hands it back as an opaque Blob here because responseType:
  // "blob" was requested up front, before anyone knew the request would
  // fail. Without this check, a failed export silently "succeeds" by
  // downloading a file full of JSON text instead of surfacing the error.
  const contentType = (response.headers?.["content-type"] as string | undefined) || "";
  if (contentType.includes("json")) {
    const text = await (response.data as Blob).text();
    let message = "Could not download the file.";
    try {
      message = JSON.parse(text)?.message || message;
    } catch {
      // leave the generic message
    }
    throw new Error(message);
  }

  const disposition = response.headers?.["content-disposition"] as string | undefined;
  const match = disposition?.match(/filename="?([^"\n]+)"?/i);
  const filename = match?.[1] || fallbackFilename;

  const blobUrl = window.URL.createObjectURL(response.data as Blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
}
