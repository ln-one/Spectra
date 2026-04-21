import type { AnimationOutputFormat } from "./types";
import type { AnimationArtifactRuntimeSnapshot } from "./runtime/types";

export const BUBBLE_SORT_MOCK_DURATION_SECONDS = 20;
export const BUBBLE_SORT_MOCK_FORMAT: AnimationOutputFormat = "gif";
export const BUBBLE_SORT_EXPORT_WIDTH = 1280;
export const BUBBLE_SORT_EXPORT_HEIGHT = 720;
export const BUBBLE_SORT_EXPORT_FRAME_DELAY_MS = 150;
export const BUBBLE_SORT_EXPORT_TRANSITION_FRAME_COUNT = 5;
export const BUBBLE_SORT_EXPORT_FINAL_HOLD_FRAME_COUNT = 14;

const BUBBLE_SORT_KEYWORDS = ["冒泡排序", "bubble sort", "bubble_sort"];

export interface BubbleSortMockStep {
  action: string;
  active_indices: number[];
  swap_indices?: number[];
  sorted_indices?: number[];
  caption: string;
  snapshot: number[];
}

export interface BubbleSortMockSpec {
  algorithm_type: "bubble_sort";
  title: string;
  summary: string;
  dataset: number[];
  steps: BubbleSortMockStep[];
}

function buildStepTitle(step: BubbleSortMockStep): string {
  if (step.action === "swap") return "发生交换";
  if (step.action === "compare") return "相邻比较";
  return "排序完成";
}

function buildStepBody(step: BubbleSortMockStep): string {
  return step.caption;
}

function buildSceneOutline(totalSteps: number) {
  const introEnd = Math.max(1, Math.min(3, totalSteps - 1));
  const finishStart = Math.max(introEnd + 1, totalSteps - 3);
  return {
    sceneOutline: [
      { title: "初始化数组", summary: "先观察待排序的原始序列。" },
      { title: "逐轮比较交换", summary: "完整执行每一轮相邻比较与交换。" },
      { title: "收束得到有序序列", summary: "已排序区逐步扩展直至完成。" },
    ],
    scenes: [
      {
        id: "scene-1",
        title: "初始化数组",
        summary: "先观察待排序的原始序列。",
        emphasis: "定位当前参与比较的相邻元素。",
        start_step: 0,
        end_step: introEnd,
        focus_targets: ["track-main"],
      },
      {
        id: "scene-2",
        title: "逐轮比较交换",
        summary: "完整执行每一轮相邻比较与交换。",
        emphasis: "更大的元素持续向右冒泡。",
        start_step: Math.min(introEnd + 1, totalSteps - 1),
        end_step: Math.max(Math.min(finishStart - 1, totalSteps - 1), introEnd + 1),
        focus_targets: ["track-main"],
      },
      {
        id: "scene-3",
        title: "收束得到有序序列",
        summary: "已排序区逐步扩展直至完成。",
        emphasis: "最终形成完整升序序列。",
        start_step: finishStart,
        end_step: totalSteps - 1,
        focus_targets: ["track-main"],
      },
    ],
  };
}

export function buildBubbleSortMockRuntimeSnapshot(): AnimationArtifactRuntimeSnapshot {
  const spec = buildBubbleSortMockSpec();
  const maxValue = Math.max(...spec.dataset, 1);
  const steps = spec.steps.map((step, index) => ({
    index,
    primary_caption: {
      title: buildStepTitle(step),
      body: buildStepBody(step),
      secondary_note: null,
    },
    entities: [
      {
        id: "track-main",
        kind: "track_stack",
        items: step.snapshot.map((value, itemIndex) => {
          const isSorted = step.sorted_indices?.includes(itemIndex) ?? false;
          const isSwap = step.swap_indices?.includes(itemIndex) ?? false;
          const isActive = step.active_indices.includes(itemIndex);
          return {
            id: `i${itemIndex}`,
            label: `${itemIndex + 1}`,
            value,
            accent: isSorted ? "success" : isSwap ? "swap" : isActive ? "active" : "muted",
            marker: isSorted ? "sorted" : isSwap ? "swap" : isActive ? "current" : null,
          };
        }),
        max_value: maxValue,
      },
    ],
    actions: [],
    focus_targets: ["track-main"],
  }));
  const { sceneOutline, scenes } = buildSceneOutline(steps.length);

  return {
    runtimeVersion: "animation_runtime.v4",
    componentCode: "",
    compileStatus: "success",
    compileErrors: [],
    runtimeGraphVersion: "generic_explainer_graph.v1",
    runtimeGraph: {
      title: spec.title,
      summary: spec.summary,
      family_hint: "algorithm_demo",
      scene_outline: sceneOutline,
      timeline: {
        total_steps: steps.length,
      },
      scenes,
      steps,
      camera: {
        mode: "fixed",
        focus_region: null,
        zoom_target: null,
      },
      style: {
        tone: "teaching_ppt_minimal_gray",
        density: "balanced",
      },
      used_primitives: ["AnimationGraphRenderer"],
    },
    runtimeSource: "bubble_sort_local_storyboard",
    runtimeContract: "animation_runtime.v4",
    familyHint: "algorithm_demo",
    sceneOutline,
    usedPrimitives: ["AnimationGraphRenderer"],
    generationPromptDigest: "bubble-sort-local-storyboard",
    durationSeconds: Math.max(8, Math.ceil(steps.length / 2)),
    rhythm: "balanced",
    stylePack: "teaching_ppt_minimal_gray",
    title: spec.title,
    summary: spec.summary,
    metadata: {
      kind: "animation_storyboard",
      title: spec.title,
      summary: spec.summary,
      animation_family: "algorithm_demo",
    },
  };
}

function containsBubbleSortKeyword(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return BUBBLE_SORT_KEYWORDS.some((keyword) =>
    normalized.includes(keyword.toLowerCase())
  );
}

export function isBubbleSortMockRequest(...values: Array<string | null | undefined>): boolean {
  return values.some((value) =>
    typeof value === "string" ? containsBubbleSortKeyword(value) : false
  );
}

export function buildBubbleSortMockSpec(): BubbleSortMockSpec {
  const dataset = [9, 4, 7, 2, 6, 1];
  const values = [...dataset];
  const steps: BubbleSortMockStep[] = [
    {
      action: "compare",
      active_indices: [0, 1],
      caption: "原始序列已装载，准备从第一对相邻元素开始比较。",
      snapshot: [...values],
    },
  ];

  for (let pass = 0; pass < values.length - 1; pass += 1) {
    let swapped = false;
    for (let index = 0; index < values.length - 1 - pass; index += 1) {
      const sortedIndices = Array.from(
        { length: pass },
        (_, offset) => values.length - 1 - offset
      ).reverse();
      const left = values[index];
      const right = values[index + 1];
      steps.push({
        action: "compare",
        active_indices: [index, index + 1],
        sorted_indices: sortedIndices,
        caption: `第 ${pass + 1} 轮比较位置 ${index + 1} 和 ${index + 2}：${left} 与 ${right}。`,
        snapshot: [...values],
      });
      if (left > right) {
        values[index] = right;
        values[index + 1] = left;
        swapped = true;
        steps.push({
          action: "swap",
          active_indices: [index, index + 1],
          swap_indices: [index, index + 1],
          sorted_indices: sortedIndices,
          caption: `${left} 大于 ${right}，交换后较大值继续向右冒泡。`,
          snapshot: [...values],
        });
      }
    }

    const settledIndices = Array.from(
      { length: pass + 1 },
      (_, offset) => values.length - 1 - offset
    ).reverse();
    steps.push({
      action: "compare",
      active_indices:
        pass < values.length - 2 ? [0, 1] : [0, 0],
      sorted_indices: settledIndices,
      caption: `第 ${pass + 1} 轮结束，位置 ${values.length - pass} 已进入已排序区。`,
      snapshot: [...values],
    });

    if (!swapped) {
      break;
    }
  }

  steps.push({
    action: "compare",
    active_indices: [0, 0],
    sorted_indices: values.map((_, index) => index),
    caption: "所有轮次完成，序列已经按从小到大完全排好。",
    snapshot: [...values],
  });

  return {
    algorithm_type: "bubble_sort",
    title: "冒泡排序演示动画",
    summary: "白底柱状图完整展示每一次比较、交换与已排序区扩张。",
    dataset,
    steps,
  };
}
