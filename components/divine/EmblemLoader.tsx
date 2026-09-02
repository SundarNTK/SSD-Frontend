"use client";

import { useEffect, useState } from "react";

const RING = "/loader-decors/loder_ring.webp";
const LOGO = "/SSD_Logo.webp";

let assetsWarmed = false;

/** Decode the two PNGs once so later loaders paint without a network stall. */
export function warmLoaderAssets() {
  if (assetsWarmed || typeof window === "undefined") return;
  assetsWarmed = true;
  for (const src of [RING, LOGO]) {
    const img = new Image();
    img.src = src;
  }
}

const SIZE = {
  sm: { box: "h-[5.75rem] w-[5.75rem]", logo: "h-8" },
} as const;

/**
 * Shared admin / POS wait indicator. Two PNGs + CSS rotate only. Unmounts
 * as soon as the parent finishes — no minimum display time.
 */
export function EmblemLoader({
  size = "md",
  label,
}: {
  size?: "sm" | "md";
  label?: string;
}) {
  useEffect(() => {
    warmLoaderAssets();
  }, []);

  const box = size === "sm" ? SIZE.sm.box : "h-40 w-40";
  const logo = size === "sm" ? SIZE.sm.logo : "h-[4.25rem]";
  const starCount = size === "sm" ? 4 : 6;
  const radius = size === "sm" ? 42 : 44;
  const starPx = size === "sm" ? 7 : 10;

  return (
    <div className="flex flex-col items-center gap-2" role="status" aria-live="polite" aria-busy="true">
      <div className={`relative ${box}`}>
        <img
          src={RING}
          alt=""
          width={size === "sm" ? 92 : 160}
          height={size === "sm" ? 92 : 160}
          decoding="async"
          className="ldr-orbit-fast pointer-events-none absolute inset-0 h-full w-full object-contain"
        />
        <div className="ldr-orbit-rev pointer-events-none absolute inset-0">
          {Array.from({ length: starCount }, (_, i) => {
            const a = (i / starCount) * Math.PI * 2;
            return (
              <span
                key={i}
                className="absolute -translate-x-1/2 -translate-y-1/2 text-[#ffd54a]"
                style={{
                  left: `${50 + Math.cos(a) * radius}%`,
                  top: `${50 + Math.sin(a) * radius}%`,
                  fontSize: starPx,
                  lineHeight: 1,
                }}
              >
                ★
              </span>
            );
          })}
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <img
            src={LOGO}
            alt=""
            width={size === "sm" ? 32 : 68}
            height={size === "sm" ? 32 : 68}
            decoding="async"
            className={`ldr-bloom-lite object-contain ${logo} w-auto`}
          />
        </div>
      </div>
      {label && <p className="text-[12.5px] font-medium text-ink-500">{label}</p>}
    </div>
  );
}

export function EmblemLoaderScreen({ label = "Please wait…" }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] w-full flex-1 items-center justify-center bg-white">
      <EmblemLoader size="md" label={label} />
    </div>
  );
}

/**
 * Full-screen wait. Hidden for the first ~140ms so a fast request never
 * flashes a loader. Cleared the moment `show` is false — no linger.
 */
export function EmblemLoaderOverlay({
  show,
  label,
  delayMs = 140,
  className = "z-[70]",
}: {
  show: boolean;
  label?: string;
  delayMs?: number;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!show) {
      setVisible(false);
      return;
    }
    const t = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(t);
  }, [show, delayMs]);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center bg-white/80 ${className}`}
      role="alertdialog"
      aria-busy="true"
      aria-label={label ?? "Loading"}
    >
      <EmblemLoader size="md" label={label} />
    </div>
  );
}
