"use client";

import { useEffect, useRef } from "react";

// Must match the CSS background grid cell size in globals.css.
const CELL = 72;

const DRAW_MS = 150; // time a single segment takes to draw itself
const HOLD_MS = 1500; // fully drawn before it starts fading
const FADE_MS = 1700; // fade to nothing
const LIFE = DRAW_MS + HOLD_MS + FADE_MS;

const SPAWN_MIN = 400; // gap between new paths
const SPAWN_MAX = 1500;
const MIN_STEPS = 2; // shortest path
const MAX_STEPS = 9; // longest path
const MAX_SEGMENTS = 140; // density cap

const TRAIL_RGB = "224, 164, 74"; // warm amber

type Segment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  born: number;
  alpha: number;
  width: number;
  last: boolean;
};

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));

/**
 * An ambient canvas: paths draw themselves along the grid lines at random
 * positions, lengths and weights, then fade out. Flat, thin amber lines — no
 * glow/neon. Disabled for reduced motion.
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

    /** Lay down one path: random origin, length, weight — drawn step by step. */
    const spawnPath = (now: number) => {
      if (segments.length > MAX_SEGMENTS) return;

      let x = snap(rand(0, width), cx);
      let y = snap(rand(0, height), cy);
      const steps = randInt(MIN_STEPS, MAX_STEPS);
      const alpha = rand(0.22, 0.5);
      const lineWidth = rand(1, 1.6);

      // Start along one axis, then turn at random — never doubling back.
      let horizontal = Math.random() < 0.5;
      let dir = Math.random() < 0.5 ? CELL : -CELL;

      for (let i = 0; i < steps; i++) {
        const x2 = horizontal ? x + dir : x;
        const y2 = horizontal ? y : y + dir;

        segments.push({
          x1: x,
          y1: y,
          x2,
          y2,
          born: now + i * DRAW_MS,
          alpha,
          width: lineWidth,
          last: i === steps - 1,
        });

        x = x2;
        y = y2;

        // Turn roughly a third of the time, otherwise keep going straight.
        if (Math.random() < 0.35) {
          horizontal = !horizontal;
          dir = Math.random() < 0.5 ? CELL : -CELL;
        }
      }
    };

    let nextSpawn = performance.now();

    let raf = 0;
    const render = () => {
      const now = performance.now();

      if (now >= nextSpawn) {
        spawnPath(now);
        nextSpawn = now + rand(SPAWN_MIN, SPAWN_MAX);
      }

      ctx.clearRect(0, 0, width, height);
      const next: Segment[] = [];

      for (const s of segments) {
        const age = now - s.born;
        if (age >= LIFE) continue; // expired
        next.push(s);
        if (age < 0) continue; // queued, not drawn yet

        // Grow from the start point, hold, then fade out.
        const grow = Math.min(age / DRAW_MS, 1);
        const fadeAge = age - DRAW_MS - HOLD_MS;
        const t = fadeAge <= 0 ? 1 : 1 - fadeAge / FADE_MS;
        // Smoothstep: lingers near full, then fades out gently.
        const alpha = t * t * (3 - 2 * t) * s.alpha;

        const ex = s.x1 + (s.x2 - s.x1) * grow;
        const ey = s.y1 + (s.y2 - s.y1) * grow;

        ctx.strokeStyle = `rgba(${TRAIL_RGB}, ${alpha})`;
        ctx.lineWidth = s.width;
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(ex, ey);
        ctx.stroke();

        // A small node at the leading end for a subtle "drawing" feel.
        if (s.last || grow < 1) {
          ctx.fillStyle = `rgba(${TRAIL_RGB}, ${alpha * 0.9})`;
          ctx.beginPath();
          ctx.arc(ex, ey, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      segments = next;
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(raf);
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
