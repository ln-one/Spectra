import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ArtifactWorkbenchShell } from "../ArtifactWorkbenchShell";
import type { ToolFlowContext } from "../types";
import { buildArtifactWorkbenchViewModel } from "../workbenchViewModel";

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
    (latestArtifact as { sourceArtifactId?: string | null } | null)
      ?.sourceArtifactId ??
    flowContext?.selectedSourceId ??
    null;
  const sourceArtifactTitle = sourceArtifactId
    ? ((flowContext?.sourceOptions ?? []).find(
        (item) => item.id === sourceArtifactId
      )?.title ?? null)
    : null;
  const hasMarkdownContent = markdown.trim().length > 0;
  const hasBackendArtifact = Boolean(exportArtifactId);
  const hasContent =
    capabilityStatus === "backend_ready" &&
    (hasMarkdownContent || hasBackendArtifact);
  const canChatRefine =
    flowContext?.supportsChatRefine &&
    typeof flowContext?.onRefine === "function";
  const refineLabel =
    flowContext?.display?.actionLabels.refine ?? "打开对话微调";
  const artifactContent =
    flowContext?.resolvedArtifact?.content &&
    typeof flowContext.resolvedArtifact.content === "object"
      ? (flowContext.resolvedArtifact.content as Record<string, unknown>)
      : null;
  const sourceBinding =
    artifactContent && typeof artifactContent.source_binding === "object"
      ? (artifactContent.source_binding as Record<string, unknown>)
      : null;
  const provenance =
    artifactContent && typeof artifactContent.provenance === "object"
      ? (artifactContent.provenance as Record<string, unknown>)
      : null;
  const normalizedFlowContext: ToolFlowContext = {
    ...flowContext,
    sourceBinding: flowContext?.sourceBinding ?? sourceBinding ?? null,
    provenance: flowContext?.provenance ?? provenance ?? null,
  };
  const viewModel = buildArtifactWorkbenchViewModel(
    normalizedFlowContext,
    lastGeneratedAt,
    sourceArtifactTitle
      ? `已基于 ${sourceArtifactTitle} 生成正式文档，可继续微调或导出。`
      : "已生成正式文档，可继续微调或导出。"
  );

  return (
    <ArtifactWorkbenchShell
      flowContext={{
        ...normalizedFlowContext,
        capabilityStatus,
        capabilityReason,
      }}
      viewModel={viewModel}
      emptyState={
        <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-10 text-center">
          <FileText className="mx-auto h-8 w-8 text-zinc-400" />
          <p className="mt-3 text-sm font-medium text-zinc-700">
            暂未收到后端真实文档内容
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            生成完成后，这里会直接显示由后端导出的预览文本。
          </p>
        </div>
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-900">正式文档工作面</p>
          <p className="mt-1 text-[11px] text-zinc-500">
            这里展示后端返回的真实文档内容，并保留正式导出入口。
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {canChatRefine ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => void flowContext?.onRefine?.()}
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              {refineLabel}
            </Button>
          ) : null}
          {hasBackendArtifact ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() =>
                void flowContext?.onExportArtifact?.(exportArtifactId)
              }
            >
              下载正式文档
            </Button>
          ) : null}
        </div>
      </div>

      {isGenerating || isBackendPreviewLoading ? (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-700">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          正在加载正式文档内容...
        </div>
      ) : null}

      {backendPreviewError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
          后端预览读取失败：{backendPreviewError}
        </div>
      ) : null}

      {hasContent ? (
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-5">
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
      ) : !isGenerating && !isBackendPreviewLoading && !backendPreviewError ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-10 text-center">
          <FileText className="mx-auto h-8 w-8 text-zinc-400" />
          <p className="mt-3 text-sm font-medium text-zinc-700">
            暂未收到后端真实文档内容
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            生成完成后，这里会直接显示由后端导出的预览文本。
          </p>
        </div>
      ) : null}
    </ArtifactWorkbenchShell>
  );
}
