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
  return (
    <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-2">
      <button
        type="button"
        className="flex w-full items-center justify-between text-xs text-zinc-600"
        onClick={onToggleCollapse}
      >
        <span>
          {logTitle}
          <span className="ml-2 text-zinc-400">({streamLogs.length})</span>
        </span>
        {preambleCollapsed ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronUp className="h-3.5 w-3.5" />
        )}
      </button>
      {!preambleCollapsed ? (
        <div className="relative mt-2 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-white to-transparent" />
          <div
            ref={logContainerRef}
            className="max-h-44 space-y-2 overflow-y-auto px-3 py-3"
          >
            {streamLogs.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {streamError
                  ? "Diego 事件流连接失败，正在同步任务状态..."
                  : !isConnected
                    ? [
                          "AWAITING_OUTLINE_CONFIRM",
                          "GENERATING_CONTENT",
                          "RENDERING",
                          "SUCCESS",
                          "FAILED",
                        ].includes(sessionState)
                      ? "当前 run 暂无可展示过程日志"
                      : "正在连接 Diego 事件流..."
                    : phase === "editing"
                      ? "当前 run 暂无可展示过程日志"
                      : "正在等待 Diego 返回过程信息..."}
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
                  <div key={item.id} className="rounded-lg border border-zinc-100 bg-zinc-50/60 p-2.5">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-zinc-400">
                        {new Date(item.ts).toLocaleTimeString()}
                      </span>
                      <span
                        className={`text-xs font-semibold ${toneClassName(item.tone)}`}
                      >
                        {item.title}
                      </span>
                    </div>
                    {isRequirementsCard ? (
                      <div className="space-y-2 rounded-xl border border-emerald-100 bg-white p-3">
                        {detailSections.map((section, sectionIndex) => (
                          <div
                            key={`${item.id}:${section.title}:${sectionIndex}`}
                            className="space-y-1"
                          >
                            <p className="text-sm font-semibold text-zinc-800">
                              {section.title}
                            </p>
                            <div className="space-y-1">
                              {section.lines.map((line, lineIndex) => (
                                <p
                                  key={`${item.id}:${section.title}:${lineIndex}`}
                                  className="whitespace-pre-wrap break-words text-xs leading-relaxed text-zinc-600"
                                >
                                  {line}
                                </p>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : detailText ? (
                      <p className="text-xs text-zinc-600">
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
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-white to-transparent" />
        </div>
      ) : null}
    </div>
  );
}
