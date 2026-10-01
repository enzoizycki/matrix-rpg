"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { FATE, parseDiceGroups } from "@/lib/dice";
import TerminalIcon from "@/components/TerminalIcon";
import type { MatrixResolution } from "@/lib/matrix/types";

type Shape = {
  outline: string;
  edges: string;
  facets: string[];
  x: number;
  y: number;
  fontSize: number;
};

/** Distinct polyhedral silhouettes, shared by the dice and their selector icons. */
export function shapeFor(sides: number): Shape {
  switch (sides) {
    case FATE:
    case 6:
      return {
        outline: "12,26 30,8 88,8 88,66 70,86 12,86",
        edges: "M12 26H70V86M70 26 88 8M70 86 88 66",
        facets: ["12,26 30,8 88,8 70,26", "70,26 88,8 88,66 70,86"],
        x: 41, y: 57, fontSize: sides === FATE ? 35 : 29,
      };
    case 4:
      return {
        outline: "50,6 94,87 6,87",
        edges: "M50 6V59L6 87M50 59 94 87",
        facets: ["50,6 50,59 6,87", "50,59 94,87 6,87"],
        x: 50, y: 69, fontSize: 25,
      };
    case 8:
      return {
        outline: "50,4 91,48 50,96 9,48",
        edges: "M9 48H91M50 4 30 48 50 96 70 48Z",
        facets: ["50,4 9,48 30,48", "91,48 70,48 50,96"],
        x: 50, y: 49, fontSize: 27,
      };
    case 10:
    case 100:
      return {
        outline: "50,4 89,36 81,69 50,96 19,69 11,36",
        edges: "M50 4 30 39 50 68 70 39 50 4M11 36 30 39 19 69M89 36 70 39 81 69M50 68V96",
        facets: ["50,4 11,36 30,39", "70,39 89,36 81,69 50,96 50,68"],
        x: 50, y: 43, fontSize: sides === 100 ? 20 : 25,
      };
    case 12:
      return {
        outline: "50,6 92,37 76,88 24,88 8,37",
        edges: "M50 6V28L71 43 63 68H37L29 43 50 28M92 37 71 43M76 88 63 68M24 88 37 68M8 37 29 43",
        facets: ["50,6 92,37 71,43 50,28", "8,37 29,43 37,68 24,88"],
        x: 50, y: 50, fontSize: 25,
      };
    case 20:
      return {
        outline: "50,4 90,27 90,73 50,96 10,73 10,27",
        edges: "M50 4V23L27 66H73L50 23M10 27 50 23 90 27 73 66 90 73M10 27 27 66 10 73M27 66 50 96 73 66",
        facets: ["50,4 50,23 90,27", "10,27 27,66 10,73", "27,66 50,96 73,66"],
        x: 50, y: 53, fontSize: 25,
      };
    default: {
      const count = Math.max(3, Math.min(sides, 8));
      const points = Array.from({ length: count }, (_, index) => {
        const angle = (-90 + 360 / count * index) * Math.PI / 180;
        return `${(50 + 44 * Math.cos(angle)).toFixed(1)},${(50 + 44 * Math.sin(angle)).toFixed(1)}`;
      });
      return { outline: points.join(" "), edges: "", facets: [], x: 50, y: 52, fontSize: 25 };
    }
  }
}

/** Compact wireframe icon for die selection; no animation or random value. */
export function DieGlyph({ sides, size = 25 }: { sides: number; size?: number }) {
  const shape = shapeFor(sides);
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="die-glyph" aria-hidden="true" focusable="false">
      <polygon points={shape.outline} fill="none" stroke="currentColor" strokeWidth="4" strokeLinejoin="miter" />
      <path d={shape.edges} fill="none" stroke="currentColor" strokeWidth="3" opacity="0.5" />
      {sides === FATE && <path d="M29 55H53M41 43V67" stroke="currentColor" strokeWidth="4" />}
    </svg>
  );
}

/** Matrix-style holographic die. The animation never determines the actual result. */
export function Die({ sides, value, rolling, size = 46 }: {
  sides: number; value: number | null; rolling: boolean; size?: number;
}) {
  const fate = sides === FATE;
  const shape = useMemo(() => shapeFor(sides), [sides]);
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const gradient = `matrix-die-${id}`;
  const clip = `matrix-clip-${id}`;
  const grid = `matrix-grid-${id}`;
  const [face, setFace] = useState(value ?? (fate ? 0 : sides));

  useEffect(() => {
    if (!rolling || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setFace(fate ? Math.floor(Math.random() * 3) - 1 : 1 + Math.floor(Math.random() * sides)), 80);
    return () => clearInterval(timer);
  }, [rolling, sides, fate]);

  const shown = rolling ? face : (value ?? (fate ? 0 : sides));
  const symbol = fate ? (shown > 0 ? "+" : shown < 0 ? "−" : "0") : String(shown);
  const settled = !rolling && value !== null;
  const state = !settled ? "idle" : shown === (fate ? 1 : sides) ? "high" : shown === (fate ? -1 : 1) ? "low" : "neutral";
  const kind = fate ? "dF" : `d${sides}`;
  const label = rolling ? `${kind}: rolando` : value === null ? `Prévia do dado ${kind}` : `${kind}: ${fate ? (shown > 0 ? "mais um" : shown < 0 ? "menos um" : "neutro") : shown}`;
  const plateWidth = symbol.length * shape.fontSize * 0.58 + 9;

  return (
    <div className="matrix-die" role="img" aria-label={label} data-die-kind={kind} data-die-state={state} data-rolling={rolling} style={{ width: size, height: size }}>
      <div className={`matrix-die-motion ${rolling ? "die-tumbling" : settled ? "die-settled" : ""}`}>
        <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id={gradient} x1="0%" y1="0%" x2="80%" y2="100%">
              <stop offset="0%" stopColor="var(--die-surface-light)" />
              <stop offset="65%" stopColor="var(--die-surface)" />
              <stop offset="100%" stopColor="var(--die-surface-dark)" />
            </linearGradient>
            <clipPath id={clip}><polygon points={shape.outline} /></clipPath>
            <pattern id={grid} width="12" height="16" patternUnits="userSpaceOnUse">
              <path d="M12 0H0V16" fill="none" stroke="var(--die-edge)" strokeWidth="0.4" opacity="0.18" />
              <path d="M4 4v3m4 5h1v2H8z" fill="none" stroke="var(--die-edge)" strokeWidth="0.55" opacity="0.28" />
            </pattern>
          </defs>
          <polygon className="matrix-die-shell" points={shape.outline} fill={`url(#${gradient})`} />
          {shape.facets.map((points, index) => <polygon key={index} points={points} fill="var(--die-edge)" opacity={index % 2 ? 0.06 : 0.1} />)}
          <polygon points={shape.outline} fill={`url(#${grid})`} />
          <path className="matrix-die-edges" d={shape.edges} />
          {rolling && <g clipPath={`url(#${clip})`}><rect className="matrix-die-scan" x="0" y="-20" width="100" height="12" fill="var(--die-edge)" opacity="0.2" /></g>}
          {/* A dark readout prevents the mesh from crossing the result. */}
          <rect x={shape.x - plateWidth / 2} y={shape.y - shape.fontSize * 0.5} width={plateWidth} height={shape.fontSize} fill="var(--die-surface-dark)" opacity="0.92" />
          <text className="matrix-die-value" x={shape.x} y={shape.y + 1} textAnchor="middle" dominantBaseline="central" fontSize={shape.fontSize}>{symbol}</text>
        </svg>
      </div>
    </div>
  );
}

export function diceList(notation: string): number[] {
  const result: number[] = [];
  for (const group of parseDiceGroups(notation)) {
    for (let index = 0; index < group.count; index++) result.push(group.sides);
  }
  return result.length ? result : [20];
}

type DiceInfo = {
  notation: string; total: number; detail: string; reason: string;
  rolls?: number[]; by?: "gm" | "player"; animate?: boolean; resolution?: MatrixResolution;
};

/** Chat results use the same green-on-black holographic dice as the tray. */
export default function DiceRoll({ dice }: { dice: DiceInfo }) {
  const specs = useMemo(() => diceList(dice.notation), [dice.notation]);
  const visible = useMemo(() => specs.slice(0, 8), [specs]);
  const animate = dice.animate !== false;
  const [settled, setSettled] = useState(animate ? 0 : visible.length);
  useEffect(() => {
    if (!animate) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers = visible.map((_, index) => setTimeout(() => setSettled(current => Math.max(current, index + 1)), reduce ? 0 : 850 + index * 130));
    return () => timers.forEach(clearTimeout);
  }, [animate, visible]);
  const revealed = !animate || settled >= visible.length;
  const rolls = dice.rolls || [];

  return (
    <div className="flex justify-center fade-up my-1">
      <div className="dice-card matrix-roll-card max-w-full" aria-label="Resultado da rolagem">
        <div className="flex items-center gap-1.5 flex-wrap">
          {visible.map((sides, index) => <Die key={index} sides={sides} value={rolls[index] ?? null} rolling={animate && index >= settled} size={42} />)}
          {specs.length > visible.length && <span className="text-xs text-[var(--muted)]">+{specs.length - visible.length}</span>}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--muted)]"><TerminalIcon name="dice" size={13} /><span>{dice.by === "gm" ? "Morpheus" : "Você"} // {dice.reason || "Rolagem"}</span></div>
          <div className="flex items-baseline gap-2"><span className="text-xs text-[var(--muted)]">{dice.resolution?.selection || dice.notation} =</span><span className={`matrix-result font-serif text-2xl ${revealed ? "dice-pop" : "opacity-50"}`}>{revealed ? (dice.resolution?.value ?? dice.total) : "…"}</span></div>
          {revealed && <div className="text-[11px] text-[var(--muted)] break-words">{dice.detail}</div>}
          {revealed && dice.resolution && <div className="mt-2 text-xs leading-5 text-[var(--gold-soft)]">
            {dice.resolution.success !== undefined && <p>{dice.resolution.success ? "SUCESSO" : "FALHA"}{dice.resolution.target !== undefined ? ` · alvo ${dice.resolution.target}` : ""}</p>}
            {dice.resolution.dmAfter !== dice.resolution.dmBefore && <p>DM: {dice.resolution.dmBefore} → {dice.resolution.dmAfter}</p>}
            {dice.resolution.event && <p>{dice.resolution.event}</p>}
          </div>}
        </div>
      </div>
    </div>
  );
}
