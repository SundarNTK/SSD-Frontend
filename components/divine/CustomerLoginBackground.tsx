"use client";

import { useEffect, useRef } from "react";

/**
 * Customer Portal sign-in: cutomerLogin_bg.webp (Shiva stage-left, Durga
 * stage-right, an open golden sky between them) fills the viewport with a
 * slow Ken Burns drift. The card sits in that open sky, so decoration here
 * stays out of the centre third and instead frames the two deities —
 * a soft breathing halo behind each, and gold light-motes rising on the
 * left and right edges only.
 */
export default function CustomerLoginBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const colors = ["#FFE9A8", "#FFD54A", "#FFC24A", "#FFF3C4"];
    type Mote = {
      x: number;
      y: number;
      r: number;
      vy: number;
      sway: number;
      swaySpeed: number;
      twinkle: number;
      twinkleSpeed: number;
      color: string;
    };
    let particles: Mote[] = [];
    let raf = 0;
    let width = 0;
    let height = 0;

    // Spawned only in the left and right bands — the middle third stays
    // clear for the card and the painting's own open sky.
    function bandedX(): number {
      const onLeft = Math.random() < 0.5;
      return onLeft ? Math.random() * width * 0.36 : width * 0.64 + Math.random() * width * 0.36;
    }

    function spawn(initial?: boolean): Mote {
      return {
        x: bandedX(),
        y: initial ? Math.random() * height : height + 10 + Math.random() * height * 0.3,
        r: 1.2 + Math.random() * 2.3,
        vy: 0.28 + Math.random() * 0.4,
        sway: Math.random() * Math.PI * 2,
        swaySpeed: 0.01 + Math.random() * 0.016,
        twinkle: Math.random() * Math.PI * 2,
        twinkleSpeed: 0.02 + Math.random() * 0.03,
        color: colors[Math.floor(Math.random() * colors.length)],
      };
    }

    function resize() {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const rect = canvas!.parentElement!.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = Array.from({ length: Math.round(width / 26) }, () => spawn(true));
    }

    function tick() {
      ctx!.clearRect(0, 0, width, height);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.sway += p.swaySpeed;
        p.twinkle += p.twinkleSpeed;
        p.y -= p.vy;
        p.x += Math.sin(p.sway) * 0.4;
        const alpha = 0.35 + Math.sin(p.twinkle) * 0.35;
        ctx!.save();
        ctx!.globalAlpha = Math.max(0.05, alpha);
        ctx!.fillStyle = p.color;
        ctx!.shadowColor = p.color;
        ctx!.shadowBlur = 8;
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.restore();
        if (p.y < -20) particles[i] = spawn();
      }
      raf = requestAnimationFrame(tick);
    }

    resize();
    window.addEventListener("resize", resize);
    if (!reduced) raf = requestAnimationFrame(tick);
    else tick();

    return () => {
      window.removeEventListener("resize", resize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="absolute inset-0 z-0 overflow-hidden bg-[#2a1408]" aria-hidden="true">
      {/* The painting's own open-sky gap sits a touch right of the image's
          centre, so a dead-centre crop leaves the card closer to Shiva than
          to Durga. Nudging the whole image left (kept on its own wrapper,
          scaled up so no edge is exposed) re-centres the card in that gap
          without fighting the Ken Burns transform on the image itself. */}
      <div className="absolute inset-0 origin-center -translate-x-[3%] scale-[1.06]">
        <img
          src="/cutomerLogin_bg.webp"
          alt=""
          className="animate-portal-kenburns absolute inset-0 h-full w-full object-cover object-center max-md:object-[center_38%]"
        />
      </div>

      {/* breathing halo behind Shiva, stage-left — nudged with the image shift above */}
      <div
        className="animate-portal-glow pointer-events-none absolute left-[5%] top-[38%] h-[360px] w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-full max-md:hidden"
        style={{ background: "radial-gradient(circle, rgba(186,214,255,0.32), transparent 70%)" }}
      />
      {/* breathing halo behind Durga, stage-right, offset so the two never sync */}
      <div
        className="animate-portal-glow pointer-events-none absolute right-[11%] top-[34%] h-[380px] w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-full max-md:hidden"
        style={{ background: "radial-gradient(circle, rgba(255,214,138,0.38), transparent 70%)", animationDelay: "3s" }}
      />

      {/* faint gold halo centred behind the card, echoing the painting's own sunburst */}
      <div
        className="animate-soft-pulse pointer-events-none absolute left-1/2 top-[46%] h-[620px] w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,247,224,0.22), transparent 68%)" }}
      />

      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />

      {/* gentle top/bottom read so the header text and footer link stay legible over the photo */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/12 via-transparent to-black/30" />
    </div>
  );
}
