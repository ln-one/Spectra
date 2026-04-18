"use client";

import { motion } from "framer-motion";
import type { PropsWithChildren, ReactNode } from "react";
import type { AnimationRuntimeTheme } from "./types";

interface StageProps extends PropsWithChildren {
  title?: string;
  subtitle?: string;
  theme?: AnimationRuntimeTheme;
}

interface SceneProps extends PropsWithChildren {
  title?: string;
  summary?: string;
  className?: string;
}

interface NodeProps {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  title: string;
  body?: string;
}

interface ArrowProps {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  label?: string;
  accent?: "active" | "muted";
}

interface LabelProps {
  x?: number;
  y?: number;
  text: string;
}

interface CaptionProps {
  title: string;
  body?: string;
  align?: "left" | "center";
}

interface TrackItem {
  id: string;
  label: string;
  value: number;
  accent?: "swap" | "active" | "success" | "muted" | null;
  marker?: string | null;
}

interface TrackProps {
  items: TrackItem[];
  maxValue?: number;
  mode?: "bars";
  compact?: boolean;
}

interface ChartPoint {
  label: string;
  value: number;
}

interface ChartProps {
  title: string;
  points: ChartPoint[];
}

interface CalloutProps {
  title: string;
  body?: string;
}

function accentToColor(accent?: string | null): string {
  if (accent === "swap") return "#f97316";
  if (accent === "active") return "#2563eb";
  if (accent === "success") return "#059669";
  return "#64748b";
}

export function Stage({ title, subtitle, theme, children }: StageProps) {
  return (
    <div
      data-testid="animation-runtime-stage"
      className="relative min-h-[500px] overflow-hidden rounded-[28px] border border-slate-200 shadow-[0_20px_52px_rgba(15,23,42,0.08)]"
      style={{
        background: theme?.background ?? "#eef1f4",
      }}
    >
      <div
        className="relative h-[500px] px-5 py-5"
        aria-label={title ?? subtitle ?? "Animation Runtime"}
      >
        <div className="relative h-full overflow-hidden rounded-[24px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.84),rgba(248,250,252,0.94))] px-5 py-4">
          {children}
        </div>
      </div>
    </div>
  );
}

export function Scene({ title: _title, summary: _summary, className, children }: SceneProps) {
  return (
    <div className={`relative h-full min-h-[360px] w-full ${className ?? ""}`.trim()}>
      <div className="relative h-full min-h-[360px]">{children}</div>
    </div>
  );
}

export function Node({ x, y, width = 160, height = 84, title, body }: NodeProps) {
  return (
    <motion.div
      layout
      transition={{ type: "spring", stiffness: 220, damping: 26 }}
      className="absolute rounded-2xl border border-slate-200 bg-white/92 p-3 shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
      style={{ left: x, top: y, width, height }}
    >
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {body ? <p className="mt-1 text-[11px] leading-5 text-slate-600">{body}</p> : null}
    </motion.div>
  );
}

export function Edge(): null {
  return null;
}

export function Arrow({ fromX, fromY, toX, toY, label, accent = "muted" }: ArrowProps) {
  const stroke = accent === "active" ? "#2563eb" : "#7b8794";
  const labelX = (fromX + toX) / 2;
  const labelY = (fromY + toY) / 2 - 10;
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
      <defs>
        <marker
          id="arrow-head"
          markerWidth="12"
          markerHeight="12"
          refX="10"
          refY="6"
          orient="auto"
        >
          <path d="M0,0 L12,6 L0,12 z" fill={stroke} />
        </marker>
      </defs>
      <line
        x1={fromX}
        y1={fromY}
        x2={toX}
        y2={toY}
        stroke={stroke}
        strokeWidth="3"
        markerEnd="url(#arrow-head)"
      />
      {label ? (
        <text x={labelX} y={labelY} textAnchor="middle" fontSize="12" fill={stroke}>
          {label}
        </text>
      ) : null}
    </svg>
  );
}

export function Label({ x = 0, y = 0, text }: LabelProps) {
  const resolvedY = y < 56 ? y + 52 : y;
  return (
    <div
      className="absolute rounded-full border border-slate-200 bg-white/86 px-2 py-0.5 text-[10px] text-slate-600 shadow-sm"
      style={{ left: x, top: resolvedY }}
    >
      {text}
    </div>
  );
}

export function Caption({ title, body, align = "left" }: CaptionProps) {
  return (
    <div
      className="absolute inset-x-4 bottom-4 z-20 flex justify-center"
      data-testid="animation-runtime-caption"
    >
      <div
        className={`max-w-[520px] rounded-[16px] border border-slate-200 bg-white/92 px-4 py-2.5 shadow-[0_10px_30px_rgba(15,23,42,0.08)] ${
          align === "center" ? "text-center" : "text-left"
        }`}
      >
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        {body ? <p className="mt-1 text-[11px] leading-4 text-slate-600">{body}</p> : null}
      </div>
    </div>
  );
}

export function Track({ items, maxValue = 1, compact = false }: TrackProps) {
  return (
    <div
      data-testid="animation-runtime-track"
      className={`absolute inset-x-0 z-10 flex items-end justify-center gap-4 px-6 ${
        compact ? "bottom-20 h-[240px]" : "bottom-16 h-[280px]"
      }`}
    >
      {items.map((item) => {
        const trackHeight = compact ? 214 : 252;
        const height = Math.max(48, (item.value / Math.max(maxValue, 1)) * trackHeight);
        const color = accentToColor(item.accent);
        return (
          <div key={item.id} className="flex flex-col items-center gap-2">
            <span className="h-3 text-[9px] font-medium text-slate-500">{item.marker}</span>
            <motion.div
              layout
              transition={{ type: "spring", stiffness: 240, damping: 24 }}
              className="flex w-14 items-end justify-center rounded-t-[24px] border border-slate-100 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(15,23,42,0.12)]"
              style={{
                height,
                background: `linear-gradient(180deg, ${color} 0%, rgba(51,65,85,0.92) 100%)`,
              }}
            >
              <span className="mb-2">{item.value}</span>
            </motion.div>
            <span className="text-[10px] text-slate-500">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Chart({ title, points }: ChartProps) {
  const maxValue = Math.max(...points.map((item) => item.value), 1);
  const plotPoints = points
    .map((point, index) => {
      const x = 24 + index * 80;
      const y = 116 - (point.value / maxValue) * 72;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="absolute right-4 top-24 z-10 w-[280px] rounded-[22px] border border-slate-200 bg-white/90 p-3 shadow-[0_12px_28px_rgba(15,23,42,0.10)]">
      <p className="text-xs font-semibold text-slate-800">{title}</p>
      <svg className="mt-2 h-[120px] w-full" viewBox="0 0 240 120">
        <polyline
          points={plotPoints}
          fill="none"
          stroke="#2563eb"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((point, index) => {
          const x = 24 + index * 80;
          const y = 116 - (point.value / maxValue) * 72;
          return (
            <g key={`${point.label}-${index}`}>
              <circle cx={x} cy={y} r="4" fill="#2563eb" />
              <text x={x} y="116" textAnchor="middle" fontSize="11" fill="#64748b">
                {point.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function Sprite({ children }: PropsWithChildren): ReactNode {
  return children ?? null;
}

export function Callout({ title, body }: CalloutProps) {
  return (
    <div className="absolute right-4 top-4 z-10 w-[180px] rounded-[18px] border border-slate-200 bg-white/92 p-3 shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
      <p className="text-[11px] font-semibold text-slate-800">{title}</p>
      {body ? <p className="mt-1 text-[10px] leading-4 text-slate-600">{body}</p> : null}
    </div>
  );
}

export function Equation({ children }: PropsWithChildren) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white/90 px-3 py-2 font-mono text-sm text-zinc-800 shadow-sm">
      {children}
    </div>
  );
}

export function Timeline({ children }: PropsWithChildren) {
  return <>{children}</>;
}
