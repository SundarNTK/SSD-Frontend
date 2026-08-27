import MandalaRings from "./MandalaRings";
import GopuramSkyline from "./GopuramSkyline";
import Starfield from "./Starfield";

/**
 * The full backdrop shared by every classic auth screen — a saturated
 * sunset wash (warm gold core fading to deep orange-red at the edges), a
 * slow-rotating flame/gold halo, sparkle stars, a mandala, a vivid gopuram
 * skyline, and a curved wave band along the very bottom edge.
 */
export default function DivineBackground() {
  return (
    <div className="fixed inset-0 -z-20 overflow-hidden bg-[#fff3c4]">
      {/* base sunset wash — warm gold core fading to deep orange-red at the
          edges, rather than the earlier flat pale-cream page */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_130%_100%_at_50%_-10%,#fff3c4_0%,#ffdf94_28%,#ffb85c_52%,#ff8a3d_74%,#e8590c_92%,#b3273f_100%)]" />

      {/* slow-rotating flame/gold halo behind the card — huge and centered
          so the rotation never reveals a hard edge */}
      <div
        className="animate-slow-spin absolute left-1/2 top-1/2 h-[160vmax] w-[160vmax] -translate-x-1/2 -translate-y-1/2 opacity-70"
        style={{
          background:
            "conic-gradient(from 0deg, rgba(255,122,46,0.28), rgba(212,175,55,0.28), rgba(255,255,255,0) 45%, rgba(255,255,255,0) 55%, rgba(179,39,63,0.24), rgba(255,122,46,0.28))",
        }}
      />

      <Starfield />
      <MandalaRings />
      <GopuramSkyline />

      {/* curved wave band along the very bottom edge — white bleeding into
          orange-to-crimson, echoing the reference's painted horizon line */}
      <svg
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[9vh] w-full"
        viewBox="0 0 1200 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M0 55 C 260 10, 520 90, 780 45 C 940 18, 1080 60, 1200 30 L1200 100 L0 100 Z" fill="url(#waveGrad)" />
        <defs>
          <linearGradient id="waveGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="35%" stopColor="#ffd23f" />
            <stop offset="65%" stopColor="#ff7a2e" />
            <stop offset="100%" stopColor="#c0341f" />
          </linearGradient>
        </defs>
      </svg>

      {/* soft warm vignette to keep focus centered */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_45%,transparent_45%,rgba(140,30,20,0.16)_100%)]" />
    </div>
  );
}
