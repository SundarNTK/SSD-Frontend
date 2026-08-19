"use client";

import { useEffect, useRef } from "react";

type Ember = {
  x: number;
  y: number;
  r: number;
  vy: number;
  drift: number;
  hue: number;
  alpha: number;
  life: number;
  maxLife: number;
};

/**
 * Rising embers, like sparks lifting off a diya flame — slow, warm, sparse.
 * Canvas rather than DOM nodes so a few hundred particles stay cheap.
 */
export default function EmberField() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let width = 0;
    let height = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let embers: Ember[] = [];

    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const spawn = (): Ember => ({
      x: Math.random() * width,
      y: height + Math.random() * 100,
      r: Math.random() * 2 + 0.6,
      vy: Math.random() * 0.5 + 0.25,
      drift: (Math.random() - 0.5) * 0.4,
      hue: Math.random() > 0.5 ? 38 : 28,
      alpha: Math.random() * 0.5 + 0.4,
      life: 0,
      maxLife: Math.random() * 400 + 400,
    });

    const target = 70;
    embers = Array.from({ length: target }, spawn);

    let raf = 0;
    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      for (let i = 0; i < embers.length; i++) {
        const e = embers[i];
        e.y -= e.vy;
        e.x += e.drift + Math.sin(e.life * 0.02) * 0.3;
        e.life += 1;

        const fade = 1 - e.life / e.maxLife;
        const a = Math.max(0, e.alpha * fade);

        ctx.beginPath();
        const grad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 4);
        grad.addColorStop(0, `hsla(${e.hue}, 100%, 70%, ${a})`);
        grad.addColorStop(1, `hsla(${e.hue}, 100%, 60%, 0)`);
        ctx.fillStyle = grad;
        ctx.arc(e.x, e.y, e.r * 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.fillStyle = `hsla(${e.hue}, 100%, 82%, ${a})`;
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fill();

        if (e.life > e.maxLife || e.y < -20) {
          embers[i] = spawn();
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.removeEventListener("resize", resize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full mix-blend-screen"
      aria-hidden="true"
    />
  );
}
