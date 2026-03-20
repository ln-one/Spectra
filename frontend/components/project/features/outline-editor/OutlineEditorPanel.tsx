"use client";

import { CompactOutlineView } from "./components/CompactOutlineView";
import { DefaultOutlineView } from "./components/DefaultOutlineView";
import { useOutlineEditorController } from "./hooks/useOutlineEditorController";
import type { OutlineEditorPanelProps } from "./types";

export type { OutlineEditorConfig, OutlineEditorPanelProps } from "./types";

export function OutlineEditorPanel(props: OutlineEditorPanelProps) {
  const controller = useOutlineEditorController(props);

  if (props.variant === "compact") {
    return (
      <CompactOutlineView
        topic={controller.topic}
        slides={controller.slides}
        activeSlideId={controller.activeSlideId}
        setActiveSlideId={controller.setActiveSlideId}
        isGenerating={controller.isGenerating}
        isOutlineHydrating={controller.isOutlineHydrating}
        progress={controller.progress}
        progressText={controller.progressText}
        generationFailed={controller.generationFailed}
        expectedPages={controller.expectedPages}
        outlineIncomplete={controller.outlineIncomplete}
        detailLevel={controller.detailLevel}
        setDetailLevel={controller.setDetailLevel}
        imageStyle={controller.imageStyle}
        setImageStyle={controller.setImageStyle}
        totalEstimatedMinutes={controller.totalEstimatedMinutes}
        estimatedTokens={controller.estimatedTokens}
        onBack={props.onBack}
        onAddSlide={controller.handleAddSlide}
        onDeleteSlide={controller.handleDeleteSlide}
        onStartGeneration={controller.handleStartGeneration}
        onGoToPreview={controller.handleGoToPreview}
        scrollAreaRef={controller.scrollAreaRef}
      />
    );
  }

  return (
    <DefaultOutlineView
      topic={controller.topic}
      onBack={props.onBack}
      isBootstrapping={controller.isBootstrapping}
      slides={controller.slides}
      activeSlideId={controller.activeSlideId}
      isGenerating={controller.isGenerating}
      isOutlineHydrating={controller.isOutlineHydrating}
      showSettings={controller.showSettings}
      setShowSettings={controller.setShowSettings}
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
      onGoToPreview={controller.handleGoToPreview}
    />
  );
}
