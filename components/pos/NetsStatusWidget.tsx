"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNetsTerminalConnection } from "../../lib/useNetsTerminalConnection";
import netsSocketService, { normalizeAckStatus, type NetsAck } from "../../lib/netsSocketService";
import { RefreshIcon, CloseIcon } from "../divine/icons";

/**
 * Floating counter-side NETS connectivity badge — mirrors HEB's
 * TerminalStatusWidget.jsx (User-Frontend-POS), restyled to this app's
 * warm cream/gold POS theme instead of HEB's Bootstrap badges. Fixed to a
 * screen corner rather than living in the header, same as HEB's version,
 * so it stays visible regardless of which POS screen/step is active.
 *
 * Logon is never required before a NETS payment — confirmed by reading the
 * actual payment code path (and HEB's own production usage of the
 * identical SDK): nothing checks for a prior logon. It's kept here purely
 * as a manual fallback in case the physical terminal or NETS's own host
 * ever needs a fresh sign-on, not as a daily/required step.
 */
const MIN_LOADING_MS = 450;

export default function NetsStatusWidget() {
  const { socketConnected, terminalConnected, isNetsReady } = useNetsTerminalConnection();
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [loggingOn, setLoggingOn] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  function label() {
    if (!socketConnected) return { text: "NETS Service Offline", tone: "offline" as const };
    if (!terminalConnected) return { text: "NETS Terminal Offline", tone: "pending" as const };
    return { text: "NETS Ready", tone: "ready" as const };
  }
  const current = label();

  const TONE_STYLE = {
    ready: { bg: "bg-emerald-600", hoverBg: "hover:bg-emerald-500", border: "border-emerald-400/70", dot: "bg-emerald-200" },
    pending: { bg: "bg-amber-500", hoverBg: "hover:bg-amber-400", border: "border-amber-300/70", dot: "bg-amber-100" },
    offline: { bg: "bg-[#7c1527]", hoverBg: "hover:bg-maroon-hover", border: "border-white/20", dot: "bg-white/70" },
  } as const;
  const trigger = TONE_STYLE[current.tone];

  function handleCheck() {
    setChecking(true);
    netsSocketService.checkTerminalStatus((ack: NetsAck) => {
      setChecking(false);
      setLastChecked(new Date().toLocaleTimeString());
      normalizeAckStatus(ack); // status itself flows through the shared hook via STATUS_MESSAGE
    });
  }

  function handleLogon() {
    setLoggingOn(true);
    // In simulation mode the whole round trip (emit -> EXE -> ack) can
    // finish in a handful of milliseconds — fast enough that `loggingOn`
    // flips back to false before the browser ever paints the loading
    // frame, so the spinner never actually becomes visible even though the
    // code runs correctly. Enforcing a minimum visible duration so a click
    // always shows *something* happened, not just for very fast responses.
    const startedAt = Date.now();
    netsSocketService.terminalLogon(() => {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, MIN_LOADING_MS - elapsed);
      window.setTimeout(() => setLoggingOn(false), remaining);
    });
  }

  return (
    <div className="fixed bottom-4 left-4 z-40">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="mb-2 w-64 overflow-hidden rounded-xl border border-gold-400/50 bg-white shadow-[0_20px_50px_-15px_rgba(124,21,39,0.35)]"
          >
            <div className="flex items-center justify-between gap-2 bg-maroon px-3.5 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-white">NETS Terminal</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/15 hover:text-white"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="p-4">
              <div className="space-y-2 text-[12.5px]">
                <p className="flex items-center justify-between">
                  <span className="text-ink-500">Service</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      socketConnected ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                    }`}
                  >
                    {socketConnected ? "Connected" : "Offline"}
                  </span>
                </p>
                <p className="flex items-center justify-between">
                  <span className="text-ink-500">Terminal</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      terminalConnected ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {terminalConnected ? "Online" : "Not ready"}
                  </span>
                </p>
                {lastChecked && (
                  <p className="flex items-center justify-between">
                    <span className="text-ink-500">Last checked</span>
                    <span className="text-ink-100">{lastChecked}</span>
                  </p>
                )}
              </div>
              <div className="mt-3.5 flex gap-2">
                <button
                  type="button"
                  onClick={handleCheck}
                  disabled={checking}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-maroon py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-maroon-hover disabled:opacity-50"
                >
                  <RefreshIcon className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} /> Check Status
                </button>
                <button
                  type="button"
                  onClick={handleLogon}
                  disabled={loggingOn || terminalConnected}
                  title="Not required day to day — only if the terminal needs a fresh sign-on"
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-maroon/30 bg-white py-2 text-[12.5px] font-semibold text-maroon transition-colors hover:bg-[#FFF3DE] disabled:opacity-50"
                >
                  {loggingOn && (
                    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
                    </svg>
                  )}
                  Logon
                </button>
              </div>
              <p className="mt-2 text-[10.5px] leading-snug text-ink-500">
                Logon isn&apos;t needed for a payment to work — only use it if the terminal seems stuck after being
                powered off.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={current.text}
        className={`flex items-center gap-2 rounded-full border ${trigger.border} ${trigger.bg} ${trigger.hoverBg} px-3.5 py-2 text-[12.5px] font-semibold text-white shadow-[0_8px_24px_-8px_rgba(124,21,39,0.45)] backdrop-blur-sm transition-colors`}
      >
        <span aria-hidden="true" className={`h-2 w-2 rounded-full ${trigger.dot} ${current.tone === "ready" ? "animate-pulse" : ""}`} />
        <span className="hidden sm:inline">{isNetsReady ? "NETS Ready" : current.text}</span>
      </button>
    </div>
  );
}
