/**
 * Socket.IO client for the local SSD Nets-Service EXE — the same protocol
 * HEB's Admin-Frontend/User-Frontend-POS socketService.ts already talks to
 * (terminal:status / terminal:logon / terminal:payment:nets, ack-callback
 * style, plus PAYMENT_MESSAGE/STATUS_MESSAGE/LOGON_MESSAGE realtime
 * events) — see SSD's Nets-Service SOCKET_COMMANDS_REFERENCE.md, unchanged
 * from HEB's. Always localhost: the EXE runs on the same till/counter PC as
 * whichever browser tab is showing this page, never a deployed origin.
 *
 * Deliberately smaller than HEB's version — no payment-lock timeout,
 * command queueing, or throttling (SSD doesn't yet trigger NETS payments
 * from this app — see MODULE comment in useNetsTerminalConnection.ts).
 * Kept: the connection-candidate fallback, ack + response-event dual
 * listening, and the ACK-vs-realtime status normalization split, since
 * that split is what stops a plain "request accepted" ACK from being
 * misread as "terminal is online".
 */
import { io, type Socket } from "socket.io-client";

const DEFAULT_URL = "http://localhost:2003";
const CONFIGURED_URL = process.env.NEXT_PUBLIC_NETS_SERVICE_URL || DEFAULT_URL;

function buildCandidates(): string[] {
  const candidates = [CONFIGURED_URL, "http://localhost:2003", "http://127.0.0.1:2003"];
  return Array.from(new Set(candidates));
}

export type TerminalStatus = "online" | "offline" | "busy" | "connecting" | "error" | "unknown";

export type NetsAck = {
  status: "success" | "error";
  message?: string;
  error?: string | { message?: string };
  terminalId?: string;
  connectionStatus?: string;
  [key: string]: unknown;
};

type Listener = (data: unknown) => void;

class NetsSocketService {
  private socket: Socket | null = null;
  private connecting: Promise<void> | null = null;
  private connected = false;
  private listeners = new Map<string, Set<Listener>>();

  getConnectionStatus() {
    return this.connected && Boolean(this.socket?.connected);
  }

  connect(): Promise<void> {
    if (this.getConnectionStatus()) return Promise.resolve();
    if (this.connecting) return this.connecting;

    this.connecting = new Promise((resolve, reject) => {
      const candidates = buildCandidates();
      let index = 0;

      const tryNext = () => {
        if (index >= candidates.length) {
          this.connecting = null;
          reject(new Error("Could not connect to the Nets-Service EXE on any known URL."));
          return;
        }
        const url = candidates[index++];
        const socket = io(url, {
          transports: ["websocket", "polling"],
          reconnection: true,
          // Unbounded — this is a kiosk counter PC where the EXE can be
          // closed and reopened at any time (a restart, an update, someone
          // closing the window by accident). A finite cap here (this used
          // to be 10) meant socket.io gave up retrying for good after
          // roughly 30-40s of backoff and never tried again on its own —
          // exactly the "closed the EXE, reopened it later, page never
          // reconnects even after a manual Check Status" bug. Retrying
          // forever at a capped interval (reconnectionDelayMax below) costs
          // nothing since this is all localhost.
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          timeout: 5000,
        });

        const onFirstConnect = () => {
          this.socket = socket;
          this.connecting = null;
          // attachCoreListeners registers its own persistent "connect"
          // listener (see below) that re-runs handleSocketConnected on
          // every future reconnect too — added here, after this "connect"
          // event has already started dispatching, so it does not also
          // fire a second time for this very first connect.
          this.attachCoreListeners(socket);
          this.handleSocketConnected();
          resolve();
        };
        const onConnectError = () => {
          socket.close();
          tryNext();
        };

        socket.once("connect", onFirstConnect);
        socket.once("connect_error", onConnectError);
      };

      tryNext();
    });

    return this.connecting;
  }

  private handleSocketConnected() {
    this.connected = true;
    // Tells the EXE's websocket-handler.js to join this socket to
    // 'clientRoom' — the room sendMessage('clientRoom', ...) broadcasts
    // STATUS_MESSAGE/LOGON_MESSAGE/PAYMENT_MESSAGE to. Must run on every
    // (re)connect, not just the first: socket.io's automatic reconnection
    // (reconnection: true, below) re-establishes the transport but the
    // server treats it as a brand-new connection, so a client that only
    // joined once silently stops receiving any broadcast after a dropped
    // connection — leaving the UI stuck on stale status until a full page
    // reload created a fresh connect() cycle. That was the actual cause of
    // "check status says offline, but a refresh fixes it."
    this.socket!.emit("ADD_CLIENT_SERVICE", {});
    this.emitLocal("connection_status", { connected: true });
  }

  private attachCoreListeners(socket: Socket) {
    // Persistent (not .once) — fires again on every automatic reconnect so
    // handleSocketConnected's room-(re)join above actually runs each time.
    socket.on("connect", () => this.handleSocketConnected());
    socket.on("disconnect", (reason) => {
      this.connected = false;
      this.emitLocal("connection_status", { connected: false, reason });
    });
    // Broadcast every SDK/command-response event this service cares about to
    // local subscribers — see EVENT below for the exact set.
    for (const event of RELAYED_EVENTS) {
      socket.on(event, (data: unknown) => this.emitLocal(event, data));
    }
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.connected = false;
    this.connecting = null;
  }

  on(event: string, cb: Listener): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
    return () => this.listeners.get(event)?.delete(cb);
  }

  private emitLocal(event: string, data: unknown) {
    this.listeners.get(event)?.forEach((cb) => cb(data));
  }

  checkTerminalStatus(cb?: (ack: NetsAck) => void) {
    if (!this.getConnectionStatus()) {
      // A manual "Check Status" click while disconnected most often means
      // the EXE was closed and has since been reopened — give reconnecting
      // a real chance instead of just reporting the old error. The
      // background auto-reconnect (see connect()'s unbounded
      // reconnectionAttempts) would eventually catch this too, but a
      // button someone just pressed should try immediately, not wait for
      // the next backoff tick.
      this.connect()
        .then(() => this.checkTerminalStatus(cb))
        .catch(() =>
          cb?.({ status: "error", error: "Could not reach the Nets-Service EXE on localhost:2003 — make sure it's running." })
        );
      return;
    }
    this.socket!.emit("terminal:status", { timestamp: new Date().toISOString() }, (ack: NetsAck) => cb?.(ack));
  }

  terminalLogon(cb?: (ack: NetsAck) => void) {
    if (!this.getConnectionStatus()) {
      // Same fix as checkTerminalStatus() — the Logon button is only ever
      // enabled while the terminal shows not-connected, which is exactly
      // when the socket itself is most likely to also be down. Erroring
      // out instantly here (the old behavior) made the button flip its
      // loading state on and off in the same tick, with no attempt to
      // actually recover — looked like clicking it did nothing at all.
      this.connect()
        .then(() => this.terminalLogon(cb))
        .catch(() =>
          cb?.({ status: "error", error: "Could not reach the Nets-Service EXE on localhost:2003 — make sure it's running." })
        );
      return;
    }
    this.socket!.emit("terminal:logon", { timestamp: new Date().toISOString() }, (ack: NetsAck) => cb?.(ack));
  }

  /**
   * Sends a payment to the physical (or, with the EXE's simulation mode on,
   * simulated) terminal. This ack only confirms the EXE accepted the
   * request — the actual outcome arrives later as a PAYMENT_MESSAGE event
   * (INITIATED, then SUCCESS/FAILED/CANCELLED/TERMINAL_ERROR/RETRY), which
   * is what NetsPaymentModal (components/pos/PosPortalPage.tsx) actually
   * watches.
   */
  processNetsPayment(payment: { orderId: string; amount: number; currency?: string }, cb?: (ack: NetsAck) => void) {
    if (!this.getConnectionStatus()) {
      cb?.({ status: "error", error: "Socket not connected to the Nets-Service EXE." });
      return;
    }
    this.socket!.emit(
      "terminal:payment:nets",
      {
        orderId: payment.orderId,
        amount: payment.amount.toFixed(2),
        currency: payment.currency || "SGD",
        paymentType: "NETS",
        timestamp: new Date().toISOString(),
      },
      (ack: NetsAck) => cb?.(ack)
    );
  }

  /**
   * Prints every ticket for an already-confirmed booking, for whichever
   * payment method isn't NETS (NETS prints on its own inside the EXE right
   * after the terminal approves — see index.js's confirmAndPrintNetsPayment).
   * `ticketData` is the raw `{ ticketGroups, receipt, temple, customer,
   * splitMode }` shape returned by SSD-Backend's
   * GET /pos/booking/bookings/:id/ticket-groups — the EXE's own
   * ticketPrinter.js owns mapping that into a physical ticket, so it's never
   * duplicated here. A missing/not-yet-configured printer on the EXE isn't a
   * failure: it renders a preview image and queues the ticket to print
   * automatically once one is set up.
   */
  printTicket(payload: { orderId: string; ticketData: unknown; paymentMethod: "CASH" | "PAYNOW" | string }, cb?: (ack: NetsAck) => void) {
    if (!this.getConnectionStatus()) {
      cb?.({ status: "error", error: "Socket not connected to the Nets-Service EXE." });
      return;
    }
    this.socket!.emit(
      "terminal:print-ticket",
      {
        orderId: payload.orderId,
        ticketData: payload.ticketData,
        paymentMethod: payload.paymentMethod,
        timestamp: new Date().toISOString(),
      },
      (ack: NetsAck) => cb?.(ack)
    );
  }
}

const RELAYED_EVENTS = [
  "terminal:status:response",
  "terminal:logon:response",
  "terminal:payment:nets:response",
  "PAYMENT_MESSAGE",
  "STATUS_MESSAGE",
  "LOGON_MESSAGE",
];

/**
 * Two different shapes report terminal status, and conflating them produces
 * false "online" readings: an ACK just means "the EXE accepted the
 * request", not that the physical terminal answered. Ported from HEB's
 * NetsTerminalStatus.tsx (normalizeAckStatus / normalizeRealtimeStatus).
 */
export function normalizeAckStatus(data: NetsAck | Record<string, unknown> | null | undefined): TerminalStatus {
  if (!data) return "unknown";
  const terminalStatus = String((data as Record<string, unknown>).terminalStatus ?? "").toUpperCase();
  if (terminalStatus === "ONLINE" || terminalStatus === "READY") return "online";
  if (terminalStatus === "BUSY") return "busy";
  if (terminalStatus === "OFFLINE" || terminalStatus === "DISCONNECTED") return "offline";

  const status = String((data as Record<string, unknown>).status ?? (data as Record<string, unknown>).action ?? "").toUpperCase();
  if (status === "FAILED" || status === "ERROR") return "error";
  if (["SUCCESS", "COMPLETED", "INITIATED", "PENDING", "CONNECTING"].includes(status)) return "connecting";
  return "offline";
}

export function normalizeRealtimeStatus(data: Record<string, unknown> | null | undefined): TerminalStatus {
  if (!data) return "unknown";
  const status = String(data.status ?? "").toUpperCase();
  if (["ONLINE", "READY", "SUCCESS", "COMPLETED"].includes(status)) return "online";
  if (status === "BUSY") return "busy";
  if (["CONNECTING", "INITIATED", "PENDING"].includes(status)) return "connecting";
  if (status === "OFFLINE" || status === "DISCONNECTED") return "offline";
  if (status === "FAILED" || status === "ERROR") return "error";
  return "unknown";
}

export const netsSocketService = new NetsSocketService();
export default netsSocketService;
