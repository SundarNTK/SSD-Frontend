"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNetsTerminalConnection } from "../../lib/useNetsTerminalConnection";
import netsSocketService, { normalizeAckStatus, type NetsAck } from "../../lib/netsSocketService";
import { RefreshIcon } from "../divine/icons";

/**
 * Floating counter-side NETS connectivity badge — mirrors HEB's
 * TerminalStatusWidget.jsx (User-Frontend-POS), restyled to this app's
 * warm cream/gold POS theme instead of HEB's Bootstrap badges. Fixed to a
 * screen corner rather than living in the header, same as HEB's version,
 * so it stays visible regardless of which POS screen/step is active.
 */
export default function NetsStatusWidget() {
  const { socketConnected, terminalConnected, isNetsReady } = useNetsTerminalConnection();
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [loggingOn, setLoggingOn] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  function label() {
    if (!socketConnected) return { text: "NETS Service Offline", color: "#dc2626", emoji: "🔴" };
    if (!terminalConnected) return { text: "NETS Terminal Offline", color: "#d97706", emoji: "🟡" };
    return { text: "NETS Ready", color: "#16a34a", emoji: "🟢" };
  }
  const current = label();

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
    netsSocketService.terminalLogon(() => {
      setLoggingOn(false);
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
            className="mb-2 w-64 rounded-xl border border-gold-400/50 bg-white p-4 shadow-[0_20px_50px_-15px_rgba(124,21,39,0.35)]"
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-maroon">NETS Terminal</p>
            <div className="mt-2 space-y-1.5 text-[12.5px]">
              <p className="flex items-center justify-between">
                <span className="text-ink-500">Service</span>
                <span style={{ color: socketConnected ? "#16a34a" : "#dc2626" }}>{socketConnected ? "Connected" : "Offline"}</span>
              </p>
              <p className="flex items-center justify-between">
                <span className="text-ink-500">Terminal</span>
                <span style={{ color: terminalConnected ? "#16a34a" : "#d97706" }}>{terminalConnected ? "Online" : "Not ready"}</span>
              </p>
              {lastChecked && (
                <p className="flex items-center justify-between">
                  <span className="text-ink-500">Last checked</span>
                  <span className="text-ink-100">{lastChecked}</span>
                </p>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleCheck}
                disabled={checking || !socketConnected}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gold-400/50 bg-[#FFF3DE] py-1.5 text-[12px] font-medium text-maroon transition-colors hover:bg-[#FFE9C7] disabled:opacity-50"
              >
                <RefreshIcon className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} /> Check Status
              </button>
              <button
                type="button"
                onClick={handleLogon}
                disabled={loggingOn || !socketConnected || terminalConnected}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-maroon/30 bg-maroon py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-maroon-hover disabled:opacity-50"
              >
                Logon
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={current.text}
        className="flex items-center gap-1.5 rounded-full border border-gold-400/60 bg-white/90 px-3 py-1.5 text-[12px] font-medium text-ink-100 shadow-[0_8px_24px_-8px_rgba(124,21,39,0.35)] backdrop-blur-sm"
      >
        <span aria-hidden="true">{current.emoji}</span>
        <span className="hidden sm:inline" style={{ color: current.color }}>
          {isNetsReady ? "NETS Ready" : current.text}
        </span>
      </button>
    </div>
  );
}
