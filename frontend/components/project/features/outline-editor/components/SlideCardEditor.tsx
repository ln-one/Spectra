"use client";

import { GripVertical } from "lucide-react";
import { Reorder, useDragControls } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_LAYOUT_BY_PAGE_TYPE,
  LAYOUT_OPTIONS_BY_PAGE_TYPE,
  PAGE_TYPE_OPTIONS,
} from "../constants";
import type { SlideDraft } from "../types";
import { normalizeLayoutHint, normalizePageType } from "../utils";
import { TokenRevealText } from "./TokenRevealText";

interface SlideCardEditorProps {
  slide: SlideDraft;
  index: number;
  isEditable: boolean;
  isEditingTitle: boolean;
  isEditingContent: boolean;
  onStartEditTitle: () => void;
  onStopEditTitle: () => void;
  onStartEditContent: () => void;
  onStopEditContent: () => void;
  onFieldChange: (slideId: string, updates: Partial<SlideDraft>) => void;
  onAttemptEditWhenDisabled: () => void;
}

export function SlideCardEditor({
  slide,
  index,
  isEditable,
  isEditingTitle,
  isEditingContent,
  onStartEditTitle,
  onStopEditTitle,
  onStartEditContent,
  onStopEditContent,
  onFieldChange,
  onAttemptEditWhenDisabled,
}: SlideCardEditorProps) {
  const dragControls = useDragControls();
  const layoutOptions = LAYOUT_OPTIONS_BY_PAGE_TYPE[slide.pageType];
  const pageTypeLabel =
    PAGE_TYPE_OPTIONS.find((o) => o.value === slide.pageType)?.label ||
    slide.pageType;
  const keyPointsText = slide.keyPoints.join("\n");

  const handleContainerClick = (handler: () => void) => {
    if (isEditable) {
      handler();
    } else {
      onAttemptEditWhenDisabled();
    }
  };

  return (
    <Reorder.Item
      value={slide}
      dragListener={false}
      dragControls={dragControls}
      className="relative group/card rounded-xl border border-zinc-200/80 bg-white p-4 shadow-sm transition-all hover:shadow-md"
    >
      {/* Drag Handle */}
      {isEditable && (
        <div
          className="absolute left-1.5 top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing p-1 opacity-0 group-hover/card:opacity-100 transition-opacity"
          onPointerDown={(e) => dragControls.start(e)}
        >
          <GripVertical className="h-4 w-4 text-zinc-400 hover:text-zinc-600" />
        </div>
      )}

      <div className="flex gap-4 items-start pl-5">
        {/* Index Number */}
        <div className="flex-shrink-0 select-none pt-1 text-sm font-semibold text-zinc-300">
          {String(index + 1).padStart(2, "0")}
        </div>

        {/* Content Area (Title & Key Points) */}
        <div className="min-w-0 flex-1 pr-4">
          {/* Title */}
          <div className="mb-2 flex items-start gap-3">
            <span className="mt-0.5 shrink-0 rounded bg-blue-50/80 px-2 py-0.5 text-[11px] font-medium text-blue-600">
              {pageTypeLabel}
            </span>
            {isEditingTitle ? (
              <Input
                autoFocus
                value={slide.title}
                onChange={(event) =>
                  onFieldChange(slide.id, {
                    title: event.target.value,
                  })
                }
                onBlur={onStopEditTitle}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    onStopEditTitle();
                  }
                }}
                disabled={!isEditable}
                className="h-7 py-1 text-[15px] font-semibold border-blue-400 focus-visible:ring-1 focus-visible:ring-blue-400"
              />
            ) : (
              <div
                className={`flex-1 transition-all rounded px-2 -mx-2 py-0.5 cursor-pointer ${
                  isEditable ? "hover:bg-zinc-50 hover:ring-1 hover:ring-zinc-200" : ""
                }`}
                onClick={() => handleContainerClick(onStartEditTitle)}
              >
                <span className="text-[15px] font-semibold text-zinc-900 leading-relaxed block min-h-[28px]">
                  <TokenRevealText
                    text={slide.title}
                    animate={!isEditable}
                  />
                </span>
              </div>
            )}
          </div>

          {/* Key Points */}
          <div className="pl-[52px]">
            {isEditingContent ? (
              <Textarea
                autoFocus
                value={keyPointsText}
                onChange={(event) =>
                  onFieldChange(slide.id, {
                    keyPoints: event.target.value
                      .split("\n")
                      .map((line) => line.trim())
                      .filter(Boolean),
                  })
                }
                onBlur={onStopEditContent}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && event.ctrlKey) {
                    onStopEditContent();
                  }
                }}
                disabled={!isEditable}
                placeholder="每行一个要点"
                className="min-h-[80px] resize-y text-[14px] leading-relaxed border-blue-400 focus-visible:ring-1 focus-visible:ring-blue-400"
              />
            ) : (
              <div
                className={`transition-all rounded px-2 -mx-2 py-1 cursor-pointer ${
                  isEditable ? "hover:bg-zinc-50 hover:ring-1 hover:ring-zinc-200" : ""
                }`}
                onClick={() => handleContainerClick(onStartEditContent)}
              >
                <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-zinc-500 min-h-[40px]">
                  {slide.keyPoints.length > 0 ? (
                    <TokenRevealText
                      text={slide.keyPoints.join("\n")}
                      animate={!isEditable}
                    />
                  ) : (
                    ""
                  )}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Side Selectors */}
        <div className="w-28 flex-shrink-0 flex flex-col gap-3 border-l border-zinc-100 pl-4">
          <label className="space-y-1.5">
            <span className="text-[11px] font-medium text-zinc-400">
              页面类型
            </span>
            <select
              value={slide.pageType}
              disabled={!isEditable}
              onChange={(event) => {
                const nextPageType = normalizePageType(
                  event.target.value,
                  slide.pageType
                );
                onFieldChange(slide.id, {
                  pageType: nextPageType,
                  layoutHint: DEFAULT_LAYOUT_BY_PAGE_TYPE[nextPageType],
                });
              }}
              className="h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-[12px] text-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:opacity-70 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none transition-colors cursor-pointer"
            >
              {PAGE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-[11px] font-medium text-zinc-400">
              布局选项
            </span>
            <select
              value={slide.layoutHint}
              disabled={!isEditable}
              onChange={(event) =>
                onFieldChange(slide.id, {
                  layoutHint: normalizeLayoutHint(
                    event.target.value,
                    slide.pageType
                  ),
                })
              }
              className="h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-[12px] text-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:opacity-70 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none transition-colors cursor-pointer"
            >
              {layoutOptions.map((layout) => (
                <option key={layout} value={layout}>
                  {layout === "auto" ? "智能排版" : layout === "one_column" ? "单栏排版" : layout === "two_column" ? "双栏对比" : layout === "timeline" ? "时间轴" : layout === "grid" ? "网格展示" : layout}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </Reorder.Item>
  );
}
