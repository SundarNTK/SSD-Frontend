"use client";

import { useEffect, useRef } from "react";

/**
 * POS sign-in: customer_login_bg.png fills the viewport, with falling
 * marigold petals only — no rotating rays.
 */
export default function PosLoginBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const colors = ["#FF6B35", "#FFA630", "#FFD23F", "#FF8A3D", "#E8590C"];
    type Petal = {
      x: number;
      y: number;
      r: number;
      vy: number;
      sway: number;
      swaySpeed: number;
      rot: number;
      rotSpeed: number;
      color: string;
    };
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
      particles = Array.from({ length: Math.round(width / 28) }, () => spawn(true));
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
        ctx!.globalAlpha = 0.72;
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
    <div className="absolute inset-0 z-0 overflow-hidden bg-[#2a1408]" aria-hidden="true">
      <img
        src="/customer_login_bg.png"
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-center max-md:object-[center_45%]"
      />

      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />
    </div>
  );
}
