"use client";

import { useEffect, useRef } from "react";

// Must match the CSS background grid cell size in globals.css.
const CELL = 72;
const LIFE = 2200; // ms a segment stays before fully fading
const MAX_STEPS = 48; // cap path length on fast mouse jumps
const TRAIL_RGB = "224, 164, 74"; // warm amber
const MAX_ALPHA = 0.5;

type Segment = { x1: number; y1: number; x2: number; y2: number; born: number };
type Node = { x: number; y: number };

/**
 * A pointer-driven canvas: as the cursor moves it traces the accent color along
 * the grid lines (Manhattan path between snapped intersections), leaving a trail
 * that fades out. Flat, thin lines — no glow/neon. Disabled for reduced motion.
 */
export function GridTrail() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches) return;

    let width = 0;
    let height = 0;
    let cx = 0; // grid phase center
    let cy = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      cx = width / 2;
      cy = height * 0.42; // align phase with the CSS grid position
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    // Snap a coordinate to the nearest grid line, keeping the same phase as CSS.
    const snap = (c: number, center: number) =>
      center + Math.round((c - center) / CELL) * CELL;

    let segments: Segment[] = [];
    let last: Node | null = null;

    const addSegment = (x1: number, y1: number, x2: number, y2: number, born: number) => {
      segments.push({ x1, y1, x2, y2, born });
    };

    const onMove = (e: PointerEvent) => {
      const nx = snap(e.clientX, cx);
      const ny = snap(e.clientY, cy);
      const now = performance.now();

      if (!last) {
        last = { x: nx, y: ny };
        return;
      }
      if (nx === last.x && ny === last.y) return;

      // Walk an L-path along grid lines: horizontal first, then vertical.
      const stepsX = Math.abs(nx - last.x) / CELL;
      const stepsY = Math.abs(ny - last.y) / CELL;
      if (stepsX + stepsY > MAX_STEPS) {
        // Too far (fast jump / re-entry) — restart trail without drawing a giant line.
        last = { x: nx, y: ny };
        return;
      }

      const dirX = Math.sign(nx - last.x) * CELL;
      let x = last.x;
      const y0 = last.y;
      while (x !== nx) {
        addSegment(x, y0, x + dirX, y0, now);
        x += dirX;
      }
      const dirY = Math.sign(ny - last.y) * CELL;
      let y = last.y;
      while (y !== ny) {
        addSegment(nx, y, nx, y + dirY, now);
        y += dirY;
      }
      last = { x: nx, y: ny };
    };

    let raf = 0;
    const render = () => {
      const now = performance.now();
      ctx.clearRect(0, 0, width, height);
      const next: Segment[] = [];
      for (const s of segments) {
        const age = now - s.born;
        if (age >= LIFE) continue;
        next.push(s);
        const t = 1 - age / LIFE;
        // Smoothstep: lingers near full, then fades out gently.
        const alpha = t * t * (3 - 2 * t) * MAX_ALPHA;
        ctx.strokeStyle = `rgba(${TRAIL_RGB}, ${alpha})`;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
        ctx.stroke();
        // A small node at the leading end for a subtle "drawing" feel.
        ctx.fillStyle = `rgba(${TRAIL_RGB}, ${alpha * 0.9})`;
        ctx.beginPath();
        ctx.arc(s.x2, s.y2, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      segments = next;
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10"
    />
  );
}
