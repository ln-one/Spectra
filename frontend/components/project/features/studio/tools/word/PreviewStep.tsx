import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText, Loader2 } from "lucide-react";
import { CapabilityNotice } from "../CapabilityNotice";
import type { ToolFlowContext } from "../types";

interface PreviewStepProps {
  markdown: string;
  isGenerating: boolean;
  lastGeneratedAt: string | null;
  flowContext?: ToolFlowContext;
  isBackendPreviewLoading?: boolean;
  backendPreviewError?: string | null;
}

export function PreviewStep({
  markdown,
  isGenerating,
  lastGeneratedAt,
  flowContext,
  isBackendPreviewLoading = false,
  backendPreviewError = null,
}: PreviewStepProps) {
  const capabilityStatus =
    flowContext?.capabilityStatus ?? "backend_placeholder";
  const capabilityReason =
    flowContext?.capabilityReason ?? "正在等待后端文档产物返回。";
  const latestArtifact =
    flowContext?.latestArtifacts?.[0] ?? flowContext?.resolvedArtifact ?? null;
  const exportArtifactId =
    (latestArtifact as { artifactId?: string | null } | null)?.artifactId ?? "";
  const sourceArtifactId =
    (
      latestArtifact as { sourceArtifactId?: string | null } | null
    )?.sourceArtifactId ??
    flowContext?.selectedSourceId ??
    null;
  const sourceArtifactTitle = sourceArtifactId
    ? (flowContext?.sourceOptions ?? []).find((item) => item.id === sourceArtifactId)
        ?.title ?? null
    : null;
  const currentWordArtifactTitle =
    (
      latestArtifact as { title?: string | null } | null
    )?.title ?? null;
  const hasMarkdownContent = markdown.trim().length > 0;
  const hasBackendArtifact = Boolean(exportArtifactId);
  const hasContent =
    capabilityStatus === "backend_ready" &&
    (hasMarkdownContent || hasBackendArtifact);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <CapabilityNotice status={capabilityStatus} reason={capabilityReason} />

        <div className="mt-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-900">实时文档预览</p>
            <p className="mt-1 text-[11px] text-zinc-500">
              {lastGeneratedAt
                ? `最近一次生成：${new Date(lastGeneratedAt).toLocaleString()}`
                : "这里只展示后端返回的真实文档预览。"}
            </p>
          </div>
          {hasBackendArtifact ? (
            <button
              type="button"
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600 hover:bg-zinc-50"
              onClick={() =>
                void flowContext?.onExportArtifact?.(exportArtifactId)
              }
            >
              下载正式文档
            </button>
          ) : null}
        </div>

        {(sourceArtifactId || exportArtifactId) ? (
          <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] text-zinc-600">
            <p>source_artifact_id：{sourceArtifactId ?? "-"}</p>
            <p>来源 PPT 标题：{sourceArtifactTitle ?? "未解析到来源标题"}</p>
            <p>当前 Word artifact_id：{exportArtifactId || "-"}</p>
            <p>当前 Word 标题：{currentWordArtifactTitle ?? "未命名文档"}</p>
          </div>
        ) : null}

        {isGenerating || isBackendPreviewLoading ? (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-700">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            正在加载后端文档预览...
          </div>
        ) : null}

        {backendPreviewError ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
            后端预览读取失败：{backendPreviewError}
          </div>
        ) : null}

        {hasContent ? (
          <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-5">
            {hasMarkdownContent ? (
              <article className="prose prose-zinc max-w-none text-sm leading-6 prose-headings:mb-2 prose-headings:mt-4 prose-p:my-1">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {markdown}
                </ReactMarkdown>
              </article>
            ) : (
              <p className="text-sm text-zinc-700">
                文档已由后端生成完成，可直接下载正式文档。
              </p>
            )}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-10 text-center">
            <FileText className="mx-auto h-8 w-8 text-zinc-400" />
            <p className="mt-3 text-sm font-medium text-zinc-700">
              暂未收到后端真实文档内容
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              生成完成后，这里会直接显示由后端导出的预览文本。
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
