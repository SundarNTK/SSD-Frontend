"use client";

import { useEffect, useRef } from "react";

/**
 * The POS login's alternate backdrop — "Marigold Aurora" warmed further
 * with a few sacred-radiance touches (rotating sunburst rays, a
 * color-shifting aurora overlay, a pulsing halo, drifting marigold petals)
 * rather than DivineBackground's cooler gold mandala-and-gopuram treatment.
 * Deliberately saturated — crimson/coral/gold/magenta, not pastel — since
 * the whole point is to read as more colorful and alive than the classic
 * variant, not just a re-tinted copy of it.
 */
export default function DivineBackgroundMarigold() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const colors = ["#FF6B35", "#E0396B", "#FFD23F", "#FF3D68", "#FFA630"];
    type Petal = { x: number; y: number; r: number; vy: number; sway: number; swaySpeed: number; rot: number; rotSpeed: number; color: string };
    let particles: Petal[] = [];
    let raf = 0;
    let width = 0;
    let height = 0;

    function spawn(initial?: boolean): Petal {
      return {
        x: Math.random() * width,
        y: initial ? Math.random() * height : -20 - Math.random() * height * 0.4,
        r: 5 + Math.random() * 5.5,
        vy: 0.45 + Math.random() * 0.7,
        sway: Math.random() * Math.PI * 2,
        swaySpeed: 0.008 + Math.random() * 0.014,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.03,
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
      particles = Array.from({ length: Math.round(width / 18) }, () => spawn(true));
    }

    function tick() {
      ctx!.clearRect(0, 0, width, height);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.sway += p.swaySpeed;
        p.rot += p.rotSpeed;
        p.y += p.vy;
        p.x += Math.sin(p.sway) * 0.5;
        ctx!.save();
        ctx!.translate(p.x, p.y);
        ctx!.rotate(p.rot);
        ctx!.fillStyle = p.color;
        ctx!.globalAlpha = 0.82;
        ctx!.shadowColor = p.color;
        ctx!.shadowBlur = 6;
        ctx!.beginPath();
        ctx!.ellipse(0, 0, p.r, p.r * 0.6, 0, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.restore();
        if (p.y > height + 20) particles[i] = spawn();
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
    <div className="pos-login-marigold-canvas fixed inset-0 -z-20 overflow-hidden">
      {/* slow color-shifting aurora — a rotating multi-hue conic layer blended
          over the wave gradient so the colors keep drifting into each other
          rather than the background just being one static blend. */}
      <div
        aria-hidden="true"
        className="animate-slow-spin-reverse absolute left-1/2 top-1/2 h-[170vmax] w-[170vmax] -translate-x-1/2 -translate-y-1/2 opacity-60 mix-blend-soft-light"
        style={{
          background:
            "conic-gradient(from 0deg, #ff3d68, #ffa630, #ffd23f, #ff6b35, #e0396b, #ff3d68)",
          filter: "blur(80px)",
        }}
      />

      {/* rotating sunburst rays — alternating crimson/gold bands for the "divine radiance" note */}
      <div
        aria-hidden="true"
        className="animate-slow-spin absolute left-1/2 top-1/2 h-[160vmax] w-[160vmax] -translate-x-1/2 -translate-y-1/2 opacity-70"
        style={{
          background:
            "repeating-conic-gradient(from 0deg, rgba(220,38,38,0.3) 0deg 3deg, transparent 3deg 9deg, rgba(255,210,63,0.32) 9deg 12deg, transparent 12deg 24deg)",
        }}
      />

      {/* dual pulsing halo behind the card — gold core, magenta bloom */}
      <div
        aria-hidden="true"
        className="animate-soft-pulse absolute left-1/2 top-1/2 h-[620px] w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,230,150,0.75), rgba(255,150,80,0.28) 45%, transparent 72%)" }}
      />
      <div
        aria-hidden="true"
        className="animate-soft-pulse absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70"
        style={{ background: "radial-gradient(circle, rgba(255,80,140,0.45), transparent 68%)", animationDelay: "1.4s" }}
      />

      <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />

      {/* soft warm vignette to keep focus centered — same finishing touch as DivineBackground */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_45%,transparent_40%,rgba(140,30,60,0.16)_100%)]" />
    </div>
  );
}
