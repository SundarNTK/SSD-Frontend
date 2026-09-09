"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { CartIcon, CloseIcon } from "../divine/icons";
import {
  IDLE_DISPLAY,
  POS_DISPLAY_CODE_PATTERN,
  customerDisplayPath,
  normalizeDisplayCode,
  type PosDisplayPayload,
} from "../../lib/posDisplay";
import { api, extractErrorMessage } from "../../lib/api";
import { SuccessModal } from "./SuccessModal";

function formatCurrency(v: number) {
  return `$${Number(v || 0).toFixed(2)}`;
}

const POLL_MS = 700;

export default function PosCustomerDisplayPage() {
  const searchParams = useSearchParams();
  const codeFromUrl = normalizeDisplayCode(searchParams.get("code") || "");
  const [typed, setTyped] = useState(codeFromUrl);
  const [code, setCode] = useState(codeFromUrl);
  const [payload, setPayload] = useState<PosDisplayPayload>(IDLE_DISPLAY);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linked, setLinked] = useState(false);
  // amountPaid strictly increases with each payment collected against a
  // booking (partial or final), so it doubles as a per-payment key: track
  // which one the customer already dismissed, and pop the celebration
  // again the moment a *different* payment (the next partial, or the
  // final one) lands — not on every poll tick of the same still-current
  // "done" payload.
  const [dismissedForAmount, setDismissedForAmount] = useState<number | null>(null);

  useEffect(() => {
    if (codeFromUrl.length === 6) {
      setCode(codeFromUrl);
      setTyped(codeFromUrl);
    }
  }, [codeFromUrl]);

  useEffect(() => {
    if (!POS_DISPLAY_CODE_PATTERN.test(code)) return;
    let cancelled = false;

    async function tick() {
      try {
        const res = await api.get<{
          success?: boolean;
          message?: string;
          data?: { payload?: PosDisplayPayload | null };
        }>(`/pos-display/session/${encodeURIComponent(code)}`);
        if (cancelled) return;
        setLinked(true);
        setLinkError(null);
        setPayload(res.data?.data?.payload ?? IDLE_DISPLAY);
      } catch (err) {
        if (cancelled) return;
        setLinked(false);
        setLinkError(extractErrorMessage(err));
      }
    }

    void tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [code]);

  const lines = payload.lines ?? [];
  const isPartial = payload.balanceDue > 0.005 && (payload.phase === "collecting" || payload.phase === "paynow" || payload.phase === "done" || payload.phase === "terminal");

  const donePartial = payload.balanceDue > 0.005 || payload.paymentStatus === "partial";
  const showSuccessModal =
    payload.phase === "done" && payload.amountPaid != null && dismissedForAmount !== payload.amountPaid;

  return (
    <div className="pos-flame-canvas flex h-screen w-full flex-col overflow-hidden text-ink-100">
      <SuccessModal
        open={showSuccessModal}
        onClose={() => setDismissedForAmount(payload.amountPaid ?? null)}
        title={donePartial ? "Partial Payment Success" : "Booking Success"}
        amountLabel={donePartial ? "Amount received now" : "Total amount paid"}
        amount={formatCurrency(donePartial ? payload.payingNow : payload.amountPaid ?? payload.payingNow)}
        amountPaid={formatCurrency(payload.amountPaid ?? payload.payingNow)}
        bookingNo={payload.bookingNumber ?? undefined}
        paymentMode={payload.mode ?? undefined}
        cta={donePartial ? "Continue" : "Thank You"}
        paymentHistory={payload.paymentHistory?.map((p) => ({ mode: p.mode, amount: formatCurrency(p.amount) }))}
      />
      <div aria-hidden className="h-1.5 shrink-0 bg-dark-orange" />
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-gold-400/40 bg-gradient-to-r from-[#FFFCF7] via-[#FFF3DE] to-[#FFE9C7] px-4 py-3">
        <img src="/SSD_Full_Logo.webp" alt="Sri Siva Durga Temple" className="h-12 w-auto max-w-[240px] object-contain sm:h-14" />
        <p className="font-accent text-[15px] font-extrabold tracking-tight text-[#7c1527] sm:text-[18px]">
          Customer Display
        </p>
      </header>

      {!POS_DISPLAY_CODE_PATTERN.test(code) ? (
        <PairingGate
          typed={typed}
          onTyped={setTyped}
          onJoin={() => {
            const next = normalizeDisplayCode(typed);
            if (POS_DISPLAY_CODE_PATTERN.test(next)) setCode(next);
          }}
        />
      ) : (
        <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden p-3 lg:grid-cols-[1.15fr_0.85fr] lg:p-5">
          <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[#7c1527]/30 bg-white/90 shadow-[0_16px_36px_-12px_rgba(0,0,0,0.28)]">
            <AnimatePresence>
              {payload.customerName && (
                <motion.div
                  key={payload.customerName}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  className="flex items-center justify-center gap-3 border-b border-gold-400/30 bg-gradient-to-r from-[#FFFCF7] via-[#FFF3DE] to-[#FFE9C7] px-4 py-2.5"
                >
                  <span aria-hidden className="h-px w-8 shrink-0 bg-gradient-to-r from-transparent to-gold-500/60 sm:w-12" />
                  <p className="flex shrink-0 items-baseline gap-1.5 whitespace-nowrap">
                    <span className="text-[12px] font-medium tracking-wide text-ink-500">Welcome,</span>
                    <span className="ssd-success-title font-accent text-[17px] font-extrabold tracking-wide">
                      {payload.customerName}
                    </span>
                  </p>
                  <span aria-hidden className="h-px w-8 shrink-0 bg-gradient-to-l from-transparent to-gold-500/60 sm:w-12" />
                </motion.div>
              )}
            </AnimatePresence>
            <div className="flex items-center justify-between bg-[#7c1527] px-4 py-3 text-white">
              <p className="flex items-center gap-2 font-accent text-[18px] font-extrabold">
                <CartIcon /> Your order
              </p>
              <span className="rounded-full bg-white/25 px-2.5 py-0.5 text-[12px] font-semibold">
                {lines.length}
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {lines.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
                  <p className="text-[16px] font-semibold text-ink-300">Waiting for items…</p>
                  <p className="text-[13px] text-ink-500">
                    {linked ? "The cashier will add offerings on the counter." : linkError || "Connecting…"}
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  <AnimatePresence initial={false}>
                    {lines.map((line, idx) => (
                      <motion.li
                        key={`${line.name}-${idx}`}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-start justify-between gap-3 rounded-xl border border-[#f0b4a0]/70 bg-white px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-semibold">{line.name}</p>
                          <p className="text-[12px] text-ink-500">Qty {line.quantity}</p>
                        </div>
                        <p className="shrink-0 text-[15px] font-bold text-[#7c1527]">
                          {formatCurrency(line.lineTotal)}
                        </p>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              )}
            </div>
          </section>

          <aside className="flex min-h-0 flex-col overflow-y-auto rounded-2xl border border-[#7c1527]/30 bg-white/90 p-4 shadow-[0_16px_36px_-12px_rgba(0,0,0,0.28)]">
            <Totals payload={payload} isPartial={isPartial} />
            <PaymentPanel payload={payload} />
            {linkError && !linked && (
              <p className="mt-3 rounded-lg border border-crimson-500/30 bg-crimson-500/10 px-3 py-2 text-[12px] text-crimson-500">
                {linkError}
              </p>
            )}
          </aside>
        </main>
      )}
    </div>
  );
}

function PairingGate({
  typed,
  onTyped,
  onJoin,
}: {
  typed: string;
  onTyped: (v: string) => void;
  onJoin: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-accent text-[22px] font-extrabold text-[#7c1527]">Connect to the counter</p>
      <p className="max-w-md text-[14px] text-ink-500">
        Enter the 6-character code shown on the POS (Customer Display), or open the full link the cashier copied.
      </p>
      <input
        value={typed}
        onChange={(e) => onTyped(normalizeDisplayCode(e.target.value))}
        maxLength={6}
        autoCapitalize="characters"
        className="w-48 rounded-xl border-2 border-[#7c1527]/40 bg-white px-4 py-3 text-center font-accent text-[28px] font-extrabold tracking-[0.35em] text-[#7c1527] outline-none focus:border-[#7c1527]"
        placeholder="CODE"
      />
      <button
        type="button"
        onClick={onJoin}
        className="rounded-md bg-[#7c1527] px-6 py-2.5 text-[14px] font-semibold text-white"
      >
        Show order
      </button>
    </div>
  );
}

function Totals({ payload, isPartial }: { payload: PosDisplayPayload; isPartial: boolean }) {
  return (
    <div className="space-y-2">
      <Row label="Total payable" value={formatCurrency(payload.grandTotal)} strong />
      {(payload.phase === "collecting" || payload.phase === "paynow" || payload.phase === "terminal") && (
        <Row label="Paying now" value={formatCurrency(payload.payingNow)} />
      )}
      {payload.phase === "done" && (
        <Row label="Amount paid" value={formatCurrency(payload.amountPaid ?? payload.payingNow)} />
      )}
      <div
        className={`flex items-center justify-between rounded-lg px-3 py-2 text-[14px] font-semibold ${
          isPartial ? "bg-crimson-500/10 text-crimson-500" : "bg-emerald-500/10 text-emerald-800"
        }`}
      >
        <span>Balance due</span>
        <span>{formatCurrency(payload.balanceDue)}</span>
      </div>
      {payload.phase !== "idle" && payload.phase !== "cart" && (payload.paymentHistory?.length ?? 0) > 0 && (
        <div className="rounded-xl border border-gold-500/20 bg-[#fff8e8] px-3 py-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[#8a5a10]">Already paid</p>
          <div className="space-y-1">
            {payload.paymentHistory!.map((p, i) => (
              <div key={i} className="flex items-center justify-between text-[12.5px]">
                <span className="text-[#5c3d0d]">{p.mode}</span>
                <span className="font-bold text-ink-100">{formatCurrency(p.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between text-[15px]">
      <span className="text-ink-300">{label}</span>
      <span className={strong ? "font-accent text-[22px] font-extrabold text-[#7c1527]" : "font-bold"}>
        {value}
      </span>
    </div>
  );
}

function PaymentPanel({ payload }: { payload: PosDisplayPayload }) {
  if (payload.phase === "idle") {
    return (
      <p className="mt-6 text-center text-[14px] text-ink-500">Welcome. Your order will appear here.</p>
    );
  }
  if (payload.phase === "paynow" && payload.qrImage) {
    return (
      <div className="mt-4 flex flex-col items-center text-center">
        <p className="font-accent text-[18px] font-extrabold text-ink-100">Scan to pay with PayNow</p>
        {payload.referenceId && <p className="mt-1 text-[12px] text-ink-500">Ref {payload.referenceId}</p>}
        <img
          src={payload.qrImage}
          alt="PayNow QR"
          className="mt-3 h-64 w-64 rounded-xl border border-gold-500/30 bg-white p-2 sm:h-72 sm:w-72"
        />
        <p className="mt-3 text-[26px] font-extrabold text-[#7c1527]">{formatCurrency(payload.payingNow)}</p>
        {payload.balanceDue > 0.005 && (
          <p className="mt-1 text-[13px] text-ink-500">
            This scan is for {formatCurrency(payload.payingNow)}. {formatCurrency(payload.balanceDue)} will remain.
          </p>
        )}
        <p className="mt-2 flex items-center gap-2 text-[13px] text-ink-500">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          Waiting for payment…
        </p>
      </div>
    );
  }
  if (payload.phase === "terminal") {
    return (
      <div className="mt-6 text-center">
        <p className="text-[40px]">💳</p>
        <p className="mt-2 font-accent text-[18px] font-extrabold">Please use the payment terminal</p>
        <p className="mt-1 text-[26px] font-extrabold text-[#7c1527]">{formatCurrency(payload.payingNow)}</p>
        <p className="mt-2 text-[13px] text-ink-500">{payload.statusMessage || payload.mode || "Follow the terminal"}</p>
      </div>
    );
  }
  if (payload.phase === "done") {
    const partial = (payload.paymentStatus === "partial" || payload.balanceDue > 0.005);
    return (
      <div className="mt-6 text-center">
        <p className="font-accent text-[22px] font-extrabold text-[#7c1527]">
          {partial ? "Partial payment received" : "Thank you"}
        </p>
        {payload.bookingNumber && (
          <p className="mt-1 text-[13px] text-ink-500">Booking {payload.bookingNumber}</p>
        )}
        {partial && (
          <p className="mt-3 text-[15px] font-semibold text-crimson-500">
            {formatCurrency(payload.balanceDue)} still due
          </p>
        )}
      </div>
    );
  }
  if (payload.phase === "collecting") {
    return (
      <p className="mt-6 text-center text-[14px] text-ink-500">
        Please wait while the cashier collects {formatCurrency(payload.payingNow)}
        {payload.mode ? ` (${payload.mode})` : ""}.
      </p>
    );
  }
  return <p className="mt-6 text-center text-[14px] text-ink-500">Review your items on the left.</p>;
}

export function useLanDisplayOrigin() {
  const [lanOrigin, setLanOrigin] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/pos-display/lan", { cache: "no-store" })
      .then((r) => r.json())
      .then((json: { data?: { primaryOrigin?: string | null } }) => {
        if (cancelled) return;
        setLanOrigin(json.data?.primaryOrigin || window.location.origin);
      })
      .catch(() => {
        if (!cancelled) setLanOrigin(window.location.origin);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return lanOrigin;
}

export function SecondScreenDetails({
  code,
  error,
  onClose,
}: {
  code: string;
  error?: string | null;
  onClose?: () => void;
}) {
  const lanOrigin = useLanDisplayOrigin();
  const [copied, setCopied] = useState(false);
  const origin = lanOrigin || "";
  const mobileUrl = origin
    ? `${origin}${code ? customerDisplayPath(code) : "/pos/display"}`
    : "";

  async function copyUrl() {
    if (!mobileUrl) return;
    try {
      await navigator.clipboard.writeText(mobileUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-2.5 text-left">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7c1527]">Second screen</p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded-full p-1 text-ink-500 hover:bg-black/5 hover:text-ink-100"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <p className="text-[11.5px] text-ink-500">Open this URL on your phone or tablet — any Wi-Fi with internet works.</p>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Pairing code</p>
        <p className="font-accent text-[26px] font-extrabold tracking-[0.28em] text-[#7c1527]">{code || "……"}</p>
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-500">Mobile URL</p>
        <p className="mt-0.5 break-all rounded-md bg-[#faf6f1] px-2 py-1.5 text-[12px] font-medium text-ink-100">
          {mobileUrl || "Looking up this link…"}
        </p>
      </div>
      {error && (
        <p className="rounded-md bg-crimson-500/10 px-2 py-1.5 text-[11px] text-crimson-500">{error}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!mobileUrl}
          onClick={copyUrl}
          className="rounded-md border border-[#ead9c6] px-3 py-1.5 text-[12px] font-semibold disabled:opacity-40"
        >
          {copied ? "Copied" : "Copy URL"}
        </button>
        <button
          type="button"
          disabled={!code}
          onClick={() => code && window.open(customerDisplayPath(code), "ssd-pos-display")}
          className="rounded-md bg-[#7c1527] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
        >
          Open on this PC
        </button>
      </div>
    </div>
  );
}

export function PosCustomerDisplayDock({ code, error }: { code: string; error?: string | null }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group relative flex items-center gap-2.5 overflow-hidden rounded-md border border-[#ead9c6] bg-white px-3.5 py-1.5 text-[#7a3d1a] shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:bg-[#faf6f1]"
      >
        <span className="relative flex h-6 w-6 items-center justify-center rounded-md bg-[#f6e4d4] text-[13px]">▣</span>
        <span aria-hidden className="h-4 w-px bg-[#ead9c6]" />
        <span className="whitespace-nowrap text-[13px] font-semibold">Second Screen</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute left-0 top-[calc(100%+8px)] z-40 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-gold-500/20 bg-white p-3 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.3)] sm:left-auto sm:right-0"
          >
            <SecondScreenDetails code={code} error={error} onClose={() => setOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
