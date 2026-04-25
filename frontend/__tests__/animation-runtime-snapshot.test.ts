import { readAnimationRuntimeSnapshot } from "@/components/project/features/studio/tools/animation/runtime/snapshot";

describe("animation runtime snapshot", () => {
  it("accepts runtime_graph snapshots even when component_code is absent", () => {
    const snapshot = readAnimationRuntimeSnapshot({
      flowContext: {
        capabilityStatus: "backend_ready",
        capabilityReason: "ok",
        latestArtifacts: [],
        resolvedArtifact: {
          artifactId: "graph-1",
          artifactType: "gif",
          contentKind: "media",
          content: null,
          artifactMetadata: {
            content_snapshot: {
              kind: "animation_storyboard",
              runtime_version: "animation_runtime.v4",
              runtime_graph_version: "generic_explainer_graph.v1",
              runtime_source: "llm_draft_assembled_graph",
              compile_status: "pending",
              compile_errors: [],
              family_hint: "algorithm_demo",
              title: "冒泡排序",
              summary: "排序过程",
              scene_outline: [{ title: "比较", summary: "相邻元素比较" }],
              used_primitives: ["AnimationGraphRenderer"],
              runtime_graph: {
                title: "冒泡排序",
                summary: "排序过程",
                family_hint: "algorithm_demo",
                scene_outline: [{ title: "比较", summary: "相邻元素比较" }],
                timeline: { total_steps: 1 },
                scenes: [
                  {
                    id: "scene-1",
                    title: "比较",
                    summary: "相邻元素比较",
                    emphasis: null,
                    start_step: 0,
                    end_step: 0,
                    focus_targets: ["track-1"],
                  },
                ],
                steps: [
                  {
                    index: 0,
                    primary_caption: {
                      title: "比较相邻元素",
                      body: "先看前两个元素。",
                      secondary_note: null,
                    },
                    entities: [
                      {
                        id: "track-1",
                        kind: "track_stack",
                        items: [{ id: "a", label: "#0", value: 5 }],
                        max_value: 5,
                      },
                    ],
                    actions: [],
                    focus_targets: ["track-1"],
                  },
                ],
                camera: { mode: "fixed", focus_region: null, zoom_target: null },
                style: { tone: "minimal_gray", density: "balanced" },
                used_primitives: ["AnimationGraphRenderer"],
              },
            },
          },
        },
      },
      serverSpecPreview: null,
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot?.runtimeGraph?.title).toBe("冒泡排序");
    expect(snapshot?.componentCode).toBe("");
    expect(snapshot?.requiresRegeneration).not.toBe(true);
  });

  it("returns regeneration-required state for legacy artifact snapshots", () => {
    const snapshot = readAnimationRuntimeSnapshot({
      flowContext: {
        capabilityStatus: "backend_ready",
        capabilityReason: "ok",
        latestArtifacts: [],
        resolvedArtifact: {
          artifactId: "legacy-1",
          artifactType: "gif",
          contentKind: "media",
          content: null,
          artifactMetadata: {
            content_snapshot: {
              kind: "animation_storyboard",
              animation_family: "algorithm_demo",
              title: "旧动画",
              summary: "没有 runtime code",
              scenes: [{ title: "旧场景", description: "旧描述" }],
            },
          },
        },
      },
      serverSpecPreview: null,
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot?.requiresRegeneration).toBe(true);
    expect(snapshot?.componentCode).toBe("");
    expect(snapshot?.compileErrors[0]?.message).toContain("需要重新生成 runtime");
  });
});
