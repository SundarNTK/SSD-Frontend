"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { CSSProperties } from "react";

/**
 * The gold/sparkle "Booking Successful!" celebration used by the POS
 * counter's own success popup (PosPortalPage's BookingSuccessView) —
 * pulled out here so PosCustomerDisplayPage's second-screen tablet can show
 * the exact same animation/UI for a payment landing, not a plainer
 * lookalike. The CSS keyframes it relies on (ssd-blast-ring, ssd-sc-ring,
 * ssd-gold-tick/ssd-sc-chk, ssd-success-title, ssd-print-paper,
 * ssd-gold-btn, ssd-flip-stamp, ssd-star-burst, ssd-star-fall,
 * ssd-spark-pop) live in app/globals.css, so any page can use this
 * component with no extra setup.
 */

const SSD_FALLING_STARS = [
  { dx: "-18vw", dy: "-8vh", delay: "0.02s", size: 14, dur: "1.55s" },
  { dx: "16vw", dy: "-12vh", delay: "0.08s", size: 11, dur: "1.7s" },
  { dx: "-28vw", dy: "2vh", delay: "0.14s", size: 9, dur: "1.85s" },
  { dx: "24vw", dy: "-4vh", delay: "0.05s", size: 13, dur: "1.6s" },
  { dx: "-8vw", dy: "-16vh", delay: "0.18s", size: 8, dur: "1.95s" },
  { dx: "10vw", dy: "-18vh", delay: "0.11s", size: 12, dur: "1.75s" },
  { dx: "-34vw", dy: "-6vh", delay: "0.22s", size: 10, dur: "2.05s" },
  { dx: "32vw", dy: "4vh", delay: "0.16s", size: 9, dur: "1.9s" },
  { dx: "-14vw", dy: "8vh", delay: "0.28s", size: 7, dur: "2.1s" },
  { dx: "20vw", dy: "10vh", delay: "0.2s", size: 11, dur: "1.8s" },
  { dx: "-22vw", dy: "-20vh", delay: "0.09s", size: 8, dur: "2s" },
  { dx: "6vw", dy: "-22vh", delay: "0.25s", size: 15, dur: "1.65s" },
  { dx: "-40vw", dy: "0vh", delay: "0.31s", size: 9, dur: "2.15s" },
  { dx: "38vw", dy: "-10vh", delay: "0.12s", size: 10, dur: "1.88s" },
  { dx: "0vw", dy: "-24vh", delay: "0.04s", size: 12, dur: "1.72s" },
  { dx: "-12vw", dy: "14vh", delay: "0.35s", size: 8, dur: "2.2s" },
];

const SSD_STAR_RAIN = [
  { left: "8%", delay: "0.38s", dur: "2.35s", size: 10 },
  { left: "18%", delay: "0.55s", dur: "2.55s", size: 8 },
  { left: "28%", delay: "0.42s", dur: "2.2s", size: 12 },
  { left: "38%", delay: "0.7s", dur: "2.7s", size: 7 },
  { left: "48%", delay: "0.48s", dur: "2.4s", size: 11 },
  { left: "58%", delay: "0.62s", dur: "2.5s", size: 9 },
  { left: "68%", delay: "0.4s", dur: "2.25s", size: 13 },
  { left: "78%", delay: "0.78s", dur: "2.65s", size: 8 },
  { left: "88%", delay: "0.52s", dur: "2.45s", size: 10 },
  { left: "12%", delay: "0.9s", dur: "2.8s", size: 7 },
  { left: "72%", delay: "0.85s", dur: "2.6s", size: 9 },
];

const SSD_BLAST_SPARKS = [
  { sx: "-72px", sy: "-48px", delay: "0s" },
  { sx: "80px", sy: "-40px", delay: "0.04s" },
  { sx: "-90px", sy: "18px", delay: "0.08s" },
  { sx: "96px", sy: "22px", delay: "0.06s" },
  { sx: "-40px", sy: "-88px", delay: "0.1s" },
  { sx: "36px", sy: "-92px", delay: "0.02s" },
  { sx: "-110px", sy: "-12px", delay: "0.12s" },
  { sx: "118px", sy: "-8px", delay: "0.09s" },
  { sx: "0px", sy: "70px", delay: "0.05s" },
  { sx: "-55px", sy: "64px", delay: "0.14s" },
];

function GoldStar({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#d4af37" aria-hidden>
      <path d="M12 1.8l2.55 6.62 7.15.42-5.5 4.46 1.78 6.92L12 16.7 6.02 20.22l1.78-6.92-5.5-4.46 7.15-.42L12 1.8z" />
    </svg>
  );
}

export function SuccessModal({
  open,
  onClose,
  title,
  amountLabel,
  amount,
  bookingNo,
  paymentMode,
  amountPaid,
  cta = "Continue",
  paymentHistory,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  amountLabel: string;
  amount: string;
  bookingNo?: string;
  paymentMode?: string;
  amountPaid?: string;
  cta?: string;
  /** Each payment collected against this booking so far (mode + already-
   * formatted amount) — shown as a breakdown instead of the single
   * Payment Mode cell once there's more than one, since a single mode no
   * longer says how the total was actually paid. */
  paymentHistory?: { mode: string; amount: string }[];
}) {
  const heading = title === "Booking Success" ? "Booking Successful!" : title;
  const paid = amountPaid ?? amount;
  const hasBreakdown = (paymentHistory?.length ?? 0) > 1;
  return (
    <AnimatePresence>
      {open && (
          <motion.div
            className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden p-3 sm:p-4 [perspective:1200px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
          >
          <motion.div
            className="absolute inset-0 bg-[#1a140c]/70 backdrop-blur-[16px]"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <div className="pointer-events-none absolute inset-0 z-[81] overflow-hidden">
            <span
              className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#d4af37]"
              style={{ animation: "ssd-blast-ring 0.85s ease-out 0.78s both" }}
            />
            <span
              className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#f6e59b]"
              style={{ animation: "ssd-blast-ring 1.15s ease-out 0.84s both" }}
            />
            <span
              className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#d4af37]/30"
              style={{ animation: "ssd-blast-ring 0.7s ease-out 0.78s both" }}
            />
            {SSD_BLAST_SPARKS.map((p, i) => (
              <span
                key={`spark-${i}`}
                className="absolute left-1/2 top-1/2 h-2 w-2 rounded-full bg-[#f6e59b] shadow-[0_0_10px_#d4af37]"
                style={
                  {
                    animation: `ssd-spark-pop 0.7s ease-out calc(0.78s + ${p.delay}) both`,
                    "--sx": p.sx,
                    "--sy": p.sy,
                  } as CSSProperties
                }
              />
            ))}
            {SSD_FALLING_STARS.map((s, i) => (
              <span
                key={`burst-${i}`}
                className="absolute left-1/2 top-[42%] drop-shadow-[0_0_6px_rgba(212,175,55,0.9)]"
                style={
                  {
                    animation: `ssd-star-burst ${s.dur} ease-out calc(0.78s + ${s.delay}) both`,
                    "--dx": s.dx,
                    "--dy": s.dy,
                  } as CSSProperties
                }
              >
                <GoldStar size={s.size} />
              </span>
            ))}
            {SSD_STAR_RAIN.map((s, i) => (
              <span
                key={`rain-${i}`}
                className="absolute top-0 drop-shadow-[0_0_5px_rgba(212,175,55,0.85)]"
                style={{
                  left: s.left,
                  animation: `ssd-star-fall ${s.dur} linear calc(0.82s + ${s.delay}) both`,
                }}
              >
                <GoldStar size={s.size} />
              </span>
            ))}
          </div>
          <motion.div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="ssd-flip-stamp relative z-[82] max-h-[calc(100dvh-1.5rem)] w-full max-w-[26rem] overflow-hidden rounded-[28px] border border-[#ffd54a]/60 bg-[#fffdf8] shadow-[0_28px_70px_rgba(40,24,8,0.45)]"
          >
            <div
              className="relative bg-[#f7efd8] bg-cover bg-[center_top] px-5 pb-2 pt-2 text-center"
              style={{ backgroundImage: "url('/Payment_Success_Popup_Background.webp')" }}
            >
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-[#d4af37]/70 bg-white/70 text-[#5c3d0d] transition hover:rotate-90 hover:bg-white"
              >
                ✕
              </button>
              <img
                src="/SSD_Full_Logo-Transparant.webp"
                alt="Sri Siva Durga Temple"
                className="relative z-10 mx-auto h-14 w-auto max-w-[210px] object-contain"
              />
              <div className="relative mx-auto mt-1.5 mb-1.5 flex h-14 w-14 items-center justify-center">
                <span
                  className="absolute inset-[-6px] rounded-full border border-[#d4af37]/50"
                  style={{ animation: "ssd-sc-ring 1.1s ease-out 0.82s both" }}
                />
                <span className="ssd-gold-tick relative z-10 flex h-14 w-14 items-center justify-center rounded-full">
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                    <polyline className="ssd-sc-chk" points="20 6 9 17 4 12" />
                  </svg>
                </span>
              </div>
              <h2 className="ssd-success-title relative font-display text-[26px] font-black leading-tight">
                {heading}
              </h2>
              <p className="relative mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#ef7d1a]">
                {amountLabel}
              </p>
              <p className="ssd-success-title relative mt-0.5 font-sans text-[32px] font-black tracking-tight">{amount}</p>
            </div>
            <div className="bg-white px-4 pb-3 pt-1.5">
              <div className="mb-3 flex h-4 items-center gap-2">
                <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[#ffd54a]" />
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#ffd54a" aria-hidden>
                  <path d="M12 2l1.8 5.4H19l-4.2 3.2 1.6 5.4L12 13.2 7.6 16l1.6-5.4L5 7.4h5.2L12 2z" />
                </svg>
                <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#ffd54a]" />
              </div>
              <div className={`grid ${hasBreakdown ? "grid-cols-2" : "grid-cols-3"} divide-x divide-[#ead9b4] text-center`}>
                <div className="px-2 py-1">
                  <svg className="mx-auto mb-1 h-5 w-5 text-[#e6b422]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                    <rect x="3" y="5" width="18" height="16" rx="2" />
                    <path d="M8 3v4M16 3v4M3 10h18" />
                  </svg>
                  <p className="text-[10px] text-ink-500">Booking ID</p>
                  <p className="mt-0.5 truncate font-sans text-[11.5px] font-bold text-ink-100">{bookingNo ?? "—"}</p>
                </div>
                <div className="px-2 py-1">
                  <svg className="mx-auto mb-1 h-5 w-5 text-[#e6b422]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                    <rect x="2" y="6" width="20" height="12" rx="2" />
                    <path d="M2 10h20" />
                  </svg>
                  <p className="text-[10px] text-ink-500">Amount Paid</p>
                  <p className="mt-0.5 font-sans text-[13px] font-bold text-ink-100">{paid}</p>
                </div>
                {!hasBreakdown && (
                  <div className="px-2 py-1">
                    <svg className="mx-auto mb-1 h-5 w-5 text-[#e6b422]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                      <rect x="2" y="7" width="20" height="12" rx="2" />
                      <path d="M6 11h4M16 15h2" />
                    </svg>
                    <p className="text-[10px] text-ink-500">Payment Mode</p>
                    <p className="mt-0.5 truncate font-sans text-[13px] font-bold text-ink-100">{paymentMode ?? "—"}</p>
                  </div>
                )}
              </div>
              {hasBreakdown && (
                <div className="mt-2.5 rounded-xl border border-[#ead9b4] bg-[#fff8e8] px-3 py-2">
                  <p className="mb-1 text-[9.5px] font-semibold uppercase tracking-wide text-[#8a5a10]">Paid across {paymentHistory!.length} payments</p>
                  <div className="space-y-1">
                    {paymentHistory!.map((p, i) => (
                      <div key={i} className="flex items-center justify-between text-[12.5px]">
                        <span className="text-[#5c3d0d]">{p.mode}</span>
                        <span className="font-bold text-ink-100">{p.amount}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-2.5 flex items-center justify-center gap-2 rounded-xl border border-[#ead9b4] bg-[#fff8e8] px-3 py-2">
                <span aria-hidden="true" className="relative flex h-7 w-8 shrink-0 items-center justify-center">
                  <svg width="26" height="20" viewBox="0 0 26 20" fill="none">
                    <rect x="4" y="6" width="18" height="9" rx="1.5" fill="#e6b422" />
                    <rect x="7" y="0.5" width="12" height="6.5" rx="1" fill="#fff" stroke="#e6b422" strokeWidth="1.2" />
                    <circle cx="18.5" cy="9.5" r="1" fill="#fff" />
                    <rect x="7.5" y="13.5" width="11" height="6" rx="0.8" fill="#fff" stroke="#e6b422" strokeWidth="1" />
                  </svg>
                  <span className="ssd-print-paper absolute left-1/2 top-[14px] h-2.5 w-3 -translate-x-1/2 border border-[#e6b422]/50 bg-white" />
                </span>
                <p className="text-left text-[11px] font-semibold leading-snug text-[#8a5a10]">
                  Your ticket is printing — please collect it at the counter.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="ssd-gold-btn mt-2 flex w-full items-center justify-center gap-1 rounded-2xl py-2.5 font-sans text-[15px] font-bold text-white shadow-[0_10px_24px_rgba(239,125,26,0.45)] transition hover:-translate-y-0.5"
              >
                {cta}
                <span aria-hidden>›</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
