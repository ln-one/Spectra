import { BookOpen, CircleCheck, Download, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CapabilityNotice, FallbackPreviewHint } from "../CapabilityNotice";
import type { ToolFlowContext } from "../types";

interface PreviewStepProps {
  sandboxTitle: string;
  sandboxDescription: string;
  pseudoCode: string;
  countdown: number;
  life: number;
  lastGeneratedAt: string | null;
  flowContext?: ToolFlowContext;
  onRegenerate: () => void;
  onActionPenalty: () => void;
  onActionReward: () => void;
}

function resolveBackendHtml(flowContext?: ToolFlowContext): string | null {
  if (!flowContext?.resolvedArtifact) return null;
  if (flowContext.resolvedArtifact.contentKind !== "text") return null;
  if (typeof flowContext.resolvedArtifact.content !== "string") return null;
  const raw = flowContext.resolvedArtifact.content.trim();
  if (!raw) return null;
  if (raw.startsWith("{") || raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed.html === "string" && parsed.html.trim()) {
        return parsed.html.trim();
      }
      if (typeof parsed.content_html === "string" && parsed.content_html.trim()) {
        return parsed.content_html.trim();
      }
    } catch {
      // Ignore parse error and fall back to raw text.
    }
  }
  return raw;
}

export function PreviewStep({
  sandboxTitle,
  sandboxDescription,
  pseudoCode,
  countdown,
  life,
  lastGeneratedAt,
  flowContext,
  onRegenerate,
  onActionPenalty,
  onActionReward,
}: PreviewStepProps) {
  const capabilityStatus = flowContext?.capabilityStatus ?? "backend_placeholder";
  const capabilityReason =
    flowContext?.capabilityReason ?? "未获取到后端游戏 HTML 内容，已回退前端示意内容。";
  const backendHtml =
    capabilityStatus === "backend_ready" ? resolveBackendHtml(flowContext) : null;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-3">
        <CapabilityNotice status={capabilityStatus} reason={capabilityReason} />

        <div className="mt-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <CircleCheck className="h-4 w-4 text-emerald-600" />
            <div>
              <p className="text-xs font-semibold text-zinc-800">互动游戏预览（面板内）</p>
              <p className="mt-1 text-[11px] text-zinc-500">
                {lastGeneratedAt
                  ? `最近一次生成：${new Date(lastGeneratedAt).toLocaleString()}`
                  : "当前展示的是生成后的游戏效果。"}
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

        {backendHtml ? (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
            <p className="text-xs font-semibold text-emerald-700">后端游戏内容（HTML Sandbox）</p>
            <iframe
              title="backend-game-preview"
              srcDoc={backendHtml}
              sandbox="allow-scripts allow-same-origin"
              className="mt-2 h-[340px] w-full rounded-lg border border-emerald-200 bg-white"
            />
          </div>
        ) : (
          <>
            <div className="mt-3">
              <FallbackPreviewHint />
            </div>
            <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3">
              <div className="rounded-xl border border-zinc-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Play className="h-4 w-4 text-blue-600" />
                    <p className="text-xs font-semibold text-zinc-800">{sandboxTitle}</p>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                    <span>倒计时 {countdown}s</span>
                    <span>生命值 {life}</span>
                  </div>
                </div>
                <p className="mt-2 text-xs text-zinc-600">{sandboxDescription}</p>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={onActionPenalty}
                  >
                    模拟错误选择（扣生命）
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={onActionReward}
                  >
                    模拟奖励选择（加时间）
                  </Button>
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-zinc-900 bg-zinc-950 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-zinc-200">
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span className="text-[11px]">AI 生成代码（示意）</span>
                </div>
                <pre className="overflow-x-auto text-[11px] leading-5 text-zinc-100">{pseudoCode}</pre>
              </div>
            </div>
          </>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <BookOpen className="h-4 w-4 text-zinc-600" />
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
