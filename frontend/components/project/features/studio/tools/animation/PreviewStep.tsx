import Image from "next/image";
import { useEffect, useMemo } from "react";
import { BookText, CircleCheck, Download, Paintbrush } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { CapabilityNotice, FallbackPreviewHint } from "../CapabilityNotice";
import type { ToolFlowContext } from "../types";

interface PreviewStepProps {
  codeText: string;
  description: string;
  speed: number;
  showTrail: boolean;
  splitView: boolean;
  lineColor: string;
  lastGeneratedAt: string | null;
  flowContext?: ToolFlowContext;
  onRegenerate: () => void;
  onSpeedChange: (value: number) => void;
  onShowTrailChange: (value: boolean) => void;
  onSplitViewChange: (value: boolean) => void;
  onLineColorChange: (value: string) => void;
  onQuickHalfSpeed: () => void;
  onQuickRedTrail: () => void;
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
      if (
        typeof parsed.content_html === "string" &&
        parsed.content_html.trim()
      ) {
        return parsed.content_html.trim();
      }
    } catch {
      // Ignore parse error and fall back to raw text.
    }
  }
  return raw;
}

export function PreviewStep({
  codeText,
  description,
  speed,
  showTrail,
  splitView,
  lineColor,
  lastGeneratedAt,
  flowContext,
  onRegenerate,
  onSpeedChange,
  onShowTrailChange,
  onSplitViewChange,
  onLineColorChange,
  onQuickHalfSpeed,
  onQuickRedTrail,
}: PreviewStepProps) {
  const capabilityStatus =
    flowContext?.capabilityStatus ?? "backend_placeholder";
  const capabilityReason =
    flowContext?.capabilityReason ??
    "未获取到后端动画内容，已回退前端示意内容。";

  const backendHtml =
    capabilityStatus === "backend_ready"
      ? resolveBackendHtml(flowContext)
      : null;

  const mediaBlob =
    capabilityStatus === "backend_ready" &&
    flowContext?.resolvedArtifact?.contentKind === "media" &&
    flowContext.resolvedArtifact.blob
      ? flowContext.resolvedArtifact.blob
      : null;

  const mediaType = flowContext?.resolvedArtifact?.artifactType;

  const mediaUrl = useMemo(() => {
    if (!mediaBlob) return null;
    return URL.createObjectURL(mediaBlob);
  }, [mediaBlob]);

  useEffect(() => {
    return () => {
      if (mediaUrl) {
        URL.revokeObjectURL(mediaUrl);
      }
    };
  }, [mediaUrl]);

  const hasBackendAnimation = Boolean(backendHtml) || Boolean(mediaUrl);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-3">
        <CapabilityNotice status={capabilityStatus} reason={capabilityReason} />

        <div className="mt-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <CircleCheck className="h-4 w-4 text-emerald-600" />
            <div>
              <p className="text-xs font-semibold text-zinc-800">
                动画预览（代码区 + 渲染区）
              </p>
              <p className="mt-1 text-[11px] text-zinc-500">
                {lastGeneratedAt
                  ? `最近一次生成：${new Date(lastGeneratedAt).toLocaleString()}`
                  : "当前展示的是生成后的动画效果。"}
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

        {hasBackendAnimation ? (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
            <p className="text-xs font-semibold text-emerald-700">
              后端动画内容预览
            </p>
            {backendHtml ? (
              <iframe
                title="backend-animation-html"
                srcDoc={backendHtml}
                sandbox="allow-scripts allow-same-origin"
                className="mt-2 h-[340px] w-full rounded-lg border border-emerald-200 bg-white"
              />
            ) : null}
            {mediaUrl && mediaType === "gif" ? (
              <div className="relative mt-2 h-[340px] w-full overflow-hidden rounded-lg border border-emerald-200 bg-white">
                <Image
                  src={mediaUrl}
                  alt="backend-gif-preview"
                  fill
                  unoptimized
                  className="object-contain"
                />
              </div>
            ) : null}
            {mediaUrl && mediaType === "mp4" ? (
              <video
                src={mediaUrl}
                controls
                className="mt-2 h-[340px] w-full rounded-lg border border-emerald-200 bg-black object-contain"
              />
            ) : null}
          </div>
        ) : (
          <>
            <div className="mt-3">
              <FallbackPreviewHint />
            </div>
            <div
              className={`mt-3 ${splitView ? "grid grid-cols-1 gap-3 lg:grid-cols-2" : "space-y-3"}`}
            >
              <div className="rounded-xl border border-zinc-900 bg-zinc-950 p-3">
                <p className="mb-2 text-[11px] text-zinc-300">
                  动画代码（示意）
                </p>
                <pre className="overflow-x-auto text-[11px] leading-5 text-zinc-100">
                  {codeText}
                </pre>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-xs text-zinc-600">{description}</p>
                <div className="relative mt-3 h-28 overflow-hidden rounded-md border border-zinc-200 bg-white">
                  <div
                    className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full transition-all duration-300"
                    style={{
                      left: `${Math.max(5, Math.min(92, speed))}%`,
                      backgroundColor: lineColor,
                    }}
                  />
                  {showTrail ? (
                    <div
                      className="absolute inset-x-4 top-1/2 border-t border-dashed"
                      style={{ borderColor: lineColor }}
                    />
                  ) : null}
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={onQuickHalfSpeed}
                  >
                    速度减半
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={onQuickRedTrail}
                  >
                    轨迹改为红色虚线
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label className="text-xs text-zinc-600">
                  动画速度：{speed}%
                </Label>
                <Slider
                  value={[speed]}
                  min={10}
                  max={100}
                  step={5}
                  onValueChange={(value) => onSpeedChange(value[0] ?? 50)}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2">
                <Label className="text-xs text-zinc-600">显示轨迹线</Label>
                <Switch
                  checked={showTrail}
                  onCheckedChange={onShowTrailChange}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2">
                <Label className="text-xs text-zinc-600">代码/预览分栏</Label>
                <Switch
                  checked={splitView}
                  onCheckedChange={onSplitViewChange}
                />
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 sm:col-span-2">
                <Paintbrush className="h-3.5 w-3.5 text-zinc-500" />
                <Label className="text-xs text-zinc-600">轨迹颜色</Label>
                <input
                  type="color"
                  value={lineColor}
                  onChange={(event) => onLineColorChange(event.target.value)}
                  className="ml-auto h-7 w-9 cursor-pointer rounded border border-zinc-200 bg-white"
                />
              </div>
            </div>
          </>
        )}
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
          {flowContext?.latestArtifacts &&
          flowContext.latestArtifacts.length > 0 ? (
            flowContext.latestArtifacts.slice(0, 4).map((item) => (
              <div
                key={item.artifactId}
                className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-zinc-800">
                    {item.title}
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    {new Date(item.createdAt).toLocaleString()} · {item.status}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 text-xs"
                  onClick={() =>
                    void flowContext.onExportArtifact?.(item.artifactId)
                  }
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
