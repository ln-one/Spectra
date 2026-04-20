import type { ToolFlowContext } from "@/components/project/features/studio/tools/types";

const componentCode = `
export default function Animation(runtimeProps) {
  const e = React.createElement;
  const playback = usePlayback();
  const steps = [
    { action: "compare", active_indices: [0, 1], caption: "先比较 5 和 3。", snapshot: [5, 3, 8, 2, 6] },
    { action: "swap", active_indices: [0, 1], swap_indices: [0, 1], caption: "5 大于 3，交换。", snapshot: [3, 5, 8, 2, 6] },
    { action: "compare", active_indices: [1, 2], caption: "继续比较 5 和 8。", snapshot: [3, 5, 8, 2, 6] },
    { action: "compare", active_indices: [2, 3], caption: "比较 8 和 2。", snapshot: [3, 5, 8, 2, 6] },
    { action: "swap", active_indices: [2, 3], swap_indices: [2, 3], caption: "8 大于 2，交换。", snapshot: [3, 5, 2, 8, 6] },
    { action: "compare", active_indices: [3, 4], caption: "比较 8 和 6。", snapshot: [3, 5, 2, 8, 6] },
    { action: "swap", active_indices: [3, 4], swap_indices: [3, 4], caption: "8 大于 6，交换。", snapshot: [3, 5, 2, 6, 8] },
    { action: "compare", active_indices: [0, 1], caption: "第二轮，比较 3 和 5。", snapshot: [3, 5, 2, 6, 8] },
    { action: "compare", active_indices: [1, 2], caption: "比较 5 和 2。", snapshot: [3, 5, 2, 6, 8] },
    { action: "swap", active_indices: [1, 2], swap_indices: [1, 2], caption: "5 大于 2，交换。", snapshot: [3, 2, 5, 6, 8] },
    { action: "compare", active_indices: [0, 1], caption: "最后一轮，比较 3 和 2。", snapshot: [3, 2, 5, 6, 8] },
    { action: "swap", active_indices: [0, 1], swap_indices: [0, 1], caption: "3 大于 2，交换。", snapshot: [2, 3, 5, 6, 8] },
    { action: "done", sorted_indices: [0, 1, 2, 3, 4], caption: "排序完成，得到升序数组。", snapshot: [2, 3, 5, 6, 8] }
  ];
  const stepCount = steps.length;
  const stepIndex = Math.min(stepCount - 1, Math.max(0, playback.stepIndex || 0));
  const step = steps[stepIndex] || steps[0];
  const snapshot = step.snapshot;
  const maxValue = Math.max(1, ...snapshot);
  const active = new Set(Array.isArray(step.active_indices) ? step.active_indices : []);
  const swaps = new Set(Array.isArray(step.swap_indices) ? step.swap_indices : []);
  const sorted = new Set(Array.isArray(step.sorted_indices) ? step.sorted_indices : []);

  return e(
    Stage,
    {
      title: "冒泡排序演示动画",
      subtitle: "完整展示比较、交换与收束结果。",
      theme: runtimeProps.theme
    },
    e(
      Scene,
      e(Caption, {
        title: step.caption,
        body: \`第 \${stepIndex + 1} / \${stepCount} 步\`
      }),
      e(Track, {
        mode: "bars",
        items: snapshot.map((value, index) => ({
          id: \`item-\${index}\`,
          label: \`#\${index}\`,
          value,
          accent: swaps.has(index) ? "swap" : active.has(index) ? "active" : sorted.has(index) ? "success" : "muted"
        })),
        maxValue
      })
    )
  );
}
`.trim();

export const DEBUG_CAPTURED_ANIMATION_RUNTIME_SNAPSHOT: Record<string, unknown> = {
  kind: "animation_storyboard",
  runtime_version: "animation_runtime.v4",
  runtime_contract: "animation_runtime.v4",
  runtime_source: "llm_draft_assembled_graph",
  compile_status: "pending",
  compile_errors: [],
  family_hint: "algorithm_demo",
  title: "冒泡排序演示动画",
  summary: "完整展示比较、交换与收束结果。",
  duration_seconds: 8,
  rhythm: "balanced",
  style_pack: "teaching_ppt_minimal_gray",
  runtime_graph_version: "generic_explainer_graph.v1",
  runtime_graph: {
    version: "generic_explainer_graph.v1",
    title: "冒泡排序演示动画",
    summary: "完整展示比较、交换与收束结果。",
    family_hint: "algorithm_demo",
    scene_count: 3,
    style_pack: "teaching_ppt_minimal_gray",
    duration_seconds: 8,
    scenes: [
      {
        id: "scene-1",
        title: "初始数组",
        summary: "先看原始排列和待比较元素。",
        emphasis: "先定位当前比较位。",
        start_step: 0,
        end_step: 1,
        focus_targets: ["track-main"],
      },
      {
        id: "scene-2",
        title: "逐轮冒泡",
        summary: "较大的元素持续向右移动。",
        emphasis: "比较并交换顺序错误的相邻元素。",
        start_step: 2,
        end_step: 4,
        focus_targets: ["track-main"],
      },
      {
        id: "scene-3",
        title: "完成排序",
        summary: "最终得到从小到大的结果。",
        emphasis: "有序序列收束。",
        start_step: 5,
        end_step: 6,
        focus_targets: ["track-main"],
      },
    ],
    steps: [
      {
        index: 0,
        scene_id: "scene-1",
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
              { id: "i0", label: "#0", value: 5, accent: "active", marker: "current" },
              { id: "i1", label: "#1", value: 3, accent: "active", marker: "current" },
              { id: "i2", label: "#2", value: 8, accent: "muted", marker: null },
              { id: "i3", label: "#3", value: 2, accent: "muted", marker: null },
              { id: "i4", label: "#4", value: 6, accent: "muted", marker: null },
            ],
            max_value: 8,
          },
        ],
        actions: [],
        focus_targets: ["track-main"],
      },
      {
        index: 1,
        scene_id: "scene-1",
        primary_caption: {
          title: "交换前两位",
          body: "5 大于 3，交换后成为 3, 5。",
          secondary_note: null,
        },
        entities: [
          {
            id: "track-main",
            kind: "track_stack",
            items: [
              { id: "i0", label: "#0", value: 3, accent: "swap", marker: "swap" },
              { id: "i1", label: "#1", value: 5, accent: "swap", marker: "swap" },
              { id: "i2", label: "#2", value: 8, accent: "muted", marker: null },
              { id: "i3", label: "#3", value: 2, accent: "muted", marker: null },
              { id: "i4", label: "#4", value: 6, accent: "muted", marker: null },
            ],
            max_value: 8,
          },
        ],
        actions: [],
        focus_targets: ["track-main"],
      },
      {
        index: 2,
        scene_id: "scene-2",
        primary_caption: {
          title: "继续向后比较",
          body: "比较 5 和 8，当前无需交换。",
          secondary_note: null,
        },
        entities: [
          {
            id: "track-main",
            kind: "track_stack",
            items: [
              { id: "i0", label: "#0", value: 3, accent: "muted", marker: null },
              { id: "i1", label: "#1", value: 5, accent: "active", marker: "current" },
              { id: "i2", label: "#2", value: 8, accent: "active", marker: "current" },
              { id: "i3", label: "#3", value: 2, accent: "muted", marker: null },
              { id: "i4", label: "#4", value: 6, accent: "muted", marker: null },
            ],
            max_value: 8,
          },
        ],
        actions: [],
        focus_targets: ["track-main"],
      },
      {
        index: 3,
        scene_id: "scene-2",
        primary_caption: {
          title: "比较 8 和 2",
          body: "发现逆序，准备交换。",
          secondary_note: null,
        },
        entities: [
          {
            id: "track-main",
            kind: "track_stack",
            items: [
              { id: "i0", label: "#0", value: 3, accent: "muted", marker: null },
              { id: "i1", label: "#1", value: 5, accent: "muted", marker: null },
              { id: "i2", label: "#2", value: 8, accent: "active", marker: "current" },
              { id: "i3", label: "#3", value: 2, accent: "active", marker: "current" },
              { id: "i4", label: "#4", value: 6, accent: "muted", marker: null },
            ],
            max_value: 8,
          },
        ],
        actions: [],
        focus_targets: ["track-main"],
      },
      {
        index: 4,
        scene_id: "scene-2",
        primary_caption: {
          title: "完成一次关键交换",
          body: "8 与 2 交换后，2 前移。",
          secondary_note: null,
        },
        entities: [
          {
            id: "track-main",
            kind: "track_stack",
            items: [
              { id: "i0", label: "#0", value: 3, accent: "muted", marker: null },
              { id: "i1", label: "#1", value: 5, accent: "muted", marker: null },
              { id: "i2", label: "#2", value: 2, accent: "swap", marker: "swap" },
              { id: "i3", label: "#3", value: 8, accent: "swap", marker: "swap" },
              { id: "i4", label: "#4", value: 6, accent: "muted", marker: null },
            ],
            max_value: 8,
          },
        ],
        actions: [],
        focus_targets: ["track-main"],
      },
      {
        index: 5,
        scene_id: "scene-3",
        primary_caption: {
          title: "最后一轮收束",
          body: "数组已经接近有序。",
          secondary_note: null,
        },
        entities: [
          {
            id: "track-main",
            kind: "track_stack",
            items: [
              { id: "i0", label: "#0", value: 2, accent: "success", marker: "sorted" },
              { id: "i1", label: "#1", value: 3, accent: "success", marker: "sorted" },
              { id: "i2", label: "#2", value: 5, accent: "active", marker: "current" },
              { id: "i3", label: "#3", value: 6, accent: "active", marker: "current" },
              { id: "i4", label: "#4", value: 8, accent: "muted", marker: null },
            ],
            max_value: 8,
          },
        ],
        actions: [],
        focus_targets: ["track-main"],
      },
      {
        index: 6,
        scene_id: "scene-3",
        primary_caption: {
          title: "排序完成",
          body: "得到最终升序序列。",
          secondary_note: null,
        },
        entities: [
          {
            id: "track-main",
            kind: "track_stack",
            items: [
              { id: "i0", label: "#0", value: 2, accent: "success", marker: "sorted" },
              { id: "i1", label: "#1", value: 3, accent: "success", marker: "sorted" },
              { id: "i2", label: "#2", value: 5, accent: "success", marker: "sorted" },
              { id: "i3", label: "#3", value: 6, accent: "success", marker: "sorted" },
              { id: "i4", label: "#4", value: 8, accent: "success", marker: "sorted" },
            ],
            max_value: 8,
          },
        ],
        actions: [],
        focus_targets: ["track-main"],
      },
    ],
    timeline: {
      total_steps: 7,
      fps_hint: 12,
      duration_seconds: 8,
    },
  },
  runtime_draft_version: "explainer_draft.v1",
  generation_prompt_digest: "debug-bubble-sort-runtime",
  scene_outline: [
    {
      title: "初始数组",
      summary: "先看原始排列和待比较元素。",
    },
    {
      title: "逐轮冒泡",
      summary: "较大的元素持续向右移动。",
    },
    {
      title: "完成排序",
      summary: "最终得到从小到大的结果。",
    },
  ],
  used_primitives: ["Stage", "Scene", "Caption", "Track", "usePlayback"],
  component_code: componentCode,
  steps: [
    { action: "compare", active_indices: [0, 1], caption: "先比较 5 和 3。", snapshot: [5, 3, 8, 2, 6] },
    { action: "swap", active_indices: [0, 1], swap_indices: [0, 1], caption: "5 大于 3，交换。", snapshot: [3, 5, 8, 2, 6] },
    { action: "compare", active_indices: [1, 2], caption: "继续比较 5 和 8。", snapshot: [3, 5, 8, 2, 6] },
    { action: "compare", active_indices: [2, 3], caption: "比较 8 和 2。", snapshot: [3, 5, 8, 2, 6] },
    { action: "swap", active_indices: [2, 3], swap_indices: [2, 3], caption: "8 大于 2，交换。", snapshot: [3, 5, 2, 8, 6] },
    { action: "compare", active_indices: [3, 4], caption: "比较 8 和 6。", snapshot: [3, 5, 2, 8, 6] },
    { action: "swap", active_indices: [3, 4], swap_indices: [3, 4], caption: "8 大于 6，交换。", snapshot: [3, 5, 2, 6, 8] },
    { action: "compare", active_indices: [0, 1], caption: "第二轮，比较 3 和 5。", snapshot: [3, 5, 2, 6, 8] },
    { action: "compare", active_indices: [1, 2], caption: "比较 5 和 2。", snapshot: [3, 5, 2, 6, 8] },
    { action: "swap", active_indices: [1, 2], swap_indices: [1, 2], caption: "5 大于 2，交换。", snapshot: [3, 2, 5, 6, 8] },
    { action: "compare", active_indices: [0, 1], caption: "最后一轮，比较 3 和 2。", snapshot: [3, 2, 5, 6, 8] },
    { action: "swap", active_indices: [0, 1], swap_indices: [0, 1], caption: "3 大于 2，交换。", snapshot: [2, 3, 5, 6, 8] },
    { action: "done", sorted_indices: [0, 1, 2, 3, 4], caption: "排序完成，得到升序数组。", snapshot: [2, 3, 5, 6, 8] },
  ],
};

export function buildDebugAnimationRuntimeFlowContext(
  contentSnapshot: Record<string, unknown>,
  capabilityReason: string,
  mediaUrl?: string | null
): ToolFlowContext {
  const artifactType = mediaUrl ? "mp4" : "gif";
  return {
    capabilityStatus: "backend_ready",
    capabilityReason,
    latestArtifacts: [
      {
        artifactId: "anim-artifact-debug-fixture",
        title:
          typeof contentSnapshot.title === "string"
            ? contentSnapshot.title
            : "动画运行时调试",
        status: "completed",
        createdAt: "2026-04-18T09:00:00.000Z",
      },
    ],
    resolvedArtifact: {
      artifactId: "anim-artifact-debug-fixture",
      artifactType,
      contentKind: "media",
      content: mediaUrl ?? null,
      artifactMetadata: {
        content_snapshot: contentSnapshot,
        cloud_video_status: mediaUrl ? "succeeded" : undefined,
      },
    },
  };
}
