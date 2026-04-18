"use client";

import { motion } from "framer-motion";
import { Caption, Node, Scene, Stage, Track } from "./primitives";
import type {
  AnimationRuntimeTheme,
  ExplainerFamilyPresentationPreset,
  GraphEntity,
  GraphPoint,
  MotionCanvasSceneManifest,
} from "./types";

interface MotionCanvasSceneRendererProps {
  manifest: MotionCanvasSceneManifest;
  activeFrame: number;
  theme: AnimationRuntimeTheme;
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
        <svg
          key={entity.id}
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        >
          <defs>
            <marker
              id={`motion-canvas-arrow-${entity.id}`}
              markerWidth="12"
              markerHeight="12"
              refX="10"
              refY="6"
              orient="auto"
            >
              <path
                d="M0,0 L12,6 L0,12 z"
                fill={
                  preset === "physics_mechanics" || entity.accent === "active"
                    ? "#2563eb"
                    : "#7b8794"
                }
              />
            </marker>
          </defs>
          <line
            x1={entity.from_x ?? 120}
            y1={entity.from_y ?? 220}
            x2={entity.to_x ?? 260}
            y2={entity.to_y ?? 220}
            stroke={
              preset === "physics_mechanics" || entity.accent === "active"
                ? "#2563eb"
                : "#7b8794"
            }
            strokeWidth="3"
            markerEnd={`url(#motion-canvas-arrow-${entity.id})`}
          />
          {entity.label ? (
            <text
              x={((entity.from_x ?? 120) + (entity.to_x ?? 260)) / 2}
              y={((entity.from_y ?? 220) + (entity.to_y ?? 220)) / 2 - 10}
              textAnchor="middle"
              fontSize="12"
              fill={
                preset === "physics_mechanics" || entity.accent === "active"
                  ? "#2563eb"
                  : "#7b8794"
              }
            >
              {entity.label}
            </text>
          ) : null}
        </svg>
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

function resolveActiveScene(manifest: MotionCanvasSceneManifest, activeFrame: number) {
  return (
    manifest.scenes.find(
      (scene) => activeFrame >= scene.startFrame && activeFrame <= scene.endFrame
    ) ??
    manifest.scenes[0] ??
    null
  );
}

function resolveActiveStep(manifest: MotionCanvasSceneManifest, activeFrame: number) {
  const scene = resolveActiveScene(manifest, activeFrame);
  return (
    scene?.steps.find(
      (step) => activeFrame >= step.startFrame && activeFrame <= step.endFrame
    ) ??
    scene?.steps[0] ??
    null
  );
}

export function MotionCanvasSceneRenderer({
  manifest,
  activeFrame,
  theme,
}: MotionCanvasSceneRendererProps) {
  const scene = resolveActiveScene(manifest, activeFrame);
  const step = resolveActiveStep(manifest, activeFrame);
  const preset = manifest.familyPreset;
  const captionAlign = preset === "physics_mechanics" ? "center" : "left";
  const sceneClassName =
    preset === "physics_mechanics"
      ? "px-8 pb-24 pt-6"
      : preset === "system_flow"
        ? "px-6 pb-24 pt-8"
        : preset === "math_transform"
          ? "px-6 pb-24 pt-6"
          : "px-4 pb-24 pt-6";

  if (!step) return null;

  return (
    <Stage title={manifest.projectName} subtitle={scene?.summary ?? undefined} theme={theme}>
      <Scene
        title={scene?.title}
        summary={scene?.summary ?? undefined}
        className={sceneClassName}
      >
        {step.entities.map((entity) => renderEntity(entity, preset))}
        <Caption
          title={step.caption.title}
          body={
            step.caption.secondary_note
              ? `${step.caption.body ?? ""} ${step.caption.secondary_note}`.trim()
              : step.caption.body ?? undefined
          }
          align={captionAlign}
        />
      </Scene>
    </Stage>
  );
}
