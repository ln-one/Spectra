import { useEffect, useMemo, useState } from "react";
import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

type AlgorithmType =
  | "bubble_sort"
  | "selection_sort"
  | "insertion_sort"
  | "binary_search";

type AlgorithmStep = {
  action?: string;
  active_indices?: number[];
  swap_indices?: number[];
  sorted_indices?: number[];
  pointer_indices?: number[];
  caption?: string;
  snapshot?: number[];
};

type AlgorithmSpec = {
  algorithm_type?: string;
  title?: string;
  summary?: string;
  dataset?: number[];
  steps?: AlgorithmStep[];
};

interface AlgorithmAnimationWorkbenchProps {
  spec: AlgorithmSpec;
}

function getAlgorithmLabel(algorithmType: AlgorithmType | string | undefined) {
  switch (algorithmType) {
    case "bubble_sort":
      return "冒泡排序";
    case "selection_sort":
      return "选择排序";
    case "insertion_sort":
      return "插入排序";
    case "binary_search":
      return "二分查找";
    default:
      return "算法动画";
  }
}

function isSupportedAlgorithm(
  algorithmType: string | undefined
): algorithmType is AlgorithmType {
  return (
    algorithmType === "bubble_sort" ||
    algorithmType === "selection_sort" ||
    algorithmType === "insertion_sort" ||
    algorithmType === "binary_search"
  );
}

export function AlgorithmAnimationWorkbench({
  spec,
}: AlgorithmAnimationWorkbenchProps) {
  const steps = Array.isArray(spec.steps) ? spec.steps : [];
  const initialSnapshot = Array.isArray(spec.dataset) ? spec.dataset : [];
  const [stepIndex, setStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  useEffect(() => {
    setStepIndex(0);
    setIsPlaying(false);
  }, [spec.algorithm_type, spec.title]);

  useEffect(() => {
    if (!isPlaying || steps.length <= 1) return undefined;
    const timeout = window.setTimeout(() => {
      setStepIndex((current) => {
        if (current >= steps.length - 1) {
          setIsPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, Math.max(350, 1100 / playbackSpeed));
    return () => window.clearTimeout(timeout);
  }, [isPlaying, playbackSpeed, stepIndex, steps.length]);

  const currentStep = steps[stepIndex] ?? null;
  const snapshot = Array.isArray(currentStep?.snapshot)
    ? currentStep.snapshot
    : initialSnapshot;
  const maxValue = Math.max(...snapshot, 1);

  const activeSet = useMemo(
    () => new Set(currentStep?.active_indices ?? []),
    [currentStep?.active_indices]
  );
  const swapSet = useMemo(
    () => new Set(currentStep?.swap_indices ?? []),
    [currentStep?.swap_indices]
  );
  const sortedSet = useMemo(
    () => new Set(currentStep?.sorted_indices ?? []),
    [currentStep?.sorted_indices]
  );
  const pointerIndices = currentStep?.pointer_indices ?? [];

  if (!isSupportedAlgorithm(spec.algorithm_type) || steps.length === 0) {
    return null;
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-900">算法动画工作面</p>
          <p className="mt-1 text-[11px] text-zinc-500">
            直接根据后端返回的步骤数据演示
            {getAlgorithmLabel(spec.algorithm_type)}，支持播放、暂停、重播和单步查看。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] text-zinc-600">
            {getAlgorithmLabel(spec.algorithm_type)}
          </span>
          <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] text-zinc-600">
            第 {stepIndex + 1} / {steps.length} 步
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_280px]">
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="flex h-[280px] items-end justify-center gap-3">
            {snapshot.map((value, index) => {
              const isActive = activeSet.has(index);
              const isSwap = swapSet.has(index);
              const isSorted = sortedSet.has(index);
              return (
                <div key={`${index}-${value}`} className="flex flex-col items-center gap-2">
                  {pointerIndices.includes(index) ? (
                    <span className="text-[10px] font-semibold text-sky-600">
                      指针
                    </span>
                  ) : (
                    <span className="h-[14px]" />
                  )}
                  <motion.div
                    layout
                    transition={{ type: "spring", stiffness: 260, damping: 24 }}
                    className="flex w-12 items-end justify-center rounded-t-2xl text-xs font-semibold text-white shadow-sm"
                    style={{
                      height: `${Math.max(36, (value / maxValue) * 200)}px`,
                      background: isSwap
                        ? "linear-gradient(180deg, #f97316 0%, #ea580c 100%)"
                        : isActive
                          ? "linear-gradient(180deg, #38bdf8 0%, #2563eb 100%)"
                          : isSorted
                            ? "linear-gradient(180deg, #34d399 0%, #059669 100%)"
                            : "linear-gradient(180deg, #94a3b8 0%, #64748b 100%)",
                    }}
                    data-testid={`algorithm-bar-${index}`}
                  >
                    <span className="mb-2">{value}</span>
                  </motion.div>
                  <span className="text-[11px] text-zinc-500">#{index}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-[11px] font-medium text-zinc-700">当前步骤说明</p>
            <p className="mt-2 text-sm font-semibold text-zinc-900">
              {currentStep?.caption ?? spec.summary ?? "等待步骤说明"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-zinc-600">
              <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1">
                动作：{currentStep?.action ?? "未标注"}
              </span>
              <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-1">
                高亮：{(currentStep?.active_indices ?? []).join(", ") || "无"}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                className="h-8 rounded-lg bg-blue-600 text-xs hover:bg-blue-500"
                onClick={() => setIsPlaying((current) => !current)}
              >
                {isPlaying ? (
                  <>
                    <Pause className="mr-1.5 h-3.5 w-3.5" />
                    暂停
                  </>
                ) : (
                  <>
                    <Play className="mr-1.5 h-3.5 w-3.5" />
                    播放
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() =>
                  setStepIndex((current) => Math.min(current + 1, steps.length - 1))
                }
              >
                <SkipForward className="mr-1.5 h-3.5 w-3.5" />
                单步前进
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  setIsPlaying(false);
                  setStepIndex(0);
                }}
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                重播
              </Button>
            </div>

            <div className="mt-4 space-y-2">
              <p className="text-[11px] font-medium text-zinc-700">
                播放速度：{playbackSpeed.toFixed(1)}x
              </p>
              <Slider
                value={[playbackSpeed]}
                min={0.5}
                max={2}
                step={0.1}
                onValueChange={(value) => setPlaybackSpeed(value[0] ?? 1)}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
