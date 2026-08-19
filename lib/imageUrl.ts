/**
 * Uploaded images are stored as server-relative paths ("/uploads/avatars/x.jpg")
 * so the record never hardcodes a host. The API origin is derived from the
 * configured base URL by stripping the "/api/v1" suffix — the files are served
 * by the same service, just outside the versioned API prefix.
 */
export function resolveImageUrl(path?: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const base = (process.env.NEXT_PUBLIC_AUTH_API_BASE_URL ?? "http://localhost:5003/api/v1").replace(
    /\/api\/v\d+\/?$/,
    ""
  );
  return `${base}${path}`;
}
