"use client";

import { Pencil } from "lucide-react";
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
}: SlideCardEditorProps) {
  const layoutOptions = LAYOUT_OPTIONS_BY_PAGE_TYPE[slide.pageType];
  const pageTypeLabel =
    PAGE_TYPE_OPTIONS.find((o) => o.value === slide.pageType)?.label ||
    slide.pageType;
  const keyPointsText = slide.keyPoints.join("\n");

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex gap-3">
        <div className="flex-shrink-0 select-none pt-0.5 text-sm font-medium text-zinc-400">
          {String(index + 1).padStart(2, "0")}
        </div>
        <div className="min-w-0 flex-1">
          {/* Title */}
          <div className="mb-1 flex items-start gap-2">
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
                className="h-7 py-1 text-[15px] font-semibold"
              />
            ) : (
              <div
                className="group relative flex-1 cursor-pointer"
                onClick={() => isEditable && onStartEditTitle()}
                title={isEditable ? "点击编辑标题" : undefined}
              >
                <span className="text-[15px] font-semibold text-zinc-900">
                  <TokenRevealText
                    text={slide.title}
                    animate={!isEditable}
                  />
                </span>
                {isEditable ? (
                  <span className="pointer-events-none absolute -right-5 top-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Pencil className="h-3 w-3 text-zinc-400" />
                  </span>
                ) : null}
              </div>
            )}
            <span className="mt-0.5 shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-600">
              {pageTypeLabel}
            </span>
          </div>

          {/* Key Points */}
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
              className="min-h-[80px] resize-y text-sm leading-6 disabled:cursor-not-allowed disabled:bg-zinc-50"
            />
          ) : (
            <div
              className="group relative cursor-pointer"
              onClick={() => isEditable && onStartEditContent()}
              title={isEditable ? "点击编辑内容" : undefined}
            >
              <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-500">
                {slide.keyPoints.length > 0
                  ? (
                      <TokenRevealText
                        text={slide.keyPoints.join("；")}
                        animate={!isEditable}
                      />
                    )
                  : isEditable
                    ? "点击添加内容描述..."
                    : "暂无内容"}
              </p>
              {isEditable ? (
                <span className="pointer-events-none absolute -right-5 top-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <Pencil className="h-3 w-3 text-zinc-400" />
                </span>
              ) : null}
            </div>
          )}

          {/* Page Type & Layout selectors */}
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-[11px] text-zinc-500">
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
                    layoutHint:
                      DEFAULT_LAYOUT_BY_PAGE_TYPE[nextPageType],
                  });
                }}
                className="h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-50"
              >
                {PAGE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-[11px] text-zinc-500">
                布局提示
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
                className="h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-50"
              >
                {layoutOptions.map((layout) => (
                  <option key={layout} value={layout}>
                    {layout}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
