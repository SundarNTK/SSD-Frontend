import { api, unwrap, type ApiEnvelope } from "./api";

const translateCache = new Map<string, string>();
const transliterateCache = new Map<string, string[]>();

/** Whole-phrase machine translation, e.g. "Brass Diya" -> "பித்தளை தீபம்". */
export async function translateToTamil(text: string): Promise<string> {
  const key = text.trim().toLowerCase();
  if (!key) return "";
  if (translateCache.has(key)) return translateCache.get(key)!;
  const r = await api.get<ApiEnvelope<{ translated: string }>>("/masters/translate", {
    params: { text, target: "ta" },
  });
  const translated = unwrap(r).translated ?? "";
  if (translated) translateCache.set(key, translated);
  return translated;
}

/** Phonetic transliteration candidates, e.g. "kovil" -> ["கோவில்", "கோயில்", ...]. */
export async function transliterateToTamil(text: string): Promise<string[]> {
  const key = text.trim().toLowerCase();
  if (!key) return [];
  if (transliterateCache.has(key)) return transliterateCache.get(key)!;
  const r = await api.get<ApiEnvelope<{ candidates: string[] }>>("/masters/transliterate", {
    params: { text },
  });
  const candidates = unwrap(r).candidates ?? [];
  if (candidates.length > 0) transliterateCache.set(key, candidates);
  return candidates;
}
