/** Concentric ornamental rings, slowly counter-rotating behind the shrine mark — pure decoration, low opacity. */
export default function MandalaRings({ vivid = false }: { vivid?: boolean }) {
  const svgTone = vivid
    ? "opacity-100 drop-shadow-[0_0_20px_rgba(234,88,12,0.7)]"
    : "opacity-[0.75] drop-shadow-[0_2px_10px_rgba(120,80,10,0.4)]";
  const svgToneRev = vivid
    ? "opacity-100 drop-shadow-[0_0_16px_rgba(250,204,21,0.55)]"
    : "opacity-[0.75] drop-shadow-[0_2px_6px_rgba(120,80,10,0.35)]";
  const gid = vivid ? "g1v" : "g1";
  const beadId = vivid ? "beadGoldV" : "beadGold";
  const petalId = vivid ? "petalGoldV" : "petalGold";

  return (
    <div
      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      aria-hidden="true"
    >
      <svg
        className={`animate-slow-spin h-[780px] w-[780px] md:h-[920px] md:w-[920px] ${svgTone}`}
        viewBox="0 0 200 200"
      >
        <circle cx="100" cy="100" r="96" fill="none" stroke={`url(#${gid})`} strokeWidth={vivid ? "1.05" : "0.6"} />
        <circle
          cx="100"
          cy="100"
          r="86"
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={vivid ? "0.55" : "0.35"}
          strokeDasharray="1 3"
        />
        {/* the "particles" — tiny gold beads instead of flat dash ticks, each
            with its own highlight/shadow so they read as gems, not lines */}
        {Array.from({ length: 24 }).map((_, i) => {
          const angle = (i / 24) * 360;
          return (
            <circle
              key={i}
              cx="100"
              cy="9"
              r="1.5"
              fill={`url(#${beadId})`}
              stroke={vivid ? "#c2410c" : "#7a5313"}
              strokeWidth="0.15"
              transform={`rotate(${angle} 100 100)`}
            />
          );
        })}
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={vivid ? "#fff3c4" : "#fff7dc"} />
            <stop offset="35%" stopColor={vivid ? "#ffd54a" : "#d4af37"} />
            <stop offset="70%" stopColor={vivid ? "#f97316" : "#d4af37"} />
            <stop offset="100%" stopColor={vivid ? "#c2410c" : "#8f6a1f"} />
          </linearGradient>
          <radialGradient id={beadId} cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor={vivid ? "#fff8e1" : "#fffaf0"} />
            <stop offset="40%" stopColor={vivid ? "#ffe566" : "#f0d17e"} />
            <stop offset="75%" stopColor={vivid ? "#fb923c" : "#d4af37"} />
            <stop offset="100%" stopColor={vivid ? "#ea580c" : "#8f6a1f"} />
          </radialGradient>
        </defs>
      </svg>

      <svg
        className={`animate-slow-spin-reverse absolute inset-0 h-[780px] w-[780px] md:h-[920px] md:w-[920px] ${svgToneRev}`}
        viewBox="0 0 200 200"
      >
        <circle cx="100" cy="100" r="70" fill="none" stroke={`url(#${gid})`} strokeWidth={vivid ? "0.5" : "0.3"} strokeDasharray="0.5 4" />
        {Array.from({ length: 16 }).map((_, i) => {
          const angle = (i / 16) * 360;
          return (
            <g key={i} transform={`rotate(${angle} 100 100)`}>
              {/* body — highlight-to-shadow gradient gives the leaf a
                  rounded, embossed metal look instead of a flat tint */}
              <path d="M100 30 Q104 40 100 50 Q96 40 100 30 Z" fill={`url(#${petalId})`} stroke={vivid ? "#c2410c" : "#7a5313"} strokeWidth="0.15" />
              <path d="M99.3 32.5 Q100.6 37 99.6 42" fill="none" stroke={vivid ? "#fff3c4" : "#fffaf0"} strokeWidth="0.4" strokeLinecap="round" opacity="0.85" />
            </g>
          );
        })}
        <defs>
          <linearGradient id={petalId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={vivid ? "#fff3c4" : "#fff7dc"} />
            <stop offset="30%" stopColor={vivid ? "#ffd54a" : "#f0d17e"} />
            <stop offset="65%" stopColor={vivid ? "#f97316" : "#d4af37"} />
            <stop offset="100%" stopColor={vivid ? "#c2410c" : "#8f6a1f"} />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
