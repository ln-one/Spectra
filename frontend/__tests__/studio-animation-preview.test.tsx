import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "@testing-library/react";
import type { ToolFlowContext } from "@/components/project/features/studio/tools";
import type { AnimationArtifactRuntimeSnapshot } from "@/components/project/features/studio/tools/animation/runtime/types";
import { PreviewStep } from "@/components/project/features/studio/tools/animation/PreviewStep";

function buildFlowContext(
  overrides: Partial<ToolFlowContext> = {}
): ToolFlowContext {
  return {
    capabilityStatus: "backend_ready",
    capabilityReason: "Loaded backend animation storyboard.",
    cardCapability: {
      id: "demonstration_animations",
      title: "演示动画",
      readiness: "foundation_ready",
      context_mode: "artifact",
      execution_mode: "artifact_create",
      requires_source_artifact: false,
      supports_chat_refine: true,
      supports_selection_context: true,
      actions: [],
      governance_tag: "separate-track",
      cleanup_priority: "p1",
      surface_strategy: "separate_runtime_track",
      render_contract: "storyboard_render_contract",
      placement_supported: true,
      runtime_preview_mode: "local_preview_only",
      cloud_render_mode: "async_media_export",
    },
    canRecommendPlacement: true,
    canConfirmPlacement: true,
    latestArtifacts: [
      {
        artifactId: "anim-artifact-1",
        title: "冒泡排序演示动画",
        status: "completed",
        createdAt: "2026-04-17T08:00:00.000Z",
      },
    ],
    resolvedArtifact: {
      artifactId: "anim-artifact-1",
      artifactType: "gif",
      contentKind: "media",
        content: null,
        artifactMetadata: {
          content_snapshot: {
            kind: "animation_storyboard",
            runtime_version: "animation_runtime.v4",
            runtime_contract: "animation_runtime.v4",
            runtime_source: "llm_draft_assembled_graph",
            family_hint: "algorithm_demo",
            compile_status: "pending",
            compile_errors: [],
            title: "冒泡排序演示动画",
            summary: "通过动画理解比较与交换。",
            scene_outline: [
              {
                title: "逐步比较",
                summary: "观察当前比较对。",
              },
            ],
            used_primitives: ["Stage", "Scene", "Caption", "Track", "usePlayback"],
            component_code: `
export default function Animation(runtimeProps) {
  const e = React.createElement;
  const playback = usePlayback();
  const steps = [
    { caption: "先比较第一对元素。", snapshot: [5, 3, 8, 2, 6] },
    { caption: "5 大于 3，交换两个元素。", snapshot: [3, 5, 8, 2, 6] }
  ];
  const step = steps[Math.min(steps.length - 1, playback.stepIndex || 0)] || steps[0];
  return e(Stage, { title: "冒泡排序演示动画", subtitle: "通过动画理解比较与交换。", theme: runtimeProps.theme },
    e(Scene, { title: "逐步比较", summary: "观察当前比较对。" },
      e(Caption, { title: step.caption, body: \`第 \${(playback.stepIndex || 0) + 1} / \${steps.length} 步\` }),
      e(Track, { mode: "bars", items: step.snapshot.map((value, index) => ({
        id: \`item-\${index}\`,
        label: \`#\${index}\`,
        value,
        accent: index === 0 ? "active" : "muted"
      })), maxValue: 8 })
    )
  );
}
            `.trim(),
            steps: [
              {
                action: "compare",
              active_indices: [0, 1],
              caption: "先比较第一对元素。",
              snapshot: [5, 3, 8, 2, 6],
            },
            {
              action: "swap",
              active_indices: [0, 1],
              swap_indices: [0, 1],
              caption: "5 大于 3，交换两个元素。",
              snapshot: [3, 5, 8, 2, 6],
            },
          ],
        },
      },
    },
    ...overrides,
  };
}

describe("studio animation preview", () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    jest.useFakeTimers();
    URL.createObjectURL = jest.fn(() => "blob:animation-preview");
    URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it("renders a quieter runtime preview with collapsed controls", () => {
    render(
      <PreviewStep
        lastGeneratedAt="2026-04-17T08:00:00.000Z"
        serverSpecPreview={null}
        flowContext={buildFlowContext()}
      />
    );

    expect(screen.getByTitle("冒泡排序演示动画")).toBeInTheDocument();
    expect(screen.getByText("正式结果契约")).toBeInTheDocument();
    expect(screen.getByText("Runtime preview")).toBeInTheDocument();
    expect(screen.queryByText("algorithm_demo")).not.toBeInTheDocument();
    expect(screen.queryByText("观察当前比较对。")).not.toBeInTheDocument();
    expect(screen.queryByText(/导出预接入/)).not.toBeInTheDocument();
    expect(screen.queryByText("动画时长：6 秒")).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1200);
    });

    expect(screen.getByText("导出成果")).toBeInTheDocument();
  });

  it("pauses autoplay after user toggles pause", () => {
    render(
      <PreviewStep
        lastGeneratedAt="2026-04-17T08:00:00.000Z"
        serverSpecPreview={null}
        flowContext={buildFlowContext()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "暂停" }));

    act(() => {
      jest.advanceTimersByTime(1500);
    });

    expect(screen.getByTitle("冒泡排序演示动画")).toBeInTheDocument();
  });

  it("reveals advanced refine controls only after expanding settings", () => {
    render(
      <PreviewStep
        lastGeneratedAt="2026-04-17T08:00:00.000Z"
        serverSpecPreview={null}
        flowContext={buildFlowContext()}
      />
    );

    expect(screen.queryByText("动画时长：6 秒")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /更多设置/ })[0]);

    expect(screen.getByText("动画时长：6 秒")).toBeInTheDocument();
  });

  it("keeps runtime preview secondary even when MP4 export is available", () => {
    const baselineFlowContext = buildFlowContext();
    render(
      <PreviewStep
        lastGeneratedAt="2026-04-17T08:00:00.000Z"
        serverSpecPreview={null}
        flowContext={buildFlowContext({
          resolvedArtifact: {
            artifactId: "anim-artifact-1",
            artifactType: "mp4",
            contentKind: "media",
            content: null,
            blob: new Blob(["mp4"], { type: "video/mp4" }),
            artifactMetadata: {
              content_snapshot:
                baselineFlowContext.resolvedArtifact?.artifactMetadata?.content_snapshot,
              cloud_video_status: "succeeded",
            },
          },
        })}
      />
    );

    expect(screen.getByTitle("冒泡排序演示动画")).toBeInTheDocument();
    expect(screen.queryByTitle("动画视频预览")).not.toBeInTheDocument();
    expect(
      screen.getByText("主结果以上方 artifact/export 为准；这里保留正式导出入口。")
    ).toBeInTheDocument();
    expect(
      screen.getByText("当前正式成果是 MP4 导出；如需插入 PPT，请先生成 GIF 版动画。")
    ).toBeInTheDocument();
  });

  it("keeps runtime preview available when the artifact only carries runtime_graph", () => {
    const baselineFlowContext = buildFlowContext();
    const baselineSnapshot =
      (baselineFlowContext.resolvedArtifact?.artifactMetadata?.content_snapshot ??
        null) as AnimationArtifactRuntimeSnapshot["metadata"];
    const graphOnlySnapshot = {
      ...(baselineSnapshot && typeof baselineSnapshot === "object"
        ? baselineSnapshot
        : {}),
      component_code: "",
      runtime_graph: {
        title: "冒泡排序演示动画",
        summary: "通过动画理解比较与交换。",
        family_hint: "algorithm_demo",
        scene_outline: [{ title: "逐步比较", summary: "观察当前比较对。" }],
        timeline: { total_steps: 2 },
        scenes: [
          {
            id: "scene-1",
            title: "逐步比较",
            summary: "观察当前比较对。",
            emphasis: null,
            start_step: 0,
            end_step: 1,
            focus_targets: ["track-main"],
          },
        ],
        steps: [
          {
            index: 0,
            primary_caption: {
              title: "先比较第一对元素",
              body: "5 和 3 将进行比较。",
              secondary_note: null,
            },
            entities: [
              {
                id: "track-main",
                kind: "track_stack",
                items: [
                  { id: "a", label: "#0", value: 5, accent: "active" },
                  { id: "b", label: "#1", value: 3, accent: "muted" },
                ],
                max_value: 5,
              },
            ],
            actions: [],
            focus_targets: ["track-main"],
          },
          {
            index: 1,
            primary_caption: {
              title: "交换两个元素",
              body: "5 大于 3，因此交换。",
              secondary_note: null,
            },
            entities: [
              {
                id: "track-main",
                kind: "track_stack",
                items: [
                  { id: "b", label: "#0", value: 3, accent: "active" },
                  { id: "a", label: "#1", value: 5, accent: "swap" },
                ],
                max_value: 5,
              },
            ],
            actions: [{ kind: "swap", entity_ids: ["track-main"] }],
            focus_targets: ["track-main"],
          },
        ],
        camera: { mode: "fixed", focus_region: null, zoom_target: null },
        style: { tone: "minimal_gray", density: "balanced" },
        used_primitives: ["AnimationGraphRenderer"],
      },
    };

    render(
      <PreviewStep
        lastGeneratedAt="2026-04-17T08:00:00.000Z"
        serverSpecPreview={null}
        flowContext={buildFlowContext({
          resolvedArtifact: {
            artifactId: "anim-artifact-graph-only",
            artifactType: "gif",
            contentKind: "media",
            content: null,
            artifactMetadata: {
              content_snapshot: graphOnlySnapshot,
            },
          },
        })}
      />
    );

    expect(screen.getByTitle("冒泡排序演示动画")).toBeInTheDocument();
  });

  it("disables placement actions when the current artifact is not placement-ready", () => {
    render(
      <PreviewStep
        lastGeneratedAt="2026-04-17T08:00:00.000Z"
        serverSpecPreview={{ placement_supported: false }}
        flowContext={buildFlowContext({
          resolvedArtifact: {
            artifactId: "anim-artifact-1",
            artifactType: "mp4",
            contentKind: "media",
            content: null,
            blob: new Blob(["mp4"], { type: "video/mp4" }),
            artifactMetadata: {
              content_snapshot: {
                kind: "animation_storyboard",
                title: "冒泡排序演示动画",
              },
            },
          },
          selectedSourceId: "ppt-1",
        })}
      />
    );

    expect(screen.getByRole("button", { name: "推荐页" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "确认插入" })).toBeDisabled();
  });

  it("blocks placement when gif output has no bound ppt source", () => {
    render(
      <PreviewStep
        lastGeneratedAt="2026-04-17T08:00:00.000Z"
        serverSpecPreview={{ placement_supported: true }}
        flowContext={buildFlowContext({
          resolvedArtifact: {
            artifactId: "anim-artifact-gif",
            artifactType: "gif",
            contentKind: "media",
            content: null,
            artifactMetadata: {
              content_snapshot: {
                kind: "animation_storyboard",
                title: "冒泡排序演示动画",
              },
            },
          },
          selectedSourceId: null,
        })}
      />
    );

    expect(
      screen.getAllByText("动画生成本身不依赖 PPT；如需 placement，请先绑定一个 PPT 成果。")
        .length
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "推荐页" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "确认插入" })).toBeDisabled();
  });
});
