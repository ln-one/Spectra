import { Mic2 } from "lucide-react";
import { CapabilityNotice } from "../CapabilityNotice";
import type { ToolFlowContext } from "../types";
import { ACTION_HINT_STYLE } from "./constants";
import type { SlideScriptItem } from "./types";

interface PreviewStepProps {
  activePage: number;
  lastGeneratedAt: string | null;
  highlightTransition: boolean;
  flowContext?: ToolFlowContext;
  onSelectPage: (page: number) => void;
}

function parseBackendScripts(flowContext?: ToolFlowContext): SlideScriptItem[] {
  if (!flowContext?.resolvedArtifact) return [];
  if (flowContext.resolvedArtifact.contentKind !== "json") return [];
  if (
    !flowContext.resolvedArtifact.content ||
    typeof flowContext.resolvedArtifact.content !== "object"
  ) {
    return [];
  }

  const content = flowContext.resolvedArtifact.content as Record<string, unknown>;
  const rawSlides = Array.isArray(content.slides) ? content.slides : [];
  const scripts: SlideScriptItem[] = [];

  for (let index = 0; index < rawSlides.length; index += 1) {
    const slide = rawSlides[index];
    if (!slide || typeof slide !== "object") continue;

    const row = slide as Record<string, unknown>;
    const page = Number(row.page ?? index + 1);
    const title =
      typeof row.title === "string" && row.title.trim()
        ? row.title.trim()
        : `第 ${index + 1} 页`;
    const script =
      typeof row.script === "string" && row.script.trim()
        ? row.script.trim()
        : typeof row.summary === "string" && row.summary.trim()
          ? row.summary.trim()
          : "";
    const actionHint =
      typeof row.action_hint === "string" && row.action_hint.trim()
        ? row.action_hint.trim()
        : undefined;

    if (!Number.isFinite(page) || !script) continue;
    scripts.push({ page, title, script, actionHint });
  }

  return scripts;
}

export function PreviewStep({
  activePage,
  lastGeneratedAt,
  highlightTransition,
  flowContext,
  onSelectPage,
}: PreviewStepProps) {
  const capabilityStatus =
    flowContext?.capabilityStatus ?? "backend_placeholder";
  const capabilityReason =
    flowContext?.capabilityReason ?? "正在等待后端返回真实说课讲稿。";
  const backendScripts = parseBackendScripts(flowContext);
  const activeScript =
    backendScripts.find((item) => item.page === activePage) ??
    backendScripts[0];

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <CapabilityNotice status={capabilityStatus} reason={capabilityReason} />

        <div className="mt-4">
          <p className="text-sm font-semibold text-zinc-900">实时讲稿预览</p>
          <p className="mt-1 text-[11px] text-zinc-500">
            {lastGeneratedAt
              ? `最近一次生成：${new Date(lastGeneratedAt).toLocaleString()}`
              : "这里只展示后端返回的真实逐页讲稿。"}
          </p>
        </div>

        {activeScript ? (
          <div className="mt-4 grid grid-cols-[88px_minmax(0,1fr)] gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
            <div className="space-y-2">
              {backendScripts.map((item) => (
                <button
                  key={item.page}
                  type="button"
                  onClick={() => onSelectPage(item.page)}
                  className={`h-14 w-full rounded-lg border px-2 text-[11px] ${
                    activePage === item.page
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 bg-white text-zinc-600"
                  }`}
                >
                  P{item.page}
                </button>
              ))}
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="flex items-center gap-2 text-zinc-800">
                <Mic2 className="h-4 w-4" />
                <p className="text-sm font-semibold">
                  第 {activeScript.page} 页 · {activeScript.title}
                </p>
              </div>
              <p className="mt-4 whitespace-pre-wrap text-[17px] leading-8 text-zinc-800">
                {activeScript.script}
              </p>
              {activeScript.actionHint ? (
                <p
                  className={`mt-4 inline-flex rounded px-2 py-1 text-xs ${ACTION_HINT_STYLE} ${
                    highlightTransition ? "ring-2 ring-violet-200" : ""
                  }`}
                >
                  {activeScript.actionHint}
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-12 text-center">
            <Mic2 className="mx-auto h-8 w-8 text-zinc-400" />
            <p className="mt-3 text-sm font-medium text-zinc-700">
              暂未收到后端真实说课讲稿
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              当前不再展示前端示意讲稿，等待后端结构化讲稿返回后会直接显示。
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
