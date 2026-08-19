import MandalaRings from "./MandalaRings";
import GopuramSkyline from "./GopuramSkyline";

/**
 * The full backdrop shared by every auth screen — warm daylight wash, a
 * slow-rotating orange/gold/white/blue halo, a mandala, and a faint gopuram
 * line.
 *
 * No starfield or embers here: both were built for a night sky and read as
 * noise (near-invisible dots, a mix-blend-screen glow that just washes out)
 * against a bright cream page — they're dark-theme-only components and stay
 * unused rather than fighting the new palette.
 */
export default function DivineBackground() {
  return (
    <div className="fixed inset-0 -z-20 overflow-hidden bg-ivory-50">
      {/* base gradient wash */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-10%,rgba(212,175,55,0.16),transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_35%,rgba(212,175,55,0.10),transparent_65%)]" />

      {/* slow-rotating orange → gold → white → blue halo behind the card —
          huge and centered so the rotation never reveals a hard edge. */}
      <div
        className="animate-slow-spin absolute left-1/2 top-1/2 h-[160vmax] w-[160vmax] -translate-x-1/2 -translate-y-1/2 opacity-80"
        style={{
          background:
            "conic-gradient(from 0deg, rgba(255,140,45,0.20), rgba(212,175,55,0.20), rgba(255,255,255,0) 45%, rgba(255,255,255,0) 55%, rgba(63,111,168,0.20), rgba(255,140,45,0.20))",
        }}
      />

      <MandalaRings />
      <GopuramSkyline />

      {/* soft warm vignette to keep focus centered */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_45%,transparent_45%,rgba(180,140,80,0.14)_100%)]" />
    </div>
  );
}
