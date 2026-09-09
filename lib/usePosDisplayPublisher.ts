"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IDLE_DISPLAY, POS_DISPLAY_CODE_KEY, type PosDisplayPayload } from "./posDisplay";
import { api, extractErrorMessage } from "./api";

/**
 * Cashier-side publisher: allocates a pairing code on SSD-Backend (a
 * normal long-running process with its own MongoDB-backed
 * PosDisplaySession, not this Next app) and PUTs cart / QR / totals there.
 * The pairing code — and the cart data behind it — has to live off a
 * server process every device can reach the same way regardless of which
 * network it's on, which a Next.js API route's own in-memory Map can't
 * guarantee once this frontend runs on Vercel: two requests can land on
 * two different serverless instances, each with its own empty Map, so a
 * phone polling right after the cashier publishes could 404 or see stale
 * data depending on which instance answered which request.
 */
export function usePosDisplayPublisher() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const codeRef = useRef("");
  const lastJson = useRef("");
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const saved = typeof window !== "undefined" ? localStorage.getItem(POS_DISPLAY_CODE_KEY) : "";

    (async () => {
      try {
        const res = await api.post<{ success?: boolean; message?: string; data?: { code?: string } }>(
          "/pos-display/session",
          saved ? { code: saved } : {}
        );
        const next = res.data?.data?.code;
        if (!next) throw new Error("Could not start the second-screen session.");
        if (cancelled) return;
        codeRef.current = next;
        setCode(next);
        setError(null);
        localStorage.setItem(POS_DISPLAY_CODE_KEY, next);
        lastJson.current = "";
      } catch (err) {
        if (!cancelled) setError(extractErrorMessage(err));
      }
    })();

    return () => {
      cancelled = true;
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  const publish = useCallback((payload: PosDisplayPayload) => {
    const json = JSON.stringify(payload);
    if (json === lastJson.current) return;
    lastJson.current = json;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const activeCode = codeRef.current;
      if (!activeCode) return;
      void api.put(`/pos-display/session/${encodeURIComponent(activeCode)}`, { payload }).catch(() => {});
    }, 150);
  }, []);

  const publishIdle = useCallback(() => publish(IDLE_DISPLAY), [publish]);

  return { code, error, publish, publishIdle };
}
