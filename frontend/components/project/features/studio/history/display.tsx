"use client";

import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2,
  Clock3,
  Loader2,
  XCircle,
} from "lucide-react";
import { TOOL_COLORS, TOOL_ICONS } from "../constants";
import type { StudioHistoryItem } from "./types";

export type HistoryDisplayState =
  | "outline_generating"
  | "outline_pending_confirm"
  | "slides_generating"
  | "slide_preview_ready"
  | "completed"
  | "failed"
  | "processing"
  | "previewing"
  | "pending"
  | "draft";

export function resolveHistoryDisplayState(
  item: StudioHistoryItem
): HistoryDisplayState {
  if (item.toolType === "ppt") {
    if (item.status === "failed") return "failed";
    if (item.status === "completed") return "completed";
    if (item.ppt_status) return item.ppt_status;
    if (item.status === "previewing") return "slide_preview_ready";
    if (item.status === "processing") return "slides_generating";
    if (item.status === "draft") return "outline_generating";
  }
  if (item.status === "completed") return "completed";
  if (item.status === "failed") return "failed";
  if (item.status === "processing") return "processing";
  if (item.status === "previewing") return "previewing";
  if (item.status === "pending") return "pending";
  return "draft";
}

export function resolveHistoryStatusText(item: StudioHistoryItem): string {
  const state = resolveHistoryDisplayState(item);
  if (state === "outline_generating") return "大纲生成中";
  if (state === "outline_pending_confirm") return "大纲待确认";
  if (state === "slides_generating") return "课件生成中";
  if (state === "slide_preview_ready") return "单页可预览";
  if (state === "completed") {
    return item.toolType === "ppt" ? "已完成" : "可预览";
  }
  if (state === "failed") return "失败";
  if (state === "processing") return "生成中";
  if (state === "previewing") return "可预览";
  if (state === "pending") return "排队中";
  return "草稿中";
}

export function resolveHistoryStatusBadgeClass(item: StudioHistoryItem): string {
  const state = resolveHistoryDisplayState(item);
  if (state === "slides_generating" || state === "processing") {
    return "bg-blue-100 text-blue-700";
  }
  if (
    state === "completed" ||
    state === "previewing" ||
    state === "slide_preview_ready"
  ) {
    return "bg-emerald-100 text-emerald-700";
  }
  if (state === "failed") {
    return "bg-red-100 text-red-700";
  }
  if (state === "pending") {
    return "bg-zinc-100 text-zinc-700";
  }
  if (state === "outline_pending_confirm") {
    return "bg-orange-100 text-orange-700";
  }
  return "bg-amber-100 text-amber-700";
}

export function resolveHistoryTypeIcon(toolType: StudioHistoryItem["toolType"]): LucideIcon {
  return TOOL_ICONS[toolType];
}

export function resolveHistoryTypeColor(toolType: StudioHistoryItem["toolType"]) {
  return TOOL_COLORS[toolType] ?? TOOL_COLORS.ppt;
}

type HistoryStatusVisual = {
  icon: LucideIcon | null;
  className: string;
  iconClassName?: string;
  dotClassName?: string;
};

export function resolveHistoryStatusVisual(
  item: StudioHistoryItem
): HistoryStatusVisual {
  const state = resolveHistoryDisplayState(item);
  if (state === "completed" || state === "previewing" || state === "slide_preview_ready") {
    return {
      icon: CheckCircle2,
      className:
        "border-emerald-200 bg-white text-emerald-600 shadow-[0_2px_6px_rgba(16,185,129,0.18)]",
      iconClassName: "h-3 w-3",
    };
  }
  if (state === "failed") {
    return {
      icon: XCircle,
      className:
        "border-red-200 bg-white text-red-600 shadow-[0_2px_6px_rgba(239,68,68,0.18)]",
      iconClassName: "h-3 w-3",
    };
  }
  if (state === "slides_generating" || state === "processing") {
    return {
      icon: Loader2,
      className:
        "border-blue-200 bg-white text-blue-600 shadow-[0_2px_6px_rgba(59,130,246,0.18)]",
      iconClassName: "h-3 w-3 animate-spin",
    };
  }
  if (state === "pending" || state === "outline_pending_confirm") {
    return {
      icon: Clock3,
      className:
        "border-orange-200 bg-white text-orange-600 shadow-[0_2px_6px_rgba(249,115,22,0.16)]",
      iconClassName: "h-3 w-3",
    };
  }
  return {
    icon: null,
    className:
      "border-amber-200 bg-white shadow-[0_2px_6px_rgba(245,158,11,0.14)]",
    dotClassName: "h-1.5 w-1.5 rounded-full bg-amber-500",
  };
}
