"use client";

import { GripVertical } from "lucide-react";
import { Reorder, useDragControls } from "framer-motion";
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
      className="relative group/card py-6 px-4 transition-colors hover:bg-zinc-50/50 border-b border-zinc-100 last:border-0"
    >
      {/* Drag Handle */}
      {isEditable && (
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing p-2 opacity-0 group-hover/card:opacity-100 transition-opacity"
          onPointerDown={(e) => dragControls.start(e)}
          style={{ touchAction: "none" }}
        >
          <GripVertical className="h-4 w-4 text-zinc-300 hover:text-zinc-500 transition-colors" />
        </div>
      )}

      <div className="flex gap-6 items-start pl-4">
        {/* Index Number */}
        <div className="flex-shrink-0 select-none pt-1.5 text-[14px] font-bold text-zinc-300 w-6 text-right font-mono">
          {String(index + 1).padStart(2, "0")}
        </div>

        {/* Content Area (Title & Key Points) */}
        <div className="min-w-0 flex-1">
          {/* Title */}
          <div className="mb-3 flex items-start gap-3">
            <span className="mt-1 shrink-0 rounded-md bg-blue-50/80 px-2 py-0.5 text-[11px] font-medium text-blue-600 ring-1 ring-blue-100/50">
              {pageTypeLabel}
            </span>
            {isEditingTitle ? (
              <input
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
                className="flex-1 h-8 px-2 -ml-2 text-[16px] font-semibold text-zinc-900 bg-white border border-blue-300 rounded focus-visible:ring-2 focus-visible:ring-blue-100 shadow-sm outline-none"
              />
            ) : (
              <div
                className={`flex-1 h-8 px-2 -ml-2 flex items-center transition-all rounded border border-transparent cursor-pointer ${
                  isEditable ? "hover:bg-white hover:border-zinc-200 hover:shadow-sm" : ""
                }`}
                onClick={() => handleContainerClick(onStartEditTitle)}
              >
                <span className="text-[16px] font-semibold text-zinc-800 tracking-tight">
                  <TokenRevealText
                    text={slide.title}
                    animate={!isEditable}
                  />
                </span>
              </div>
            )}
          </div>

          {/* Key Points */}
          <div className="pl-[58px]">
            {isEditingContent ? (
              <textarea
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
                className="w-full min-h-[80px] px-3 py-2 -ml-3 text-[14px] leading-relaxed text-zinc-700 bg-white border border-blue-300 rounded-lg focus-visible:ring-2 focus-visible:ring-blue-100 shadow-sm resize-y outline-none block"
              />
            ) : (
              <div
                className={`min-h-[80px] px-3 py-2 -ml-3 transition-all rounded-lg border border-transparent cursor-pointer ${
                  isEditable ? "hover:bg-white hover:border-zinc-200 hover:shadow-sm" : ""
                }`}
                onClick={() => handleContainerClick(onStartEditContent)}
              >
                <div className="whitespace-pre-wrap text-[14px] leading-relaxed text-zinc-600">
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
        <div className="w-36 flex-shrink-0 flex flex-col gap-4 border-l border-zinc-100 pl-6 pt-1">
          <label className="space-y-2">
            <span className="text-[11px] font-semibold text-zinc-400 tracking-widest uppercase">
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
              <SelectTrigger className="h-8 text-[13px] border border-zinc-200/60 bg-zinc-50/50 hover:bg-white hover:border-zinc-300 shadow-none px-2.5 focus:ring-2 focus:ring-blue-100 transition-all font-medium text-zinc-700 rounded-md">
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

          <label className="space-y-2">
            <span className="text-[11px] font-semibold text-zinc-400 tracking-widest uppercase">
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
              <SelectTrigger className="h-8 text-[13px] border border-zinc-200/60 bg-zinc-50/50 hover:bg-white hover:border-zinc-300 shadow-none px-2.5 focus:ring-2 focus:ring-blue-100 transition-all font-medium text-zinc-700 rounded-md">
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
