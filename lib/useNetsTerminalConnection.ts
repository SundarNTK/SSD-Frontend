"use client";

import { useEffect, useRef, useState } from "react";
import netsSocketService, { normalizeAckStatus, normalizeRealtimeStatus, type NetsAck } from "./netsSocketService";

/**
 * Shared connection state for every NETS status indicator on a page (the
 * admin header button, the POS floating widget) — so they all agree, ported
 * from HEB's useNetsTerminalConnection.ts. `terminalConnected` is
 * deliberately conservative: a conclusive ONLINE/READY sets it true, a
 * conclusive OFFLINE/DISCONNECTED sets it false, anything else (an
 * in-between INITIATED, a failed/empty ACK) leaves the previous value
 * alone rather than flapping the UI between states on every ambiguous
 * event.
 *
 * The POS Portal's checkout flow (components/pos/PosPortalPage.tsx) is the
 * one place that actually triggers a NETS payment today (its
 * NetsPaymentModal) — Admin Booking still only has Cash/PayNow, since it
 * writes to a separate, older order/booking collection
 * (controllers/pos/index.js) that the new NETS-initiate endpoint
 * (controllers/pos-orders' initiateNetsPayment) was never wired into.
 */
// Falls back to polling ONLY while the terminal is known to be offline, so
// the indicator self-heals on its own once the terminal comes back, instead
// of requiring the user to reload the page. A "Check Status" call is not a
// local/software check — the EXE relays it all the way to the physical NETS
// terminal over the serial port, and a real terminal audibly beeps on every
// command it receives. Polling on this timer unconditionally (the previous
// behaviour) meant every open tab — admin panel and POS panel both, each
// running its own copy of this hook — hit the real terminal with a fresh
// STATUS_CHECK every 5s forever, even while already confirmed online: two
// tabs open meant the terminal beeped twice every 5 seconds, indefinitely.
// HEB's own kiosk/POS frontend (User-Frontend-POS) never does this either —
// it checks once on connect, then relies entirely on the EXE's own pushed
// STATUS_MESSAGE/LOGON_MESSAGE broadcasts (see offStatus/offLogon below) to
// learn about a state change, the same way this hook now does once online.
const STATUS_POLL_INTERVAL_MS = 5000;
// How long to wait before trying connect() again after the socket's very
// first connection attempt fails outright (every candidate URL refused —
// e.g. the EXE hadn't finished starting yet when this page loaded). This is
// distinct from socket.io's own `reconnection` option, which only takes
// over once a connection has succeeded at least once — a rejected initial
// connect() leaves nothing retrying on its own, which is exactly what made
// "Check Status" stay permanently disabled until the page was refreshed.
const CONNECT_RETRY_DELAY_MS = 3000;

export function useNetsTerminalConnection() {
  const [socketConnected, setSocketConnected] = useState(false);
  const [terminalConnected, setTerminalConnected] = useState(false);
  // Mirrors terminalConnected for the interval callback below, which is set
  // up once (empty deps) and would otherwise only ever see the state's
  // initial value — a ref sidesteps re-subscribing the whole effect (and
  // its socket listeners) on every online/offline flip just to read it.
  const terminalConnectedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const setTerminalConnectedState = (value: boolean) => {
      terminalConnectedRef.current = value;
      setTerminalConnected(value);
    };

    const runStatusCheck = () => {
      netsSocketService.checkTerminalStatus((ack: NetsAck) => {
        if (cancelled) return;
        const normalized = normalizeAckStatus(ack);
        if (normalized === "online") setTerminalConnectedState(true);
        else if (normalized === "offline") setTerminalConnectedState(false);
      });
    };

    const attemptConnect = () => {
      netsSocketService
        .connect()
        .then(() => {
          if (cancelled) return;
          setSocketConnected(true);
          // Check status immediately on connect — otherwise "connected"
          // never shows up anywhere until something (e.g. opening the admin
          // NETS modal) happens to trigger a manual check. With simulation
          // mode on, this is what makes both the admin header dot and the
          // POS badge go green automatically, with nobody having to click
          // anything first.
          runStatusCheck();
        })
        .catch(() => {
          if (cancelled) return;
          setSocketConnected(false);
          // Keep trying instead of giving up — a page refresh used to be
          // the only thing that ever tried connect() again after this.
          retryTimer = setTimeout(attemptConnect, CONNECT_RETRY_DELAY_MS);
        });
    };

    attemptConnect();

    const offConnection = netsSocketService.on("connection_status", (data) => {
      const isConnected = Boolean((data as { connected?: boolean })?.connected);
      setSocketConnected(isConnected);
      if (isConnected) {
        // Covers socket.io's own automatic reconnection (a dropped EXE
        // process, a brief network hiccup, the machine waking from sleep) —
        // the server treats that as a brand-new connection, so this
        // client's last-known terminalConnected value can now be stale.
        // Re-check immediately rather than waiting on the next poll tick or
        // a page reload.
        runStatusCheck();
      } else {
        // A dropped socket means there is no live channel left to have
        // verified the terminal's state — leaving a stale `true` here was
        // producing an impossible "Service Offline" + "Terminal Online"
        // combination in the UI. Once the socket is confirmed back up,
        // runStatusCheck() above will re-establish the real answer.
        setTerminalConnectedState(false);
      }
    });

    const applyRealtime = (data: unknown) => {
      const normalized = normalizeRealtimeStatus(data as Record<string, unknown>);
      if (normalized === "online") setTerminalConnectedState(true);
      else if (normalized === "offline") setTerminalConnectedState(false);
      // busy/connecting/error/unknown: leave terminalConnected as-is
    };
    const offStatus = netsSocketService.on("STATUS_MESSAGE", applyRealtime);
    const offLogon = netsSocketService.on("LOGON_MESSAGE", applyRealtime);

    // Gated on !terminalConnectedRef.current — see the STATUS_POLL_INTERVAL_MS
    // comment above. Once online, this tick is a no-op: state changes reach
    // us via the STATUS_MESSAGE/LOGON_MESSAGE broadcasts above instead. A
    // genuinely offline terminal never reaches the physical unit either —
    // the EXE fails the check locally (COM port not open) before it ever
    // writes to the wire, so retrying every 5s while offline stays silent.
    const pollId = setInterval(() => {
      if (!cancelled && !terminalConnectedRef.current && netsSocketService.getConnectionStatus()) {
        runStatusCheck();
      }
    }, STATUS_POLL_INTERVAL_MS);

    // Chrome (and other browsers) throttle setTimeout/setInterval in
    // background tabs down to roughly once a minute or slower — that
    // applies to the poll above, the retry timer, and even Socket.IO's own
    // internal reconnection backoff, all equally. A tab left in the
    // background while the EXE restarts (e.g. toggling simulation mode,
    // which restarts the service) can sit fully disconnected for minutes
    // after coming back to the foreground, waiting on a timer the browser
    // was sitting on — this is what made the admin tab and the POS tab
    // reconnect at very different speeds despite running identical code.
    // Forcing an immediate check the moment the tab becomes visible again
    // closes that gap instead of waiting for a throttled timer to catch up.
    const onVisibilityChange = () => {
      if (cancelled || document.visibilityState !== "visible") return;
      if (netsSocketService.getConnectionStatus()) runStatusCheck();
      else attemptConnect();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      clearInterval(pollId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      offConnection();
      offStatus();
      offLogon();
    };
  }, []);

  return { socketConnected, terminalConnected, isNetsReady: socketConnected && terminalConnected };
}
