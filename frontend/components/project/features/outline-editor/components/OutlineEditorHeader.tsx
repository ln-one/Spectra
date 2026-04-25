"use client";

import { Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OutlineEditorPanelProps } from "../types";

interface OutlineEditorHeaderProps {
  topic: string;
  phaseText: string;
  canGoPreview: boolean;
  canConfirm: boolean;
  isConfirming: boolean;
  outlineIncomplete: boolean;
  onBack: OutlineEditorPanelProps["onBack"];
  onPreview: OutlineEditorPanelProps["onPreview"];
  onConfirm: () => void;
}

export function OutlineEditorHeader({
  topic,
  phaseText,
  canGoPreview,
  canConfirm,
  isConfirming,
  outlineIncomplete,
  onBack,
  onPreview,
  onConfirm,
}: OutlineEditorHeaderProps) {
  return (
    <div className="border-b border-zinc-200 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-zinc-900">
            大纲生成与确认
          </h3>
          <p className="mt-1 truncate text-xs text-zinc-500">{topic}</p>
          <p className="mt-1 text-xs text-zinc-400">{phaseText}</p>
        </div>
        <div className="flex items-center gap-2">
          {onBack ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="h-8 text-xs text-zinc-600"
            >
              返回配置
            </Button>
          ) : null}
          {canGoPreview ? (
            <Button
              size="sm"
              onClick={() => onPreview?.()}
              className="h-8 text-xs"
            >
              <Play className="mr-1 h-3.5 w-3.5" />
              进入实时生成
            </Button>
          ) : null}
          {!canGoPreview ? (
            <Button
              size="sm"
              onClick={onConfirm}
              disabled={!canConfirm || outlineIncomplete}
              className="h-8 text-xs"
            >
              {isConfirming ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="mr-1 h-3.5 w-3.5" />
              )}
              确认开始生成
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
