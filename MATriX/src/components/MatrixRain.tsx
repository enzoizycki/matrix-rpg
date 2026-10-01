"use client";

import { useEffect, useRef } from "react";

/**
 * The iconic Matrix "digital rain" rendered on a fixed full-screen canvas
 * behind all content. Katakana + latin glyphs falling in green.
 */
export default function MatrixRain() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvasEl = ref.current;
    if (!canvasEl) return;
    const context = canvasEl.getContext("2d");
    if (!context) return;
    const canvas = canvasEl;
    const ctx = context;

    const glyphs =
      "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ﾊﾋｼﾂｦｨｩﾅｸ:.=*+-<>¦｜╌";
    const fontSize = 16;
    let columns = 0;
    let drops: number[] = [];
    let width = 0;
    let height = 0;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      columns = Math.floor(width / fontSize);
      drops = new Array(columns)
        .fill(0)
        .map(() => Math.floor((Math.random() * -height) / fontSize));
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);
    }

    function draw() {
      // Translucent black fade creates the trailing tail effect.
      ctx.fillStyle = "rgba(0, 0, 0, 0.06)";
      ctx.fillRect(0, 0, width, height);
      ctx.font = `${fontSize}px "Share Tech Mono", monospace`;

      for (let i = 0; i < drops.length; i++) {
        const char = glyphs[Math.floor(Math.random() * glyphs.length)];
        const x = i * fontSize;
        const y = drops[i] * fontSize;

        // Leading glyph is bright; the trail is dimmer green.
        if (Math.random() > 0.975) {
          ctx.fillStyle = "#d7ffe4";
        } else {
          ctx.fillStyle = "#00d64a";
        }
        ctx.fillText(char, x, y);

        if (y > height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
    }

    resize();
    window.addEventListener("resize", resize);

    if (reduce) {
      // Static faint frame only, no animation.
      draw();
      return () => window.removeEventListener("resize", resize);
    }

    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - last < 55) return; // ~18fps, classic choppy terminal cadence
      last = t;
      draw();
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="fixed inset-0 z-0 pointer-events-none"
      style={{ opacity: 0.28 }}
    />
  );
}
