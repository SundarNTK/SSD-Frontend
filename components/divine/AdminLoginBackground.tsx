"use client";

import MandalaRings from "./MandalaRings";
import Starfield from "./Starfield";

/**
 * Admin sign-in: temple photo as the page background, with the original
 * rotating gold halo / mandala / stars at full strength (same as the
 * illustrated auth screens).
 */
export default function AdminLoginBackground() {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden bg-[#2a1408]" aria-hidden="true">
      <img
        src="/admin_login_bg.webp"
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-center max-md:object-[center_45%]"
      />

      <div
        className="animate-slow-spin absolute left-1/2 top-1/2 h-[160vmax] w-[160vmax] -translate-x-1/2 -translate-y-1/2 opacity-70"
        style={{
          background:
            "conic-gradient(from 0deg, rgba(194,65,12,0.4), rgba(255,213,74,0.38), rgba(255,255,255,0) 45%, rgba(255,255,255,0) 55%, rgba(234,88,12,0.35), rgba(194,65,12,0.4))",
        }}
      />

      <Starfield />
      <MandalaRings vivid />
    </div>
  );
}
