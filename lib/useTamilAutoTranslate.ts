import { useEffect } from "react";
import { api, unwrap, type ApiEnvelope } from "./api";

const cache = new Map<string, string>();

async function translateToTamil(text: string): Promise<string> {
  const key = text.trim().toLowerCase();
  if (!key) return "";
  if (cache.has(key)) return cache.get(key)!;
  const r = await api.get<ApiEnvelope<{ translated: string }>>("/masters/translate", {
    params: { text, target: "ta" },
  });
  const translated = unwrap(r).translated ?? "";
  if (translated) cache.set(key, translated);
  return translated;
}

/**
 * Item/Service master: as the admin types the English Name, this fills in
 * Tamil Name for them via the backend's free translate proxy.
 *
 * Only fires while `tamilName` is empty — never overwrites a value that's
 * already there, whether that's an existing item's stored translation
 * (opening the edit form once populates `tamilName` from the DB, which
 * permanently satisfies this check) or something the admin typed themselves.
 * Clearing the field back to empty resumes auto-fill on the next keystroke,
 * which is the expected escape hatch rather than a bug.
 */
export function useTamilAutoTranslate(name: string, tamilName: string, setTamilName: (value: string) => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    if (tamilName.trim() !== "") return;
    const trimmed = name.trim();
    if (!trimmed) return;

    const timer = setTimeout(async () => {
      try {
        const translated = await translateToTamil(trimmed);
        if (translated) setTamilName(translated);
      } catch {
        // Convenience only — a failed lookup just leaves the field blank.
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [name, tamilName, enabled, setTamilName]);
}
