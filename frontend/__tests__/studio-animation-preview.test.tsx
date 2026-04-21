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

  it("shows waiting status before a backend artifact is ready", () => {
    render(
      <PreviewStep
        lastGeneratedAt={null}
        serverSpecPreview={null}
        flowContext={buildFlowContext({
          capabilityStatus: "backend_placeholder",
          latestArtifacts: [],
          resolvedArtifact: null,
        })}
      />
    );

    expect(screen.getByText("暂未收到后端真实动画")).toBeInTheDocument();
  });

  it("shows animation loading state while generation is executing", () => {
    render(
      <PreviewStep
        lastGeneratedAt={null}
        serverSpecPreview={null}
        flowContext={buildFlowContext({
          capabilityStatus: "executing",
          workflowState: "executing",
          latestArtifacts: [],
          resolvedArtifact: null,
        })}
      />
    );

    expect(screen.getByText("动画生成中")).toBeInTheDocument();
  });

  it("shows fake ai generation stage before the bubble sort mock preview appears", () => {
    render(
      <PreviewStep
        lastGeneratedAt={null}
        serverSpecPreview={null}
        showBubbleSortMock
        mockGenerationStartedAt={new Date(Date.now() - 5_000).toISOString()}
        flowContext={buildFlowContext({
          capabilityStatus: "executing",
          workflowState: "executing",
          latestArtifacts: [],
          resolvedArtifact: null,
        })}
      />
    );

    expect(screen.getByText("动画生成中")).toBeInTheDocument();
    expect(
      screen.getByText("正在按冒泡排序教学主题生成正式动画，请稍候。")
    ).toBeInTheDocument();
  });

  it("shows bubble sort mock preview after the fake ai generation stage completes", () => {
    render(
      <PreviewStep
        lastGeneratedAt={null}
        serverSpecPreview={null}
        showBubbleSortMock
        mockGenerationStartedAt={new Date(Date.now() - 25_000).toISOString()}
        flowContext={buildFlowContext({
          capabilityStatus: "executing",
          workflowState: "executing",
          latestArtifacts: [],
          resolvedArtifact: null,
        })}
      />
    );

    expect(screen.getByText("动画预览")).toBeInTheDocument();
    expect(screen.getByText("生成已完成，可直接查看当前动画结果。")).toBeInTheDocument();
    expect(
      screen.getByTestId("animation-runtime-motion-canvas-shell")
    ).toBeInTheDocument();
  });

  it("keeps the white bar preview even after a real artifact is ready", () => {
    render(
      <PreviewStep
        lastGeneratedAt="2026-04-17T08:00:00.000Z"
        serverSpecPreview={null}
        showBubbleSortMock
        mockGenerationStartedAt={new Date(Date.now() - 25_000).toISOString()}
        flowContext={buildFlowContext()}
      />
    );

    expect(screen.getByText("动画预览")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导出 GIF" })).toBeInTheDocument();
    expect(
      screen.getByTestId("animation-runtime-motion-canvas-shell")
    ).toBeInTheDocument();
    expect(screen.queryByTitle("动画视频预览")).not.toBeInTheDocument();
  });

  it("renders simplified runtime preview and export entry", () => {
    render(
      <PreviewStep
        lastGeneratedAt="2026-04-17T08:00:00.000Z"
        serverSpecPreview={null}
        flowContext={buildFlowContext()}
      />
    );

    expect(screen.getByText("动画预览")).toBeInTheDocument();
    expect(screen.getByText("Runtime 预览")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导出" })).toBeInTheDocument();
    expect(screen.getByTitle("冒泡排序演示动画")).toBeInTheDocument();
  });

  it("pauses runtime autoplay when user clicks pause", () => {
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

  it("renders video preview when mp4 media is available", () => {
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

    expect(screen.getByTitle("动画视频预览")).toBeInTheDocument();
  });

  it("prefers runtime preview for html artifact when runtime snapshot exists", () => {
    render(
      <PreviewStep
        lastGeneratedAt="2026-04-17T08:00:00.000Z"
        serverSpecPreview={null}
        flowContext={buildFlowContext({
          resolvedArtifact: {
            artifactId: "anim-artifact-html",
            artifactType: "html",
            contentKind: "text",
            content: "<!doctype html><html><body><div>runtime html</div></body></html>",
            artifactMetadata: {
              content_snapshot: {
                kind: "animation_storyboard",
              },
            },
          },
        })}
      />
    );

    expect(screen.getByText("Runtime 预览")).toBeInTheDocument();
    expect(screen.getByText("动画需要重生成")).toBeInTheDocument();
    expect(screen.queryByTitle("HTML 动画预览")).not.toBeInTheDocument();
  });

  it("keeps runtime preview when artifact only has runtime_graph", () => {
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

    expect(
      screen.getByTestId("animation-runtime-motion-canvas-shell")
    ).toBeInTheDocument();
    expect(screen.getByTestId("animation-runtime-track")).toBeInTheDocument();
  });

  it("shows a themed empty-result state when backend artifact has no renderable preview", () => {
    render(
      <PreviewStep
        lastGeneratedAt="2026-04-17T08:00:00.000Z"
        serverSpecPreview={null}
        flowContext={buildFlowContext({
          resolvedArtifact: {
            artifactId: "anim-artifact-empty",
            artifactType: "gif",
            contentKind: "media",
            content: null,
            blob: null,
            artifactMetadata: {},
          },
        })}
      />
    );

    expect(screen.getByText("动画成果暂不可预览")).toBeInTheDocument();
    expect(
      screen.getByText("后端已返回成果，但当前没有可展示的媒体或 runtime 预览内容。")
    ).toBeInTheDocument();
  });
});
