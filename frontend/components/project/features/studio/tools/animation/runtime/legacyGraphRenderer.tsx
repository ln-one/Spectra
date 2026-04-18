"use client";

import { motion } from "framer-motion";
import { Arrow, Caption, Node, Scene, Stage, Track } from "./primitives";
import { usePlaybackState } from "./playbackState";
import {
  resolveAnimationPresentationPreset,
} from "./theatreState";
import type {
  AnimationGraphRendererProps,
  ExplainerFamilyPresentationPreset,
  GenericExplainerGraphV1,
  GraphEntity,
  GraphPoint,
} from "./types";

function currentStep(graph: GenericExplainerGraphV1, stepIndex: number) {
  const safeIndex = Math.max(0, Math.min(stepIndex, graph.steps.length - 1));
  return graph.steps[safeIndex] ?? graph.steps[0];
}

function currentScene(graph: GenericExplainerGraphV1, stepIndex: number) {
  return (
    graph.scenes.find((scene) => stepIndex >= scene.start_step && stepIndex <= scene.end_step) ??
    graph.scenes[0] ??
    null
  );
}

function renderPolyline(
  points: GraphPoint[],
  color: string,
  key: string,
  options?: { strokeWidth?: number; dasharray?: string }
) {
  const pathPoints = points.map((point) => `${point.x},${point.y}`).join(" ");
  if (!pathPoints) return null;
  return (
    <svg key={key} className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
      <polyline
        points={pathPoints}
        fill="none"
        stroke={color}
        strokeWidth={options?.strokeWidth ?? 4}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={options?.dasharray}
      />
    </svg>
  );
}

function renderAxis(entity: GraphEntity, preset: ExplainerFamilyPresentationPreset) {
  const x = entity.x ?? 100;
  const y = entity.y ?? 100;
  const width = entity.width ?? 420;
  const height = entity.height ?? 240;
  const stroke = preset === "math_transform" ? "#475569" : "#64748b";
  return (
    <svg
      key={entity.id}
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
    >
      <line x1={x} y1={y + height} x2={x + width} y2={y + height} stroke={stroke} strokeWidth="3" />
      <line x1={x} y1={y} x2={x} y2={y + height} stroke={stroke} strokeWidth="3" />
    </svg>
  );
}

function renderCallout(entity: GraphEntity) {
  return (
    <motion.div
      key={entity.id}
      layout
      transition={{ type: "spring", stiffness: 220, damping: 24 }}
      className="absolute max-w-[220px] rounded-2xl border border-white/70 bg-white/82 px-4 py-3 text-zinc-800 shadow-[0_12px_32px_rgba(15,23,42,0.12)] backdrop-blur-md"
      style={{ left: entity.x ?? 360, top: entity.y ?? 110 }}
    >
      <p className="text-xs font-semibold">{entity.title ?? entity.label ?? "Callout"}</p>
      {entity.body ? <p className="mt-1 text-[11px] leading-4 text-zinc-600">{entity.body}</p> : null}
    </motion.div>
  );
}

function renderBadge(entity: GraphEntity) {
  return (
    <div
      key={entity.id}
      className="absolute rounded-full border border-white/45 bg-white/70 px-3 py-1 text-[10px] font-medium text-zinc-700 shadow-sm backdrop-blur-md"
      style={{ left: entity.x ?? 420, top: entity.y ?? 80 }}
    >
      {entity.text ?? entity.label ?? entity.title}
    </div>
  );
}

function renderEntity(
  entity: GraphEntity,
  preset: ExplainerFamilyPresentationPreset
) {
  switch (entity.kind) {
    case "track_stack":
      return (
        <Track
          key={entity.id}
          items={entity.items ?? []}
          maxValue={entity.max_value ?? 1}
          compact={preset !== "algorithm_demo"}
        />
      );
    case "node":
      if (preset === "physics_mechanics") {
        const isPrimaryBody = entity.id.includes("body");
        return (
          <Node
            key={entity.id}
            id={entity.id}
            x={entity.x ?? (isPrimaryBody ? 360 : 120)}
            y={entity.y ?? (isPrimaryBody ? 150 : 280)}
            width={entity.width ?? (isPrimaryBody ? 220 : 164)}
            height={entity.height ?? (isPrimaryBody ? 112 : 84)}
            title={entity.title ?? entity.label ?? entity.id}
            body={entity.body ?? undefined}
          />
        );
      }
      return (
        <Node
          key={entity.id}
          id={entity.id}
          x={entity.x ?? 100}
          y={entity.y ?? 160}
          width={entity.width ?? 150}
          height={entity.height ?? 84}
          title={entity.title ?? entity.label ?? entity.id}
          body={entity.body ?? undefined}
        />
      );
    case "edge":
    case "vector":
      return (
        <Arrow
          key={entity.id}
          fromX={entity.from_x ?? 120}
          fromY={entity.from_y ?? 220}
          toX={entity.to_x ?? 260}
          toY={entity.to_y ?? 220}
          label={entity.label ?? entity.title ?? undefined}
          accent={
            preset === "physics_mechanics" || entity.accent === "active"
              ? "active"
              : "muted"
          }
        />
      );
    case "path":
      return renderPolyline(
        entity.points ?? [],
        preset === "physics_mechanics" ? "#0f766e" : "#38bdf8",
        entity.id,
        preset === "physics_mechanics"
          ? { strokeWidth: 3.5, dasharray: "8 6" }
          : undefined
      );
    case "curve":
      return renderPolyline(
        entity.points ?? [],
        preset === "math_transform" ? "#2563eb" : "#3b82f6",
        entity.id,
        { strokeWidth: preset === "math_transform" ? 4 : 3.5 }
      );
    case "axis":
      return renderAxis(entity, preset);
    case "callout":
      return renderCallout(entity);
    case "badge":
      return renderBadge(entity);
    case "caption":
      return (
        <Caption
          key={entity.id}
          title={entity.title ?? entity.label ?? "Caption"}
          body={entity.body ?? undefined}
        />
      );
    default:
      return null;
  }
}

export function LegacyAnimationGraphRenderer({
  graph,
  theme,
}: AnimationGraphRendererProps) {
  const playback = usePlaybackState();
  const step = currentStep(graph, playback.stepIndex);
  const scene = currentScene(graph, playback.stepIndex);
  const preset = resolveAnimationPresentationPreset(graph.family_hint);
  const captionAlign = preset === "physics_mechanics" ? "center" : "left";
  const sceneClassName =
    preset === "physics_mechanics"
      ? "px-8 pb-24 pt-6"
      : preset === "system_flow"
        ? "px-6 pb-24 pt-8"
        : preset === "math_transform"
          ? "px-6 pb-24 pt-6"
          : "px-4 pb-24 pt-6";

  return (
    <div data-testid="animation-runtime-legacy-shell">
      <Stage title={graph.title} subtitle={graph.summary} theme={theme}>
        <Scene
          title={scene?.title}
          summary={scene?.summary ?? undefined}
          className={sceneClassName}
        >
          {step.entities.map((entity) => renderEntity(entity, preset))}
          <Caption
            title={step.primary_caption.title}
            body={
              step.primary_caption.secondary_note
                ? `${step.primary_caption.body ?? ""} ${step.primary_caption.secondary_note}`.trim()
                : step.primary_caption.body ?? undefined
            }
            align={captionAlign}
          />
        </Scene>
      </Stage>
    </div>
  );
}
