import { BookText, CircleCheck, Download, Mic2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CapabilityNotice, FallbackPreviewHint } from "../CapabilityNotice";
import type { ToolFlowContext } from "../types";
import { ACTION_HINT_STYLE } from "./constants";
import type { SlideScriptItem } from "./types";

interface PreviewStepProps {
  scripts: SlideScriptItem[];
  activePage: number;
  lastGeneratedAt: string | null;
  highlightTransition: boolean;
  flowContext?: ToolFlowContext;
  onRegenerate: () => void;
  onSelectPage: (page: number) => void;
  onToggleHighlight: () => void;
}

export function PreviewStep({
  scripts,
  activePage,
  lastGeneratedAt,
  highlightTransition,
  flowContext,
  onRegenerate,
  onSelectPage,
  onToggleHighlight,
}: PreviewStepProps) {
  const capabilityStatus =
    flowContext?.capabilityStatus ?? "backend_not_implemented";
  const capabilityReason =
    flowContext?.capabilityReason ??
    "后端暂未提供结构化讲稿产物，当前使用前端示意提词稿。";
  const activeScript = scripts.find((item) => item.page === activePage) ?? scripts[0];

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-3">
        <CapabilityNotice status={capabilityStatus} reason={capabilityReason} />
        {capabilityStatus !== "backend_ready" ? (
          <div className="mt-3">
            <FallbackPreviewHint />
          </div>
        ) : null}

        <div className="mt-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <CircleCheck className="h-4 w-4 text-emerald-600" />
            <div>
              <p className="text-xs font-semibold text-zinc-800">提词器视图（面板内）</p>
              <p className="mt-1 text-[11px] text-zinc-500">
                {lastGeneratedAt
                  ? `最近一次生成：${new Date(lastGeneratedAt).toLocaleString()}`
                  : "当前展示的是生成后的逐页讲稿。"}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={onRegenerate}
          >
            重新生成
          </Button>
        </div>

        <div className="mt-3 grid grid-cols-[80px_1fr] gap-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3">
          <div className="space-y-2">
            {scripts.map((item) => (
              <button
                key={item.page}
                type="button"
                onClick={() => onSelectPage(item.page)}
                className={`h-14 w-full rounded-md border px-1 text-[11px] transition-colors ${
                  activePage === item.page
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                P{item.page}
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Mic2 className="h-4 w-4 text-zinc-600" />
                <p className="text-xs font-semibold text-zinc-800">
                  第 {activeScript.page} 页 · {activeScript.title}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={onToggleHighlight}
              >
                高亮过渡语
              </Button>
            </div>

            <div className="mt-3 space-y-3">
              <p className="text-[17px] leading-8 text-zinc-800">{activeScript.script}</p>
              {activeScript.actionHint ? (
                <p
                  className={`inline-flex rounded px-2 py-1 text-xs ${ACTION_HINT_STYLE} ${
                    highlightTransition ? "ring-2 ring-violet-200" : ""
                  }`}
                >
                  {activeScript.actionHint}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <BookText className="h-4 w-4 text-zinc-600" />
            <p className="text-xs font-semibold text-zinc-800">最近生成成果</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-zinc-600"
            onClick={() => void flowContext?.onRefine?.()}
            disabled={!flowContext?.canRefine}
          >
            继续润色
          </Button>
        </div>
        <div className="mt-2 space-y-2">
          {flowContext?.latestArtifacts && flowContext.latestArtifacts.length > 0 ? (
            flowContext.latestArtifacts.slice(0, 4).map((item) => (
              <div
                key={item.artifactId}
                className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-zinc-800">{item.title}</p>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    {new Date(item.createdAt).toLocaleString()} · {item.status}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 text-xs"
                  onClick={() => void flowContext.onExportArtifact?.(item.artifactId)}
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  下载
                </Button>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-3 text-[11px] text-zinc-500">
              还没有历史成果。生成完成后会自动出现在这里，方便你随时下载。
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
