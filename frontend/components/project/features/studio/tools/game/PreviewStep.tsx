import { Gamepad2 } from "lucide-react";
import { CapabilityNotice } from "../CapabilityNotice";
import type { ToolFlowContext } from "../types";

interface PreviewStepProps {
  lastGeneratedAt: string | null;
  flowContext?: ToolFlowContext;
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
      return raw;
    }
  }
  return raw;
}

export function PreviewStep({ lastGeneratedAt, flowContext }: PreviewStepProps) {
  const capabilityStatus = flowContext?.capabilityStatus ?? "backend_placeholder";
  const capabilityReason =
    flowContext?.capabilityReason ?? "正在等待后端返回真实游戏内容。";
  const backendHtml =
    capabilityStatus === "backend_ready" ? resolveBackendHtml(flowContext) : null;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <CapabilityNotice status={capabilityStatus} reason={capabilityReason} />

        <div className="mt-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-900">实时游戏预览</p>
            <p className="mt-1 text-[11px] text-zinc-500">
              {lastGeneratedAt
                ? `最近一次生成：${new Date(lastGeneratedAt).toLocaleString()}`
                : "这里只显示后端返回的真实可玩游戏。"}
            </p>
          </div>
        </div>

        {backendHtml ? (
          <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <iframe
              title="backend-game-preview"
              srcDoc={backendHtml}
              sandbox="allow-scripts allow-same-origin"
              className="h-[560px] w-full bg-white"
            />
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-12 text-center">
            <Gamepad2 className="mx-auto h-8 w-8 text-zinc-400" />
            <p className="mt-3 text-sm font-medium text-zinc-700">暂未收到后端真实游戏</p>
            <p className="mt-1 text-[11px] text-zinc-500">
              当前不再渲染前端示意沙箱，等待后端 HTML 返回后会直接可玩。
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
