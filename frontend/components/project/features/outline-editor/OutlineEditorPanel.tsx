"use client";

import type {
  OutlineEditorConfig,
  OutlineEditorPanelProps,
} from "./types";
import { useOutlineStreamState } from "./useOutlineStreamState";
import { OutlineEditorHeader } from "./components/OutlineEditorHeader";
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
  const state = useOutlineStreamState({
    topic,
    isBootstrapping,
    onConfirm,
    onPreview,
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <OutlineEditorHeader
        topic={topic}
        phaseText={state.phaseText}
        canGoPreview={state.canGoPreview}
        canConfirm={state.canConfirm}
        isConfirming={state.isConfirming}
        outlineIncomplete={state.outlineIncomplete}
        onBack={onBack}
        onPreview={onPreview}
        onConfirm={() => void state.handleConfirm()}
      />

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

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {state.errorMessage ? (
          <div className="mb-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">
            {state.errorMessage}
          </div>
        ) : null}

        {state.phase !== "editing" ? (
          <div className="mb-3 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
            Diego 正在流式生成大纲，卡片内容会实时填充。
            {state.targetPageCount > 0
              ? ` 当前目标页数：${state.targetPageCount}。`
              : ""}
          </div>
        ) : (
          <div className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            大纲已完成，当前为可编辑状态。
          </div>
        )}

        {state.outlineIncomplete ? (
          <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            大纲尚未完整：已就绪 {state.readySlidesCount}/
            {state.targetPageCount} 页。
          </div>
        ) : null}

        <div className="space-y-3">
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
            />
          ))}
        </div>
      </div>
    </div>
  );
}
