"use client";

import { GripVertical } from "lucide-react";
import { Reorder, useDragControls } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_LAYOUT_BY_PAGE_TYPE,
  LAYOUT_OPTIONS_BY_PAGE_TYPE,
  PAGE_TYPE_OPTIONS,
} from "../constants";
import type { SlideDraft } from "../types";
import { normalizeLayoutHint, normalizePageType } from "../utils";
import { TokenRevealText } from "./TokenRevealText";

const LAYOUT_HINT_LABELS: Record<string, string> = {
  "cover-asymmetric": "非对称排版",
  "cover-center": "居中排版",
  "toc-list": "基础列表",
  "toc-grid": "网格平铺",
  "toc-sidebar": "侧边栏样式",
  "toc-cards": "卡片目录",
  "section-center": "居中过渡",
  "section-accent-block": "色块强调",
  "section-split": "双栏分割",
  "content-two-column": "双栏对比",
  "content-icon-rows": "图标排版",
  "content-comparison": "参数对比",
  "content-timeline": "时间轴流",
  "content-stat-callout": "数据突出",
  "content-showcase": "作品展示",
  "summary-takeaways": "要点总结",
  "summary-cta": "引导互动",
  "summary-thankyou": "致谢结束",
  "summary-split": "双栏总结",
};

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
      className="relative group/card py-5 px-2 transition-colors hover:bg-zinc-50/50 border-b border-zinc-100/60 last:border-0"
    >
      {/* Drag Handle */}
      {isEditable && (
        <div
          className="absolute -left-3 top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing p-2 opacity-0 group-hover/card:opacity-100 transition-opacity"
          onPointerDown={(e) => dragControls.start(e)}
          style={{ touchAction: "none" }}
        >
          <GripVertical className="h-4 w-4 text-zinc-300 hover:text-zinc-500 transition-colors" />
        </div>
      )}

      <div className="flex gap-5 items-start pl-3">
        {/* Index Number */}
        <div className="flex-shrink-0 select-none pt-1 text-[13px] font-semibold text-zinc-300 w-6 text-right">
          {String(index + 1).padStart(2, "0")}
        </div>

        {/* Content Area (Title & Key Points) */}
        <div className="min-w-0 flex-1 pr-6">
          {/* Title */}
          <div className="mb-2 flex items-start gap-3">
            <span className="mt-0.5 shrink-0 rounded bg-blue-50/60 px-2 py-0.5 text-[11px] font-medium text-blue-600 ring-1 ring-blue-100/50">
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
                className="h-7 py-1 text-[16px] font-semibold border-blue-300 focus-visible:ring-1 focus-visible:ring-blue-300 shadow-none rounded-sm"
              />
            ) : (
              <div
                className={`flex-1 transition-all rounded px-2 -mx-2 py-0.5 cursor-pointer ${
                  isEditable ? "hover:bg-white hover:shadow-sm ring-1 ring-transparent hover:ring-zinc-200" : ""
                }`}
                onClick={() => handleContainerClick(onStartEditTitle)}
              >
                <span className="text-[16px] font-semibold text-zinc-800 leading-relaxed block min-h-[28px] tracking-tight">
                  <TokenRevealText
                    text={slide.title}
                    animate={!isEditable}
                  />
                </span>
              </div>
            )}
          </div>

          {/* Key Points */}
          <div className="pl-[54px] mt-1.5">
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
                placeholder="每行一个要点，按 Ctrl+Enter 确认"
                className="min-h-[80px] resize-y text-[14px] leading-relaxed border-blue-300 focus-visible:ring-1 focus-visible:ring-blue-300 shadow-none rounded-sm"
              />
            ) : (
              <div
                className={`transition-all rounded px-2 -mx-2 py-1.5 cursor-pointer ${
                  isEditable ? "hover:bg-white hover:shadow-sm ring-1 ring-transparent hover:ring-zinc-200" : ""
                }`}
                onClick={() => handleContainerClick(onStartEditContent)}
              >
                <div className="whitespace-pre-wrap text-[14px] leading-relaxed text-zinc-500 min-h-[40px]">
                  {slide.keyPoints.length > 0 ? (
                    <TokenRevealText
                      text={slide.keyPoints.join("\n")}
                      animate={!isEditable}
                    />
                  ) : (
                    ""
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side Selectors */}
        <div className="w-32 flex-shrink-0 flex flex-col gap-3.5 border-l border-zinc-100/60 pl-5 opacity-0 group-hover/card:opacity-100 transition-opacity focus-within:opacity-100 pt-1">
          <label className="space-y-1.5">
            <span className="text-[11px] font-medium text-zinc-400 pl-1 tracking-wider">
              页面类型
            </span>
            <Select
              disabled={!isEditable}
              value={slide.pageType}
              onValueChange={(value) => {
                const nextPageType = normalizePageType(value, slide.pageType);
                onFieldChange(slide.id, {
                  pageType: nextPageType,
                  layoutHint: DEFAULT_LAYOUT_BY_PAGE_TYPE[nextPageType],
                });
              }}
            >
              <SelectTrigger className="h-8 text-[13px] border-transparent hover:border-zinc-200 bg-transparent hover:bg-white shadow-none px-2 focus:ring-1 focus:ring-blue-300 transition-all font-medium text-zinc-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value} className="text-[13px]">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="space-y-1.5">
            <span className="text-[11px] font-medium text-zinc-400 pl-1 tracking-wider">
              布局选项
            </span>
            <Select
              disabled={!isEditable}
              value={slide.layoutHint}
              onValueChange={(value) => {
                onFieldChange(slide.id, {
                  layoutHint: normalizeLayoutHint(value, slide.pageType),
                });
              }}
            >
              <SelectTrigger className="h-8 text-[13px] border-transparent hover:border-zinc-200 bg-transparent hover:bg-white shadow-none px-2 focus:ring-1 focus:ring-blue-300 transition-all font-medium text-zinc-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {layoutOptions.map((layout) => (
                  <SelectItem key={layout} value={layout} className="text-[13px]">
                    {LAYOUT_HINT_LABELS[layout] || layout}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>
      </div>
    </Reorder.Item>
  );
}
