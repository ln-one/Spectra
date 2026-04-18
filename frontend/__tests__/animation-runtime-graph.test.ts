import React from "react";
import { render, screen } from "@testing-library/react";
import {
  compileRuntimeGraph,
  validateRuntimeGraph,
} from "@/components/project/features/studio/tools/animation/runtime/runtimeGraph";
import { compileRuntimeGraphToMotionCanvasScene } from "@/components/project/features/studio/tools/animation/runtime/motionCanvasManifest";
import {
  THEATRE_STEP_DURATION_FRAMES,
  compileRuntimeGraphToTheatreState,
} from "@/components/project/features/studio/tools/animation/runtime/theatreState";
import { ANIMATION_STYLE_PACK_SWATCHES } from "@/components/project/features/studio/tools/animation/constants";
import { AnimationGraphRenderer } from "@/components/project/features/studio/tools/animation/runtime/graphRenderer";

describe("animation runtime graph", () => {
  const validGraph = {
    title: "系统流转",
    summary: "观察请求如何在节点之间传递。",
    family_hint: "system_flow",
    scene_outline: [{ title: "流程", summary: "请求从 source 到 target" }],
    timeline: { total_steps: 1 },
    scenes: [
      {
        id: "scene-1",
        title: "流程",
        summary: "请求从 source 到 target",
        emphasis: null,
        start_step: 0,
        end_step: 0,
        focus_targets: ["node-source"],
      },
    ],
    steps: [
      {
        index: 0,
        primary_caption: {
          title: "请求发送",
          body: "source 将消息发送给 target。",
          secondary_note: null,
        },
        entities: [
          {
            id: "node-source",
            kind: "node",
            title: "Source",
            x: 80,
            y: 180,
            width: 140,
            height: 80,
          },
          {
            id: "node-target",
            kind: "node",
            title: "Target",
            x: 320,
            y: 180,
            width: 140,
            height: 80,
          },
        ],
        actions: [{ kind: "connect", entity_ids: ["node-source", "node-target"] }],
        focus_targets: ["node-source"],
      },
    ],
    camera: { mode: "fixed", focus_region: null, zoom_target: null },
    style: { tone: "clean_system", density: "balanced" as const },
    used_primitives: ["AnimationGraphRenderer"],
  };

  it("validates a generic explainer graph", () => {
    expect(validateRuntimeGraph(validGraph)).toEqual([]);
  });

  it("rejects graphs without subject entities", () => {
    const errors = validateRuntimeGraph({
      ...validGraph,
      steps: [
        {
          ...validGraph.steps[0],
          entities: [
            {
              id: "caption-only",
              kind: "caption" as const,
              title: "Only caption",
            },
          ],
        },
      ],
    });

    expect(errors.some((item) => item.ruleId === "runtime-graph-no-empty-subject")).toBe(
      true
    );
  });

  it("compiles a valid graph into deterministic code", () => {
    const code = compileRuntimeGraph(validGraph);
    expect(code).toContain("export default function Animation(runtimeProps)");
    expect(code).toContain("AnimationGraphRenderer");
    expect(code).toContain('"family_hint": "system_flow"');
    expect(code).toContain("theatreSequenceState");
    expect(code).toContain("motionCanvasSceneManifest");
  });

  it("compiles runtime_graph into deterministic Theatre state", () => {
    const sequenceState = compileRuntimeGraphToTheatreState(validGraph);

    expect(sequenceState.sheetId).toBe("animation-sequence");
    expect(sequenceState.familyPreset).toBe("system_flow");
    expect(sequenceState.durationFrames).toBe(THEATRE_STEP_DURATION_FRAMES);
    expect(sequenceState.sceneRanges[0]).toMatchObject({
      id: "scene-1",
      startFrame: 0,
      endFrame: THEATRE_STEP_DURATION_FRAMES - 1,
    });
  });

  it("compiles runtime_graph into a Motion Canvas scene manifest", () => {
    const manifest = compileRuntimeGraphToMotionCanvasScene(validGraph);

    expect(manifest.familyPreset).toBe("system_flow");
    expect(manifest.width).toBe(1280);
    expect(manifest.scenes[0]?.steps[0]?.caption.title).toBe("请求发送");
  });

  it("renders a neutral stage shell instead of the old cartoon yellow background", () => {
    render(
      React.createElement(AnimationGraphRenderer, {
        graph: validGraph,
        theme: ANIMATION_STYLE_PACK_SWATCHES.teaching_ppt_minimal_gray,
      })
    );

    expect(screen.getByTestId("animation-runtime-motion-canvas-shell")).toHaveAttribute(
      "data-theatre-sheet",
      "animation-sequence"
    );
    expect(screen.getByTestId("animation-runtime-motion-canvas-shell")).toHaveAttribute(
      "data-theatre-project",
      expect.stringContaining("spectra-runtime-system_flow")
    );
    expect(screen.getByTestId("animation-runtime-stage")).toHaveStyle({
      background: ANIMATION_STYLE_PACK_SWATCHES.teaching_ppt_minimal_gray.background,
    });
  });

  it("applies the physics presentation preset to trajectory paths", () => {
    const physicsGraph = {
      ...validGraph,
      family_hint: "physics_mechanics",
      steps: [
        {
          ...validGraph.steps[0],
          entities: [
            {
              id: "body-main",
              kind: "node" as const,
              title: "Projectile",
              x: 340,
              y: 150,
            },
            {
              id: "path-main",
              kind: "path" as const,
              points: [
                { x: 160, y: 320 },
                { x: 280, y: 240 },
                { x: 420, y: 210 },
                { x: 580, y: 250 },
              ],
            },
          ],
        },
      ],
    };

    const { container } = render(
      React.createElement(AnimationGraphRenderer, {
        graph: physicsGraph,
        theme: ANIMATION_STYLE_PACK_SWATCHES.teaching_ppt_minimal_gray,
      })
    );

    expect(container.querySelector('polyline[stroke-dasharray="8 6"]')).not.toBeNull();
    expect(screen.getByText("Projectile")).toBeInTheDocument();
  });
});
