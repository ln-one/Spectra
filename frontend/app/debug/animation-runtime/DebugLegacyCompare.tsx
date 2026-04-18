"use client";

import {
  ANIMATION_STYLE_PACK_SWATCHES,
  resolveDefaultExplainerStylePack,
} from "@/components/project/features/studio/tools/animation/constants";
import { LegacyAnimationGraphRenderer } from "@/components/project/features/studio/tools/animation/runtime/legacyGraphRenderer";
import { PlaybackProvider } from "@/components/project/features/studio/tools/animation/runtime/playbackState";
import { readAnimationRuntimeSnapshot } from "@/components/project/features/studio/tools/animation/runtime/snapshot";
import type { ToolFlowContext } from "@/components/project/features/studio/tools/types";

function resolveTheme(stylePack?: string | null) {
  const resolvedStylePack = stylePack ?? resolveDefaultExplainerStylePack();
  return (
    ANIMATION_STYLE_PACK_SWATCHES[
      resolvedStylePack as keyof typeof ANIMATION_STYLE_PACK_SWATCHES
    ] ?? ANIMATION_STYLE_PACK_SWATCHES.teaching_ppt_minimal_gray
  );
}

export function DebugLegacyCompare({
  flowContext,
}: {
  flowContext: ToolFlowContext;
}) {
  const snapshot = readAnimationRuntimeSnapshot({ flowContext, serverSpecPreview: null });
  if (!snapshot?.runtimeGraph) return null;

  return (
    <section className="mt-6 rounded-2xl border border-zinc-200/80 bg-white px-4 py-4 shadow-sm">
      <div className="mb-3">
        <p className="text-xs font-semibold text-zinc-800">Legacy Compare</p>
        <p className="mt-1 text-[11px] text-zinc-500">
          这里只用于迁移对照。正式主预览已经默认走新链。
        </p>
      </div>
      <PlaybackProvider
        value={{
          isPlaying: false,
          stepIndex: 0,
          totalSteps: snapshot.runtimeGraph.timeline.total_steps,
          globalProgress: 0,
          sceneIndex: 0,
          sceneProgress: 0,
          playbackSpeed: 1,
        }}
      >
        <LegacyAnimationGraphRenderer
          graph={snapshot.runtimeGraph}
          theme={resolveTheme(snapshot.stylePack)}
        />
      </PlaybackProvider>
    </section>
  );
}
