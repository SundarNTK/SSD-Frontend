"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNetsTerminalConnection } from "../../lib/useNetsTerminalConnection";
import netsSocketService, { normalizeRealtimeStatus, type NetsAck, type TerminalStatus } from "../../lib/netsSocketService";
import DivineButton from "../divine/DivineButton";
import { PrinterIcon, RefreshIcon, CloseIcon } from "../divine/icons";

const STATUS_STYLE: Record<TerminalStatus, { color: string; soft: string; label: string }> = {
  online: { color: "#16a34a", soft: "#eafaf0", label: "Terminal Online" },
  offline: { color: "#c1272d", soft: "#fdecec", label: "Terminal Offline" },
  busy: { color: "#b45309", soft: "#fdf3e2", label: "Terminal Busy" },
  connecting: { color: "#2563eb", soft: "#eaf1fd", label: "Connecting…" },
  error: { color: "#c1272d", soft: "#fdecec", label: "Terminal Error" },
  unknown: { color: "#8a8478", soft: "#f2efe7", label: "Unknown Status" },
};

type LogEntry = { id: number; time: string; message: string; tone: "info" | "success" | "error" };

const MIN_LOADING_MS = 450;

function PlugIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 2v4M15 2v4M7 6h10v4a5 5 0 0 1-5 5 5 5 0 0 1-5-5V6ZM12 15v4M9 22h6" />
    </svg>
  );
}

/**
 * Header entry point for NETS terminal connectivity — mirrors HEB's
 * NetsHeaderButton + NetsTerminalStatus (D:\PROJECTS\HEB\Admin-Frontend)
 * for structure, restyled to SSD's own maroon/gold ceremonial palette (the
 * same gradient DivineButton's default variant already uses) instead of
 * HEB's blue/orange antd theme. Talks to the local Nets-Service EXE via
 * lib/netsSocketService.ts — same Socket.IO protocol HEB uses, just at
 * localhost:2003 instead of :5201.
 */
export default function NetsStatusButton() {
  const { socketConnected, terminalConnected, isNetsReady } = useNetsTerminalConnection();
  const [open, setOpen] = useState(false);
  // Seeded from the shared hook rather than always "unknown" — otherwise
  // opening this modal after the terminal is already known-online (from an
  // earlier STATUS_MESSAGE) would still flash "Unknown Status" until the
  // next check completes.
  const [status, setStatus] = useState<TerminalStatus>(terminalConnected ? "online" : "unknown");
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [loggingOn, setLoggingOn] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logIdRef = useRef(0);

  function addLog(message: string, tone: LogEntry["tone"] = "info") {
    logIdRef.current += 1;
    setLogs((prev) => [{ id: logIdRef.current, time: new Date().toLocaleTimeString(), message, tone }, ...prev].slice(0, 30));
  }

  useEffect(() => {
    if (!open) return;

    const offStatusResponse = netsSocketService.on("terminal:status:response", (data) => {
      // This "response" event is the same generic "request accepted" shape
      // as the ack callback below — it confirms the EXE received the
      // command, not that the terminal is online/offline. Painting `status`
      // from it raced against the real STATUS_MESSAGE broadcast and could
      // leave the UI stuck showing the wrong state if that broadcast was
      // ever missed. Only STATUS_MESSAGE/LOGON_MESSAGE (real terminal state)
      // are allowed to set `status` now.
      const ack = data as NetsAck;
      if (ack.terminalId) setTerminalId(ack.terminalId);
      addLog(`Status response: ${ack.message || ack.status}`, ack.status === "success" ? "success" : "error");
    });
    const offStatusMessage = netsSocketService.on("STATUS_MESSAGE", (data) => {
      setStatus(normalizeRealtimeStatus(data as Record<string, unknown>));
      addLog(`STATUS_MESSAGE: ${(data as Record<string, unknown>)?.status ?? "unknown"}`, "info");
    });
    const offLogonResponse = netsSocketService.on("terminal:logon:response", (data) => {
      const ack = data as NetsAck;
      addLog(`Logon response: ${ack.message || ack.status}`, ack.status === "success" ? "success" : "error");
    });
    // LOGON_MESSAGE carries the same real-terminal-state shape STATUS_MESSAGE
    // does (see normalizeRealtimeStatus) — there's no separate "logged on"
    // state to track, same as HEB's own NetsTerminalStatus.tsx: a logon
    // success just resolves back into the same Online/Offline indicator.
    const offLogonMessage = netsSocketService.on("LOGON_MESSAGE", (data) => {
      setStatus(normalizeRealtimeStatus(data as Record<string, unknown>));
      addLog(`LOGON_MESSAGE: ${(data as Record<string, unknown>)?.status ?? "unknown"}`, "info");
    });
    // Auto-check on open, same as HEB's modal.
    handleCheckStatus();

    return () => {
      offStatusResponse();
      offStatusMessage();
      offLogonResponse();
      offLogonMessage();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleCheckStatus() {
    if (!socketConnected) {
      addLog("Cannot check status — socket not connected to the Nets-Service EXE.", "error");
      return;
    }
    setChecking(true);
    addLog("Checking terminal status…");
    netsSocketService.checkTerminalStatus((ack) => {
      setChecking(false);
      // Don't set `status` from this ack — it's just "request accepted",
      // not real terminal state (see offStatusResponse above). The real
      // answer arrives as a STATUS_MESSAGE event, handled below.
      if (ack.terminalId) setTerminalId(String(ack.terminalId));
    });
  }

  // Not required before a payment — confirmed by reading the actual payment
  // code path (and HEB's own production usage of the identical SDK): no
  // code anywhere checks for a prior logon. Kept available here as a manual
  // action in case the physical terminal or NETS's own host ever needs a
  // fresh sign-on (e.g. after being powered off) — the same reasoning
  // HEB's own panel keeps it around for.
  function handleLogon() {
    // No socketConnected guard here on purpose (there used to be one) —
    // netsSocketService.terminalLogon() now attempts a fresh reconnect on
    // its own when the socket is down, which is exactly the situation this
    // button is usually clicked in (terminal shown offline). Returning
    // early here instead of calling it meant that reconnect logic never
    // even ran for this button.
    setLoggingOn(true);
    addLog("Triggering terminal logon…");
    // Simulation mode can resolve in a handful of milliseconds — fast
    // enough that the loading state flips off before the browser paints
    // it, making a working click look like nothing happened. Enforce a
    // minimum visible duration so there's always a perceptible spinner.
    const startedAt = Date.now();
    netsSocketService.terminalLogon((ack) => {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, MIN_LOADING_MS - elapsed);
      window.setTimeout(() => {
        setLoggingOn(false);
        if (ack.status !== "success") addLog(`Logon failed: ${ack.error || ack.message}`, "error");
      }, remaining);
    });
  }

  const style = STATUS_STYLE[socketConnected ? status : "offline"];
  // The whole pill now carries the state (was a translucent header button
  // with only a small colored dot in the corner — easy to miss at a
  // glance). Three tones: ready (solid green), socket up but terminal not
  // ready yet (amber), fully offline (the original translucent look).
  const headerTone = isNetsReady
    ? "border-emerald-400/70 bg-emerald-600 text-white hover:bg-emerald-500"
    : socketConnected
      ? "border-amber-400/70 bg-amber-500/90 text-white hover:bg-amber-500"
      : "border-gold-400/40 bg-white/10 text-gold-100 hover:bg-white/20";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={isNetsReady ? "NETS: Connected" : socketConnected ? "NETS: Terminal not ready" : "NETS: Service offline"}
        className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-semibold transition-colors ${headerTone}`}
      >
        <PrinterIcon />
        <span className="hidden sm:inline">NETS</span>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-[70] bg-navy-950/75 backdrop-blur-sm"
            />
            <div className="pointer-events-none fixed inset-0 z-[71] flex items-center justify-center overflow-hidden p-3 sm:p-4">
              <motion.div
                role="dialog"
                aria-modal="true"
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.97 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="pointer-events-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#ead9c6] bg-[#fffaf2] shadow-[0_30px_80px_-20px_rgba(124,21,39,0.45)]"
              >
                {/* Header — icon chip + title, solid maroon (was a maroon->gold gradient) */}
                <div className="flex items-center justify-between gap-3 border-b border-[#ead9c6] bg-maroon px-5 py-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 text-white ring-1 ring-white/30">
                      <PrinterIcon />
                    </span>
                    <div>
                      <h2 className="font-display text-[17px] font-bold text-white">NETS Terminal Control</h2>
                      <p className="text-[12px] text-white/80">Payment terminal connection &amp; management</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 text-white transition-colors hover:bg-white/25"
                  >
                    <CloseIcon className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid gap-4 overflow-y-auto p-5 sm:grid-cols-2">
                  <div className="space-y-3">
                    {/* Status card — soft gradient tinted to the current state */}
                    <div
                      className="rounded-xl border p-5 text-center"
                      style={{ borderColor: `${style.color}33`, background: `linear-gradient(180deg, ${style.soft}, #fffaf2)` }}
                    >
                      <span
                        aria-hidden="true"
                        className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full"
                        style={{ backgroundColor: style.soft, boxShadow: `0 0 0 6px ${style.color}14` }}
                      >
                        <PlugIcon color={style.color} />
                      </span>
                      <p className="text-[15px] font-bold" style={{ color: style.color }}>
                        {style.label}
                      </p>
                      {terminalId && <p className="mt-1 text-[12px] text-ink-500">Terminal ID: {terminalId}</p>}
                      <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[#ead9c6] bg-white px-2.5 py-1 text-[11.5px] font-medium">
                        <span className="text-ink-500">Socket:</span>
                        <span style={{ color: socketConnected ? "#16a34a" : "#c1272d" }}>{socketConnected ? "Connected" : "Disconnected"}</span>
                      </p>
                    </div>

                    <DivineButton variant="marigold" fullWidth type="button" loading={checking} onClick={handleCheckStatus}>
                      <span className="inline-flex items-center gap-2">
                        <RefreshIcon className="h-4 w-4" /> Check Status
                      </span>
                    </DivineButton>
                    <button
                      type="button"
                      onClick={handleLogon}
                      disabled={loggingOn || status === "online"}
                      className={`flex w-full items-center justify-center gap-2 rounded-md border px-5 py-3 text-[15px] font-accent tracking-wide transition-colors disabled:cursor-not-allowed ${
                        status === "online"
                          ? "border-[#e5ddd0] bg-white text-ink-500 disabled:opacity-60"
                          : "border-[#c1272d] bg-[#fdecec] text-[#c1272d] hover:bg-[#fbdada]"
                      }`}
                    >
                      {loggingOn && (
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
                        </svg>
                      )}
                      Terminal Logon
                    </button>
                    <p className="px-0.5 text-[11px] leading-snug text-ink-500">
                      Not required for a payment to go through — Check Status is enough day to day. Use this only if
                      the terminal seems unresponsive after being powered off, or if NETS itself ever asks for it.
                    </p>

                    {!socketConnected && (
                      <div className="flex items-start gap-2 rounded-lg border border-[#f0c987] bg-[#fdf3e2] px-3 py-2.5 text-[12px] text-[#8a5a10]">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0">
                          <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span>Socket disconnected — make sure the SSD Nets-Service EXE is running on this machine (localhost:2003).</span>
                      </div>
                    )}
                  </div>

                  <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#ead9c6] bg-white">
                    <div className="flex items-center gap-2 bg-maroon px-3 py-2.5">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 6h16M4 12h16M4 18h10" />
                      </svg>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-white">Activity Log</p>
                    </div>
                    <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2 font-mono text-[11px]">
                      {logs.length === 0 && <p className="p-2 text-ink-500">No activity yet — click Check Status to begin.</p>}
                      {logs.map((entry, i) => (
                        <div key={entry.id} className={`flex items-start gap-2 rounded-md px-2 py-1.5 ${i % 2 === 0 ? "bg-[#faf6ee]" : "bg-white"}`}>
                          <span
                            aria-hidden="true"
                            className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: entry.tone === "error" ? "#c1272d" : entry.tone === "success" ? "#16a34a" : "#8a8478" }}
                          />
                          <div className="min-w-0">
                            <span className="text-ink-500">{entry.time}</span>{" "}
                            <span className={entry.tone === "error" ? "text-[#c1272d]" : entry.tone === "success" ? "text-[#16a34a]" : "text-ink-100"}>
                              {entry.message}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
