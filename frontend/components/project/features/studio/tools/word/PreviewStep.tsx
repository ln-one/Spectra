import { useEffect, useMemo, useState } from "react";
import type { JSONContent } from "@tiptap/react";
import { FileText, Loader2, PencilLine, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ArtifactWorkbenchShell } from "../ArtifactWorkbenchShell";
import type { ToolFlowContext } from "../types";
import { buildArtifactWorkbenchViewModel } from "../workbenchViewModel";
import { DocumentSurfaceAdapter } from "./DocumentSurfaceAdapter";
import {
  extractDocumentBlocks,
  markdownToDoc,
  type DocumentBlockItem,
} from "./documentContent";

function formatBlockTypeLabel(type: DocumentBlockItem["type"]): string {
  switch (type) {
    case "heading":
      return "标题";
    case "paragraph":
      return "正文";
    case "bulletList":
      return "项目符号";
    case "orderedList":
      return "有序列表";
    default:
      return type;
  }
}

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
  const initialDocument = useMemo(() => {
    const content =
      flowContext?.resolvedArtifact?.content &&
      typeof flowContext.resolvedArtifact.content === "object"
        ? (flowContext.resolvedArtifact.content as Record<string, unknown>)
        : null;
    if (content?.document_content && typeof content.document_content === "object") {
      return content.document_content as JSONContent;
    }
    return markdownToDoc(markdown);
  }, [flowContext?.resolvedArtifact?.content, markdown]);
  const [isEditing, setIsEditing] = useState(false);
  const [documentContent, setDocumentContent] = useState(initialDocument);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const documentBlocks = useMemo(
    () => extractDocumentBlocks(documentContent),
    [documentContent]
  );
  const hasDocumentBlocks = documentBlocks.length > 0;
  const selectedBlock =
    documentBlocks.find((item) => item.id === selectedBlockId) ?? documentBlocks[0] ?? null;
  const canStructuredSave = Boolean(
    flowContext?.resolvedArtifact?.artifactId && flowContext?.onStructuredRefineArtifact
  );
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

  useEffect(() => {
    setDocumentContent(initialDocument);
    setIsEditing(false);
  }, [initialDocument]);

  useEffect(() => {
    if (!selectedBlockId && documentBlocks[0]) {
      setSelectedBlockId(documentBlocks[0].id);
    }
  }, [documentBlocks, selectedBlockId]);

  const handleSaveReplacement = async () => {
    if (!canStructuredSave || !flowContext?.resolvedArtifact?.artifactId) return;
    setIsSaving(true);
    try {
      await flowContext.onStructuredRefineArtifact?.({
        artifactId: flowContext.resolvedArtifact.artifactId,
        message: selectedBlock?.text || "更新文档内容",
        refineMode: "structured_refine",
        selectionAnchor: selectedBlock
          ? {
              scope: "document_block",
              anchor_id: selectedBlock.id,
              artifact_id: flowContext.resolvedArtifact.artifactId,
              label: selectedBlock.text.slice(0, 32) || selectedBlock.id,
            }
          : undefined,
        config: {
          document_content: documentContent,
          document_title:
            typeof artifactContent?.title === "string" && artifactContent.title.trim()
              ? artifactContent.title.trim()
              : "教学文档",
          document_summary:
            typeof artifactContent?.summary === "string" && artifactContent.summary.trim()
              ? artifactContent.summary.trim()
              : "已更新文档内容。",
        },
      });
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

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
            这里展示后端返回的真实文档内容，并支持结构化块编辑与 replacement artifact 保存。
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={!hasContent}
            onClick={() => setIsEditing((previous) => !previous)}
          >
            <PencilLine className="mr-1.5 h-3.5 w-3.5" />
            {isEditing ? "退出编辑" : "编辑文档"}
          </Button>
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
          {isEditing && canStructuredSave ? (
            <Button
              type="button"
              size="sm"
              className="h-8 text-xs"
              disabled={isSaving}
              onClick={() => void handleSaveReplacement()}
            >
              <Save className="mr-1.5 h-3.5 w-3.5" />
              {isSaving ? "保存中..." : "保存为新版本"}
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
          {hasMarkdownContent || hasDocumentBlocks ? (
            <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
              <div className="space-y-3">
                <div className="rounded-2xl border border-zinc-200 bg-white p-3">
                  <p className="text-xs font-semibold text-zinc-900">结构化区块</p>
                  <div className="mt-3 space-y-2">
                    {documentBlocks.map((block: DocumentBlockItem) => {
                      const isSelected = block.id === (selectedBlock?.id ?? selectedBlockId);
                      return (
                        <button
                          key={block.id}
                          type="button"
                          onClick={() => setSelectedBlockId(block.id)}
                          className={`w-full rounded-xl border px-3 py-2 text-left text-xs transition ${
                            isSelected
                              ? "border-blue-500 bg-blue-50 text-blue-950"
                              : "border-zinc-200 bg-zinc-50 text-zinc-700"
                          }`}
                        >
                          <div className="font-semibold">{block.type}</div>
                          <div className="mt-1 line-clamp-2">{block.text || "空内容区块"}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
                {selectedBlock ? (
                  <div className="rounded-2xl border border-blue-200 bg-blue-50/80 px-4 py-3">
                    <p className="text-xs font-semibold text-blue-900">当前选中区块</p>
                    <p className="mt-1 text-[11px] text-blue-700">
                      {formatBlockTypeLabel(selectedBlock.type)} · {selectedBlock.id}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-blue-950">
                      {selectedBlock.text || "当前区块暂时为空，可直接在右侧编辑器补充内容。"}
                    </p>
                  </div>
                ) : null}
              </div>
              <DocumentSurfaceAdapter
                markdown={markdown}
                document={documentContent}
                editable={isEditing}
                onDocumentChange={setDocumentContent}
                description="当前工作面已升级为 Editable Tiptap，保存时会回写为 Spectra-owned structured JSON。"
                badgeLabel="Editable Tiptap"
              />
            </div>
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
