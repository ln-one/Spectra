"use client";

import { WorkbenchOutlineView } from "./components/WorkbenchOutlineView";
import { useOutlineEditorController } from "./useOutlineEditorController";
import type { OutlineEditorPanelProps } from "./types";

export type { OutlineEditorConfig, OutlineEditorPanelProps } from "./types";

export function OutlineEditorPanel(props: OutlineEditorPanelProps) {
  const controller = useOutlineEditorController(props);

  return (
    <WorkbenchOutlineView
      topic={controller.topic}
      onBack={props.onBack}
      isBootstrapping={controller.isBootstrapping}
      slides={controller.slides}
      activeSlideId={controller.activeSlideId}
      isGenerating={controller.isGenerating}
      isRedrafting={controller.isRedrafting}
      isOutlineHydrating={controller.isOutlineHydrating}
      onSetActiveSlide={controller.setActiveSlideId}
      onUpdateSlide={controller.handleUpdateSlide}
      onDeleteSlide={controller.handleDeleteSlide}
      onDuplicateSlide={controller.handleDuplicateSlide}
      onAddSlide={controller.handleAddSlide}
      detailLevel={controller.detailLevel}
      setDetailLevel={controller.setDetailLevel}
      visualTheme={controller.visualTheme}
      setVisualTheme={controller.setVisualTheme}
      imageStyle={controller.imageStyle}
      setImageStyle={controller.setImageStyle}
      keywords={controller.keywords}
      keywordInput={controller.keywordInput}
      setKeywordInput={controller.setKeywordInput}
      onAddKeyword={controller.handleAddKeyword}
      onRemoveKeyword={controller.handleRemoveKeyword}
      expectedPages={controller.expectedPages}
      outlineIncomplete={controller.outlineIncomplete}
      generationFailed={controller.generationFailed}
      totalEstimatedMinutes={controller.totalEstimatedMinutes}
      estimatedTokens={controller.estimatedTokens}
      progress={controller.progress}
      progressText={controller.progressText}
      aspectRatio={controller.aspectRatio}
      setAspectRatio={controller.setAspectRatio}
      onStartGeneration={controller.handleStartGeneration}
      onRedraftOutline={controller.handleRedraftOutline}
      onGoToPreview={controller.handleGoToPreview}
    />
  );
}
