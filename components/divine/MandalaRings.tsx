/** Concentric ornamental rings, slowly counter-rotating behind the shrine mark — pure decoration, low opacity. */
export default function MandalaRings() {
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2"
      aria-hidden="true"
    >
      <svg
        className="animate-slow-spin h-[780px] w-[780px] opacity-[0.75] drop-shadow-[0_2px_10px_rgba(120,80,10,0.4)] md:h-[920px] md:w-[920px]"
        viewBox="0 0 200 200"
      >
        <circle cx="100" cy="100" r="96" fill="none" stroke="url(#g1)" strokeWidth="0.6" />
        <circle
          cx="100"
          cy="100"
          r="86"
          fill="none"
          stroke="url(#g1)"
          strokeWidth="0.35"
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
              fill="url(#beadGold)"
              stroke="#7a5313"
              strokeWidth="0.15"
              transform={`rotate(${angle} 100 100)`}
            />
          );
        })}
        <defs>
          <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fff7dc" />
            <stop offset="45%" stopColor="#d4af37" />
            <stop offset="100%" stopColor="#8f6a1f" />
          </linearGradient>
          <radialGradient id="beadGold" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#fffaf0" />
            <stop offset="40%" stopColor="#f0d17e" />
            <stop offset="75%" stopColor="#d4af37" />
            <stop offset="100%" stopColor="#8f6a1f" />
          </radialGradient>
        </defs>
      </svg>

      <svg
        className="animate-slow-spin-reverse absolute inset-0 h-[780px] w-[780px] opacity-[0.75] drop-shadow-[0_2px_6px_rgba(120,80,10,0.35)] md:h-[920px] md:w-[920px]"
        viewBox="0 0 200 200"
      >
        <circle cx="100" cy="100" r="70" fill="none" stroke="url(#g1)" strokeWidth="0.3" strokeDasharray="0.5 4" />
        {Array.from({ length: 16 }).map((_, i) => {
          const angle = (i / 16) * 360;
          return (
            <g key={i} transform={`rotate(${angle} 100 100)`}>
              {/* body — highlight-to-shadow gradient gives the leaf a
                  rounded, embossed metal look instead of a flat tint */}
              <path d="M100 30 Q104 40 100 50 Q96 40 100 30 Z" fill="url(#petalGold)" stroke="#7a5313" strokeWidth="0.15" />
              {/* specular shine — a small bright streak near the top,
                  the detail that actually reads as "3D" rather than flat */}
              <path d="M99.3 32.5 Q100.6 37 99.6 42" fill="none" stroke="#fffaf0" strokeWidth="0.4" strokeLinecap="round" opacity="0.85" />
            </g>
          );
        })}
        <defs>
          <linearGradient id="petalGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#fff7dc" />
            <stop offset="35%" stopColor="#f0d17e" />
            <stop offset="70%" stopColor="#d4af37" />
            <stop offset="100%" stopColor="#8f6a1f" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}
