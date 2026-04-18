"use client";

import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import type { PanelPhase, StreamLog } from "../types";
import { parseDetailSections, toneClassName } from "../utils";
import { TokenRevealText } from "./TokenRevealText";

interface PreambleLogPanelProps {
  preambleCollapsed: boolean;
  onToggleCollapse: () => void;
  logTitle: string;
  streamLogs: StreamLog[];
  logContainerRef: React.Ref<HTMLDivElement>;
  streamError: unknown;
  isConnected: boolean;
  sessionState: string;
  phase: PanelPhase;
}

export function PreambleLogPanel({
  preambleCollapsed,
  onToggleCollapse,
  logTitle,
  streamLogs,
  logContainerRef,
  streamError,
  isConnected,
  sessionState,
  phase,
}: PreambleLogPanelProps) {
  if (preambleCollapsed) {
    return (
      <div className="border-b border-zinc-100 bg-zinc-50/50 px-6 py-2">
        <button
          type="button"
          className="flex w-full items-center justify-between text-[13px] text-zinc-500 hover:text-zinc-700 transition-colors"
          onClick={onToggleCollapse}
        >
          <span className="flex items-center gap-2">
            {logTitle}
            <span className="text-zinc-400 text-xs bg-zinc-200/50 px-1.5 py-0.5 rounded-md">
              {streamLogs.length}
            </span>
          </span>
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-white">
      <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-100/50">
        <span className="text-sm font-medium text-zinc-800 flex items-center gap-2">
          需求与受众分析
          <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
        </span>
        <button
          type="button"
          className="p-1 text-zinc-400 hover:text-zinc-600 rounded-md hover:bg-zinc-100 transition-colors"
          onClick={onToggleCollapse}
        >
          <ChevronUp className="h-4 w-4" />
        </button>
      </div>
      
      <div
        ref={logContainerRef}
        className="flex-1 overflow-y-auto px-8 py-6 space-y-6"
      >
        {streamLogs.length === 0 ? (
          <div className="flex items-center gap-3 text-sm text-zinc-500 py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            {streamError
              ? "连接失败，正在同步状态..."
              : !isConnected
                ? [
                      "AWAITING_OUTLINE_CONFIRM",
                      "GENERATING_CONTENT",
                      "RENDERING",
                      "SUCCESS",
                      "FAILED",
                    ].includes(sessionState)
                  ? "分析已完成"
                  : "正在准备..."
                : phase === "editing"
                  ? "分析已完成"
                  : "正在分析需求..."}
          </div>
        ) : (
          streamLogs.map((item, index) => {
            const detailText = item.detail || "";
            const detailSections =
              item.title === "需求分析结果"
                ? parseDetailSections(detailText)
                : [];
            const isRequirementsCard =
              item.title === "需求分析结果" && detailSections.length > 0;
            const isLatest = index === streamLogs.length - 1;
            const shouldAnimateLog =
              isLatest &&
              phase !== "editing" &&
              !isRequirementsCard &&
              Boolean(detailText);

            return (
              <div key={item.id} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                {!isRequirementsCard && (
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className={`text-sm font-medium ${toneClassName(item.tone)}`}
                    >
                      {item.title}
                    </span>
                  </div>
                )}
                
                {isRequirementsCard ? (
                  <div className="space-y-6">
                    {detailSections.map((section, sectionIndex) => (
                      <div
                        key={`${item.id}:${section.title}:${sectionIndex}`}
                        className="space-y-3"
                      >
                        <h4 className="text-base font-semibold text-zinc-900 flex items-center gap-2">
                          <span className="w-1 h-4 bg-blue-500 rounded-full inline-block" />
                          {section.title}
                        </h4>
                        <div className="space-y-2 pl-3">
                          {section.lines.map((line, lineIndex) => (
                            <p
                              key={`${item.id}:${section.title}:${lineIndex}`}
                              className="text-[15px] leading-relaxed text-zinc-600"
                            >
                              {line.startsWith("-") || line.startsWith("•") 
                                ? <span className="mr-2 text-zinc-400">•</span> 
                                : null}
                              {line.replace(/^[-•]\s*/, "")}
                            </p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : detailText ? (
                  <p className="text-[15px] leading-relaxed text-zinc-600 pl-1 border-l-2 border-zinc-100">
                    <TokenRevealText
                      text={detailText}
                      animate={shouldAnimateLog}
                    />
                  </p>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
