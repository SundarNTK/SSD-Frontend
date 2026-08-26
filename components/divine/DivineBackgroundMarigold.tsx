"use client";

import { useEffect, useRef } from "react";

/**
 * The POS login's alternate backdrop — "Marigold Aurora" warmed further
 * with a few sacred-radiance touches (rotating sunburst rays, a pulsing
 * halo, drifting marigold petals) rather than DivineBackground's cooler
 * gold mandala-and-gopuram treatment. Reuses the POS counter's own
 * pos-flame-canvas wave gradient as the base, so the login screen and the
 * counter screen read as the same world.
 */
export default function DivineBackgroundMarigold() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const colors = ["#E8891A", "#FF6B35", "#FFB74D", "#E0396B"];
    type Petal = { x: number; y: number; r: number; vy: number; sway: number; swaySpeed: number; rot: number; rotSpeed: number; color: string };
    let particles: Petal[] = [];
    let raf = 0;
    let width = 0;
    let height = 0;

    function spawn(initial?: boolean): Petal {
      return {
        x: Math.random() * width,
        y: initial ? Math.random() * height : -20 - Math.random() * height * 0.4,
        r: 3 + Math.random() * 3.5,
        vy: 0.35 + Math.random() * 0.5,
        sway: Math.random() * Math.PI * 2,
        swaySpeed: 0.006 + Math.random() * 0.012,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.025,
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
      particles = Array.from({ length: Math.round(width / 34) }, () => spawn(true));
    }

    function tick() {
      ctx!.clearRect(0, 0, width, height);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.sway += p.swaySpeed;
        p.rot += p.rotSpeed;
        p.y += p.vy;
        p.x += Math.sin(p.sway) * 0.4;
        ctx!.save();
        ctx!.translate(p.x, p.y);
        ctx!.rotate(p.rot);
        ctx!.fillStyle = p.color;
        ctx!.globalAlpha = 0.55;
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
    <div className="pos-flame-canvas fixed inset-0 -z-20 overflow-hidden">
      {/* rotating sunburst rays — the "divine radiance" note the flame gradient alone doesn't carry */}
      <div
        aria-hidden="true"
        className="animate-slow-spin absolute left-1/2 top-1/2 h-[160vmax] w-[160vmax] -translate-x-1/2 -translate-y-1/2 opacity-40"
        style={{ background: "repeating-conic-gradient(from 0deg, rgba(232,137,26,0.22) 0deg 3deg, transparent 3deg 18deg)" }}
      />

      {/* soft pulsing halo behind the card */}
      <div
        aria-hidden="true"
        className="animate-soft-pulse absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,236,180,0.55), rgba(255,180,90,0.18) 45%, transparent 72%)" }}
      />

      <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />

      {/* soft warm vignette to keep focus centered — same finishing touch as DivineBackground */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_45%,transparent_45%,rgba(180,90,40,0.12)_100%)]" />
    </div>
  );
}
