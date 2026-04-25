"use client";

import { Play, Loader2 } from "lucide-react";
import { Reorder } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type {
  OutlineEditorConfig,
  OutlineEditorPanelProps,
} from "./types";
import { useOutlineStreamState } from "./useOutlineStreamState";
import { PreambleLogPanel } from "./components/PreambleLogPanel";
import { SlideCardEditor } from "./components/SlideCardEditor";

export type { OutlineEditorConfig, OutlineEditorPanelProps } from "./types";

export function OutlineEditorPanel({
  topic = "课程大纲",
  isBootstrapping = false,
  onBack,
  onConfirm,
  onPreview,
}: OutlineEditorPanelProps) {
  const { toast } = useToast();
  const state = useOutlineStreamState({
    topic,
    isBootstrapping,
    onConfirm,
    onPreview,
  });

  const handleAttemptEditWhenDisabled = () => {
    toast({
      description: "AI 正在生成大纲，当前暂不可编辑，请稍候...",
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col relative bg-[#FAFAFA]">
      {/* Floating Top Actions */}
      <div className="absolute top-4 left-0 right-0 flex justify-center z-10 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto shadow-lg shadow-black/5 rounded-full bg-white/80 backdrop-blur-md border border-zinc-200/50 p-1.5">
          {onBack ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="h-8 rounded-full px-4 text-[13px] text-zinc-600 hover:text-zinc-900"
            >
              返回
            </Button>
          ) : null}

          {state.canGoPreview ? (
            <Button
              size="sm"
              onClick={() => onPreview?.()}
              className="h-8 rounded-full px-5 text-[13px] bg-blue-600 hover:bg-blue-700 shadow-sm"
            >
              <Play className="mr-1.5 h-3.5 w-3.5" />
              进入实时生成
            </Button>
          ) : null}

          {!state.canGoPreview ? (
            <Button
              size="sm"
              onClick={() => void state.handleConfirm()}
              disabled={!state.canConfirm || state.outlineIncomplete}
              className="h-8 rounded-full px-5 text-[13px] bg-zinc-900 text-white hover:bg-zinc-800 shadow-sm disabled:bg-zinc-100 disabled:text-zinc-400"
            >
              {state.isConfirming ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="mr-1.5 h-3.5 w-3.5" />
              )}
              {state.isConfirming ? "处理中..." : "确认开始生成"}
            </Button>
          ) : null}
        </div>
      </div>

      <PreambleLogPanel
        preambleCollapsed={state.preambleCollapsed}
        onToggleCollapse={() =>
          state.setPreambleCollapsed((prev) => !prev)
        }
        logTitle={state.logTitle}
        streamLogs={state.streamLogs}
        logContainerRef={state.logContainerRef}
        streamError={state.streamError}
        isConnected={state.isConnected}
        sessionState={state.sessionState}
        phase={state.phase}
      />

      {state.preambleCollapsed && (
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-16">
          <div className="max-w-4xl mx-auto">
            {state.errorMessage ? (
              <div className="mb-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600 shadow-sm">
                {state.errorMessage}
              </div>
            ) : null}

            {state.phase !== "editing" ? (
              <div className="mb-8 rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50/80 to-indigo-50/50 px-6 py-4 shadow-sm flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                <div>
                  <h4 className="text-sm font-semibold text-blue-900">AI 正在为您生成大纲</h4>
                  <p className="text-[13px] text-blue-700/80 mt-0.5">
                    卡片内容会实时填充，生成期间暂不可编辑。
                    {state.targetPageCount > 0
                      ? `当前目标页数：${state.targetPageCount}页。`
                      : ""}
                  </p>
                </div>
              </div>
            ) : (
              <div className="mb-8 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900">{topic}</h2>
                  <p className="text-[13px] text-zinc-500 mt-1">
                    大纲已生成完毕。您可以直接编辑标题和内容，或者拖拽左侧把手调整顺序。
                  </p>
                </div>
              </div>
            )}

            {state.outlineIncomplete ? (
              <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 shadow-sm">
                大纲尚未完整：已就绪 {state.readySlidesCount}/
                {state.targetPageCount} 页。
              </div>
            ) : null}

            <div className="mb-20">
              <Reorder.Group
                axis="y"
                values={state.slides}
                onReorder={state.handleReorderSlides}
                className="flex flex-col gap-2"
              >
                {state.slides.map((slide, index) => (
                  <SlideCardEditor
                    key={slide.id}
                    slide={slide}
                    index={index}
                    isEditable={state.isEditable}
                    isEditingTitle={state.editingTitleId === slide.id}
                    isEditingContent={state.editingContentId === slide.id}
                    onStartEditTitle={() => state.setEditingTitleId(slide.id)}
                    onStopEditTitle={() => state.setEditingTitleId(null)}
                    onStartEditContent={() =>
                      state.setEditingContentId(slide.id)
                    }
                    onStopEditContent={() => state.setEditingContentId(null)}
                    onFieldChange={state.handleSlideFieldChange}
                    onAttemptEditWhenDisabled={handleAttemptEditWhenDisabled}
                  />
                ))}
              </Reorder.Group>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
