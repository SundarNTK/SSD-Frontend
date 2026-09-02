"use client";

const LOGO = "/SSD_Logo.webp";

const STYLES = [
  { id: "emblem-ring", kind: "common" as const, title: "Emblem ring", note: "Ornate gold-red ring spins; temple mark stays in the centre with gold stars." },
  { id: "logo-pulse", kind: "common" as const, title: "Logo pulse", note: "Temple mark at the centre, gold rings — page / list loading." },
  { id: "logo-orbit", kind: "common" as const, title: "Logo orbit", note: "Mark stays still; a gold dashed ring spins around it." },
  { id: "logo-stamp", kind: "common" as const, title: "Logo stamp", note: "Short stamp-in, then a soft pulse — overlay loader." },
  { id: "logo-arc", kind: "common" as const, title: "Logo progress arc", note: "Circular progress around the mark." },
  { id: "card-scan", kind: "payment" as const, title: "Card scan", note: "Card with a moving scan line — card / NETS style." },
  { id: "cash-count", kind: "payment" as const, title: "Cash count", note: "Notes stacking and a running total — cash collection." },
  { id: "coin-slot", kind: "payment" as const, title: "Coin slot", note: "Coins dropping into a till — cash in." },
  { id: "pos-auth", kind: "payment" as const, title: "POS authorizing", note: "Terminal + amount + bar — wait, do not close." },
];

function LogoMark({ className = "h-20 w-auto" }: { className?: string }) {
  return <img src={LOGO} alt="Sri Siva Durga Temple" className={`object-contain ${className}`} />;
}

function GoldStar({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#ffd54a" className="drop-shadow-[0_0_6px_#f5a623]" aria-hidden>
      <path d="M12 1.8l2.55 6.62 7.15.42-5.5 4.46 1.78 6.92L12 16.7 6.02 20.22l1.78-6.92-5.5-4.46 7.15-.42L12 1.8z" />
    </svg>
  );
}

function EmblemRing({ size = "md" }: { size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-[22rem] w-[22rem]" : "h-48 w-48";
  const ring = size === "lg" ? "h-[22rem] w-[22rem]" : "h-48 w-48";
  const logo = size === "lg" ? "h-[7.5rem]" : "h-[4.4rem]";
  const stars = size === "lg" ? 12 : 8;
  const radius = size === "lg" ? 46 : 44;

  return (
    <div className={`relative ${box}`}>
      <span className="absolute left-1/2 top-1/2 h-[70%] w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#7c1527]/35 blur-3xl" />
      <span className="ldr-ring absolute inset-[8%] rounded-full border border-[#ffd54a]/50" />
      <span className="ldr-ring absolute inset-[8%] rounded-full border-2 border-[#ef7d1a]/40" style={{ animationDelay: "0.55s" }} />

      <img
        src="/loader-decors/loder_ring.webp"
        alt=""
        className={`ldr-orbit-fast pointer-events-none absolute inset-0 ${ring} object-contain drop-shadow-[0_0_28px_rgba(255,80,40,0.45)]`}
      />

      <div className="ldr-orbit-rev pointer-events-none absolute inset-0">
        {Array.from({ length: stars }).map((_, i) => {
          const angle = (i / stars) * Math.PI * 2;
          const left = 50 + Math.cos(angle) * radius;
          const top = 50 + Math.sin(angle) * radius;
          return (
            <span
              key={i}
              className="ldr-spark absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${left}%`, top: `${top}%`, animationDelay: `${i * 0.1}s` }}
            >
              <GoldStar size={size === "lg" ? 14 : 10} />
            </span>
          );
        })}
      </div>

      <div className="absolute inset-0 flex items-center justify-center">
        <LogoMark
          className={`ldr-bloom relative z-10 ${logo} w-auto drop-shadow-[0_0_22px_rgba(255,213,74,0.55)]`}
        />
      </div>
    </div>
  );
}

function GoldRings() {
  return (
    <>
      <span className="ldr-ring absolute inset-4 rounded-full border-2 border-[#ffd54a]/70" />
      <span className="ldr-ring absolute inset-4 rounded-full border border-[#f5a623]/45" style={{ animationDelay: "0.5s" }} />
    </>
  );
}

function LogoPulse() {
  return (
    <div className="relative flex h-44 w-44 items-center justify-center">
      <GoldRings />
      <LogoMark className="ldr-bloom relative z-10 h-[4.75rem] w-auto drop-shadow-[0_0_18px_rgba(255,213,74,0.45)]" />
    </div>
  );
}

function LogoOrbit() {
  return (
    <div className="relative flex h-44 w-44 items-center justify-center">
      <span className="ldr-orbit absolute inset-3 rounded-full border-2 border-dashed border-[#d4af37]/55" />
      <span className="absolute h-24 w-24 rounded-full bg-[#f5a623]/15 blur-xl" />
      <LogoMark className="relative z-10 h-[4.75rem] w-auto" />
    </div>
  );
}

function LogoStamp() {
  return (
    <div className="relative flex h-44 w-44 items-center justify-center">
      <span className="ldr-pulse-glow absolute h-28 w-28 rounded-full" />
      <LogoMark className="ssd-flip-stamp relative z-10 h-20 w-auto drop-shadow-[0_8px_20px_rgba(0,0,0,0.45)]" />
    </div>
  );
}

function LogoArc() {
  return (
    <div className="relative flex h-44 w-44 items-center justify-center">
      <svg className="absolute h-36 w-36 -rotate-90" viewBox="0 0 100 100" aria-hidden>
        <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,213,74,0.18)" strokeWidth="4" />
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke="#ffd54a"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray="264"
          strokeDashoffset="180"
          className="ldr-spin-slow origin-center"
          style={{ transformOrigin: "50% 50%" }}
        />
      </svg>
      <LogoMark className="relative z-10 h-16 w-auto" />
    </div>
  );
}

function CardScan() {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative h-24 w-40 overflow-hidden rounded-xl border-2 border-[#ffd54a] bg-gradient-to-br from-[#2a1808] to-[#0f0a06] shadow-[0_12px_28px_-12px_rgba(0,0,0,0.6)]">
        <div className="absolute left-3 top-3 h-7 w-9 rounded-sm bg-[#d4af37]/80" />
        <div className="absolute right-3 top-3 h-2 w-10 rounded-full bg-white/25" />
        <div className="absolute bottom-3 left-3 right-8 h-1.5 rounded-full bg-white/20" />
        <div className="absolute bottom-6 left-3 right-12 h-1.5 rounded-full bg-white/12" />
        <span className="ldr-scan absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-transparent via-[#ffd54a]/70 to-transparent" />
      </div>
      <p className="text-[12px] font-semibold tracking-wide text-[#ffe082]">Reading card…</p>
    </div>
  );
}

function CashCount() {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-28 w-36">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="ldr-float absolute left-1/2 h-14 w-24 -translate-x-1/2 rounded-md border border-[#c9a227] bg-gradient-to-br from-[#1b5e20] to-[#2e7d32] shadow-md"
            style={{ top: 8 + i * 10, animationDelay: `${i * 0.18}s`, zIndex: i }}
          >
            <span className="absolute left-2 top-1.5 text-[10px] font-bold text-[#c8e6c9]">S$</span>
            <span className="absolute inset-0 flex items-center justify-center font-display text-[18px] font-black text-[#e8f5e9]">
              50
            </span>
          </div>
        ))}
      </div>
      <p className="tabular-nums text-[13px] font-bold text-[#ffe082]">Counting cash…</p>
    </div>
  );
}

function CoinSlot() {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative h-32 w-40">
        <span className="ldr-coin absolute left-[18%] top-0 z-10 h-8 w-8 rounded-full border-2 border-[#b8860b] bg-gradient-to-br from-[#ffe082] to-[#d4a017] text-center text-[11px] font-black leading-8 text-[#5c3d0d]">$</span>
        <span className="ldr-coin absolute left-[42%] top-0 z-10 h-8 w-8 rounded-full border-2 border-[#b8860b] bg-gradient-to-br from-[#ffe082] to-[#d4a017] text-center text-[11px] font-black leading-8 text-[#5c3d0d]" style={{ animationDelay: "0.4s" }}>$</span>
        <span className="ldr-coin absolute left-[64%] top-0 z-10 h-8 w-8 rounded-full border-2 border-[#b8860b] bg-gradient-to-br from-[#ffe082] to-[#d4a017] text-center text-[11px] font-black leading-8 text-[#5c3d0d]" style={{ animationDelay: "0.8s" }}>$</span>
        <div className="absolute bottom-2 left-1/2 h-16 w-28 -translate-x-1/2 rounded-lg border-2 border-[#8f6a1f] bg-[#1a1208]">
          <div className="mx-auto mt-2 h-2 w-16 rounded-full bg-black/80" />
          <p className="mt-2 text-center text-[10px] font-bold uppercase tracking-wider text-[#d4af37]">Till</p>
        </div>
      </div>
      <p className="text-[12px] font-semibold text-[#ffe082]">Receiving cash…</p>
    </div>
  );
}

function PosAuth({ compact }: { compact?: boolean }) {
  return (
    <div className={`flex w-full flex-col items-center ${compact ? "max-w-sm" : "max-w-md"}`}>
      <LogoMark className="mb-3 h-10 w-auto opacity-90" />
      <div className="w-full rounded-2xl border border-[#d4af37]/40 bg-[#1a1008] px-5 py-4 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.7)]">
        <p className="text-center text-[10px] font-bold uppercase tracking-[0.18em] text-[#f5a623]">POS terminal</p>
        <p className="mt-2 text-center font-sans text-[28px] font-black tabular-nums text-[#ffe082]">$ —</p>
        <p className="mt-1 text-center text-[13px] font-semibold text-white">Authorizing payment…</p>
        <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-white/10">
          <span className="ldr-shimmer absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-[#ffd54a] to-transparent" />
        </div>
        <p className="mt-2 text-center text-[11px] text-[#e8d5a8]/75">Do not close or refresh this window.</p>
      </div>
    </div>
  );
}

function LoaderById({ id, compact }: { id: string; compact?: boolean }) {
  switch (id) {
    case "emblem-ring":
      return <EmblemRing size={compact ? "md" : "lg"} />;
    case "logo-pulse":
      return <LogoPulse />;
    case "logo-orbit":
      return <LogoOrbit />;
    case "logo-stamp":
      return <LogoStamp />;
    case "logo-arc":
      return <LogoArc />;
    case "card-scan":
      return <CardScan />;
    case "cash-count":
      return <CashCount />;
    case "coin-slot":
      return <CoinSlot />;
    case "pos-auth":
      return <PosAuth compact={compact} />;
    default:
      return null;
  }
}

export default function LoaderPreviewPage() {
  return (
    <div className="min-h-screen bg-[#140a06] px-4 py-8 text-[#fff8e8] sm:px-8">
      <div className="mx-auto max-w-6xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#f5a623]">Sample gallery</p>
        <h1 className="mt-1 font-display text-[32px] font-bold text-[#ffe082]">Loaders</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-[#e8d5a8]/85">
          The featured common loader is the spinning ceremonial ring with{" "}
          <code className="rounded bg-white/10 px-1">SSD_Logo.webp</code> in the centre. Payment loaders stay
          card / cash / terminal. Open{" "}
          <code className="rounded bg-white/10 px-1.5 py-0.5 text-[12px]">/loader-preview</code>.
        </p>

        <div className="mt-8 overflow-hidden rounded-3xl border border-[#d4af37]/40 bg-[#120806] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)]">
          <div className="flex min-h-[26rem] flex-col items-center justify-center bg-[radial-gradient(ellipse_at_center,rgba(124,21,39,0.45),transparent_62%)] py-10">
            <EmblemRing size="lg" />
            <p className="mt-6 font-display text-[18px] font-bold text-[#ffe082]">Please wait…</p>
            <p className="text-[12px] text-[#e8d5a8]/70">id: emblem-ring</p>
          </div>
        </div>

        <h2 className="mt-10 mb-3 font-display text-[20px] font-bold text-[#ffd54a]">Common (page / wait)</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {STYLES.filter((s) => s.kind === "common").map((s) => (
            <article
              key={s.id}
              className="overflow-hidden rounded-2xl border border-[#d4af37]/35 bg-[#1f100a]/90 shadow-[0_16px_40px_-18px_rgba(0,0,0,0.7)]"
            >
              <div className="flex min-h-[13rem] items-center justify-center bg-gradient-to-b from-[#2a140c] to-[#120806] p-4">
                <LoaderById id={s.id} compact />
              </div>
              <div className="border-t border-[#d4af37]/25 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#f5a623]">Common · {s.id}</p>
                <h3 className="mt-0.5 font-display text-[17px] font-bold">{s.title}</h3>
                <p className="mt-1 text-[12.5px] leading-snug text-[#e8d5a8]/75">{s.note}</p>
              </div>
            </article>
          ))}
        </div>

        <h2 className="mt-10 mb-3 font-display text-[20px] font-bold text-[#ffd54a]">Payment processing</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {STYLES.filter((s) => s.kind === "payment").map((s) => (
            <article
              key={s.id}
              className="overflow-hidden rounded-2xl border border-[#ef7d1a]/40 bg-[#1f100a]/90 shadow-[0_16px_40px_-18px_rgba(0,0,0,0.7)]"
            >
              <div className="flex min-h-[15rem] items-center justify-center bg-gradient-to-b from-[#32150c] to-[#120806] p-4">
                <LoaderById id={s.id} compact />
              </div>
              <div className="border-t border-[#ef7d1a]/30 px-4 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#ef7d1a]">Payment · {s.id}</p>
                <h3 className="mt-0.5 font-display text-[17px] font-bold">{s.title}</h3>
                <p className="mt-1 text-[12.5px] leading-snug text-[#e8d5a8]/75">{s.note}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
