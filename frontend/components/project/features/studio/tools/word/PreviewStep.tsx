import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, Loader2, Save } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ToolFlowContext } from "../types";
import { WorkbenchCenteredState } from "../WorkbenchCenteredState";
import { documentToMarkdown } from "./documentContent";

interface PreviewStepProps {
  markdown: string;
  isGenerating: boolean;
  lastGeneratedAt: string | null;
  flowContext?: ToolFlowContext;
  isBackendPreviewLoading?: boolean;
  backendPreviewError?: string | null;
  toolbarMode?: "internal" | "external";
  resultStatus?:
    | "pending"
    | "draft"
    | "processing"
    | "previewing"
    | "completed"
    | "failed"
    | null;
}

type WordTab = "edit" | "preview";

export const WORD_PREVIEW_HEADING_CLASSES = {
  h1: "mt-4 text-[1.7rem] font-bold leading-tight text-zinc-900",
  h2: "mt-6 border-b border-zinc-200 pb-1.5 text-[1.35rem] font-semibold leading-tight text-zinc-900",
  h3: "mt-5 text-[1.1rem] font-semibold leading-7 text-zinc-900",
} as const;

function isUuidLike(value: string | null): boolean {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function extractHeadingTitle(markdown: string): string | null {
  const firstLine = markdown.split(/\r?\n/, 1)[0]?.trim() ?? "";
  if (!firstLine) return null;
  const headingMatch = firstLine.match(/^#{1,6}\s+(.+)$/);
  if (headingMatch?.[1]?.trim()) return headingMatch[1].trim();
  return null;
}

function isGenericDocumentTitle(value: string | null): boolean {
  if (!value) return true;
  const original = value.trim();
  const normalized = original.toLowerCase();
  return (
    normalized === "教案" ||
    normalized === "教学文档" ||
    normalized === "教学教案" ||
    normalized === "讲义文档" ||
    normalized === "未命名文档" ||
    normalized === "未命名教案" ||
    normalized === "word 生成记录" ||
    normalized === "word生成记录" ||
    /^第\s*\d+\s*次讲义文档(?:[。.!！])?$/i.test(original)
  );
}

export function PreviewStep({
  markdown,
  isGenerating,
  lastGeneratedAt: _lastGeneratedAt,
  flowContext,
  isBackendPreviewLoading = false,
  backendPreviewError = null,
  toolbarMode = "internal",
  resultStatus = null,
}: PreviewStepProps) {
  const latestArtifact = flowContext?.latestArtifacts?.[0] ?? null;
  const exportArtifactId =
    flowContext?.resolvedTarget?.artifactId ??
    flowContext?.resolvedArtifact?.artifactId ??
    latestArtifact?.artifactId ??
    "";
  const artifactContent =
    flowContext?.resolvedArtifact?.content &&
    typeof flowContext.resolvedArtifact.content === "object"
      ? (flowContext.resolvedArtifact.content as Record<string, unknown>)
      : null;
  const sourceSnapshot =
    artifactContent && typeof artifactContent.source_snapshot === "object"
      ? (artifactContent.source_snapshot as Record<string, unknown>)
      : null;
  const sourceArtifactId =
    latestArtifact?.sourceArtifactId ??
    (typeof sourceSnapshot?.primary_source_id === "string"
      ? sourceSnapshot.primary_source_id
      : null) ??
    flowContext?.selectedSourceId ??
    null;
  const sourceArtifactTitle =
    (typeof sourceSnapshot?.primary_source_title === "string" &&
    sourceSnapshot.primary_source_title.trim()
      ? sourceSnapshot.primary_source_title.trim()
      : null) ??
    (sourceArtifactId
      ? ((flowContext?.sourceOptions ?? []).find(
          (item) => item.id === sourceArtifactId
        )?.title ?? null)
      : null);
  const displaySourceTitle =
    sourceArtifactTitle && !isUuidLike(sourceArtifactTitle)
      ? sourceArtifactTitle
      : null;

  const contentTitle =
    typeof artifactContent?.title === "string" && artifactContent.title.trim()
      ? artifactContent.title.trim()
      : null;
  const latestArtifactTitle =
    latestArtifact?.title ?? null;
  const displayTitle = !isGenericDocumentTitle(contentTitle)
    ? contentTitle
    : !isGenericDocumentTitle(latestArtifactTitle)
      ? latestArtifactTitle
      : displaySourceTitle
        ? `${displaySourceTitle} 教案`
        : "教案";

  const initialMarkdown = useMemo(() => {
    const fromPreview = markdown.trim();
    if (fromPreview) return fromPreview;
    const fromContent =
      artifactContent && typeof artifactContent.markdown_content === "string"
        ? artifactContent.markdown_content.trim()
        : "";
    if (fromContent) return fromContent;
    const fromLessonPlan =
      artifactContent && typeof artifactContent.lesson_plan_markdown === "string"
        ? artifactContent.lesson_plan_markdown.trim()
        : "";
    if (fromLessonPlan) return fromLessonPlan;
    if (
      artifactContent?.document_content &&
      typeof artifactContent.document_content === "object"
    ) {
      const converted = documentToMarkdown(artifactContent.document_content as never);
      if (converted.trim()) return converted.trim();
    }
    return "";
  }, [artifactContent, markdown]);

  const [activeTab, setActiveTab] = useState<WordTab>("preview");
  const [markdownDraft, setMarkdownDraft] = useState(initialMarkdown);
  const [savedBaselineMarkdown, setSavedBaselineMarkdown] = useState(initialMarkdown);
  const [latestSavedArtifactId, setLatestSavedArtifactId] = useState<string>(
    exportArtifactId
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const lastHydratedArtifactIdRef = useRef<string>(exportArtifactId);
  const preserveLocalDraftRef = useRef(false);
  const hasDraftContent = markdownDraft.trim().length > 0;
  const isPreviewLoading =
    isGenerating ||
    (!hasDraftContent && isBackendPreviewLoading) ||
    (resultStatus === "processing" && !hasDraftContent);
  const isFailed = resultStatus === "failed";
  const isBackendPlaceholder =
    (flowContext?.capabilityStatus ?? "backend_placeholder") !== "backend_ready";
  const canStructuredSave = Boolean(
    flowContext?.resolvedArtifact?.artifactId && flowContext?.onStructuredRefineArtifact
  );

  useEffect(() => {
    const artifactChanged = exportArtifactId !== lastHydratedArtifactIdRef.current;
    if (artifactChanged) {
      lastHydratedArtifactIdRef.current = exportArtifactId;
      preserveLocalDraftRef.current = false;
      setMarkdownDraft(initialMarkdown);
      setSavedBaselineMarkdown(initialMarkdown);
      return;
    }
    if (!preserveLocalDraftRef.current) {
      setMarkdownDraft(initialMarkdown);
      setSavedBaselineMarkdown(initialMarkdown);
    }
  }, [exportArtifactId, initialMarkdown]);

  useEffect(() => {
    if (!exportArtifactId) return;
    setLatestSavedArtifactId(exportArtifactId);
  }, [exportArtifactId]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("spectra:word:save-state", {
        detail: { status: isSaving ? "saving" : "idle" },
      })
    );
  }, [isSaving]);

  const handleSaveReplacement = useCallback(async (): Promise<string | null> => {
    if (!canStructuredSave || !flowContext?.resolvedArtifact?.artifactId) return null;
    setIsSaving(true);
    setSaveNotice(null);
    try {
      const response = await flowContext.onStructuredRefineArtifact?.({
        artifactId: flowContext.resolvedArtifact.artifactId,
        message: "更新文档内容",
        refineMode: "structured_refine",
        config: {
          direct_edit: true,
          operation: "direct_edit",
          markdown_content: markdownDraft,
          document_title: (() => {
            const markdownTitle = extractHeadingTitle(markdownDraft);
            const existingTitle =
              typeof artifactContent?.title === "string" && artifactContent.title.trim()
                ? artifactContent.title.trim()
                : displayTitle && !isUuidLike(displayTitle)
                  ? displayTitle
                  : null;
            if (existingTitle && !isGenericDocumentTitle(existingTitle)) {
              return existingTitle;
            }
            if (markdownTitle && !isGenericDocumentTitle(markdownTitle)) {
              return markdownTitle;
            }
            return undefined;
          })(),
          document_summary:
            typeof artifactContent?.summary === "string" && artifactContent.summary.trim()
              ? artifactContent.summary.trim()
              : "已更新教案内容。",
          schema_id:
            typeof artifactContent?.schema_id === "string" &&
            artifactContent.schema_id.trim()
              ? artifactContent.schema_id.trim()
              : "lesson_plan_v1",
          lesson_plan:
            artifactContent && typeof artifactContent.lesson_plan === "object"
              ? artifactContent.lesson_plan
              : undefined,
        },
      });
      const nextArtifactId =
        response?.artifactId ?? flowContext.resolvedArtifact.artifactId;
      preserveLocalDraftRef.current = true;
      setLatestSavedArtifactId(nextArtifactId);
      setSavedBaselineMarkdown(markdownDraft);
      setSaveNotice("已保存到当前文档。");
      window.dispatchEvent(
        new CustomEvent("spectra:word:saved", {
          detail: {
            artifactId: nextArtifactId,
            markdown: markdownDraft,
            savedAt: Date.now(),
          },
        })
      );
      return nextArtifactId;
    } finally {
      setIsSaving(false);
    }
  }, [artifactContent, canStructuredSave, displayTitle, flowContext, markdownDraft]);

  const handleExportWithLatest = useCallback(async () => {
    if (!flowContext?.onExportArtifact || !exportArtifactId) return;
    const isDirty = markdownDraft.trim() !== savedBaselineMarkdown.trim();
    let artifactIdForExport = latestSavedArtifactId || exportArtifactId;
    if (isDirty && canStructuredSave && !isSaving) {
      const savedArtifactId = await handleSaveReplacement();
      if (savedArtifactId) artifactIdForExport = savedArtifactId;
    }
    setSaveNotice("导出将使用当前文档。");
    await flowContext.onExportArtifact(artifactIdForExport);
  }, [
    canStructuredSave,
    exportArtifactId,
    flowContext,
    handleSaveReplacement,
    isSaving,
    latestSavedArtifactId,
    markdownDraft,
    savedBaselineMarkdown,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
      if (!canStructuredSave || isSaving) return;
      event.preventDefault();
      void handleSaveReplacement();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canStructuredSave, isSaving, handleSaveReplacement]);

  useEffect(() => {
    if (toolbarMode !== "external") return;
    const onSetMode = (event: Event) => {
      const customEvent = event as CustomEvent<{ mode?: WordTab }>;
      const mode = customEvent.detail?.mode;
      if (mode === "edit" || mode === "preview") {
        setActiveTab(mode);
      }
    };
    const onSave = () => {
      if (isSaving || !hasDraftContent) return;
      void handleSaveReplacement();
    };
    const onExport = () => {
      if (isSaving || !exportArtifactId) return;
      void handleExportWithLatest();
    };
    window.addEventListener("spectra:word:set-mode", onSetMode as EventListener);
    window.addEventListener("spectra:word:save", onSave);
    window.addEventListener("spectra:word:export", onExport);
    return () => {
      window.removeEventListener("spectra:word:set-mode", onSetMode as EventListener);
      window.removeEventListener("spectra:word:save", onSave);
      window.removeEventListener("spectra:word:export", onExport);
    };
  }, [
    toolbarMode,
    isSaving,
    hasDraftContent,
    exportArtifactId,
    handleSaveReplacement,
    handleExportWithLatest,
  ]);

  return (
    <div className="space-y-2">
      {isBackendPlaceholder && !hasDraftContent && !isPreviewLoading ? (
        <WorkbenchCenteredState
          tone="sky"
          variant="compact"
          icon={FileText}
          title="文档内容同步中"
          description="你可以继续编辑并保存，界面将优先显示本地最新内容。"
        />
      ) : null}
      {toolbarMode === "internal" ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-zinc-900">{displayTitle}</p>
              {displaySourceTitle ? (
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  基于 {displaySourceTitle} 生成
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() =>
                  setActiveTab((prev) => (prev === "edit" ? "preview" : "edit"))
                }
              >
                {activeTab === "edit" ? "预览" : "编辑"}
              </Button>
              {canStructuredSave ? (
                <Button
                  type="button"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={isSaving || !hasDraftContent}
                  onClick={() => void handleSaveReplacement()}
                >
                  {isSaving ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {isSaving ? "保存中..." : "保存修改"}
                </Button>
              ) : null}
              {exportArtifactId ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={isSaving}
                  onClick={() => void handleExportWithLatest()}
                >
                  导出教案文档
                </Button>
              ) : null}
            </div>
          </div>
          {saveNotice ? <p className="text-[11px] text-emerald-700">{saveNotice}</p> : null}
        </>
      ) : null}

      {backendPreviewError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
          预览暂时加载失败，你仍可直接编辑并保存。
        </div>
      ) : null}

      {isFailed ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
          本次教学文档生成失败，可直接改写内容后保存新版本。
        </div>
      ) : null}

      {activeTab === "edit" ? (
        <div className="space-y-2">
          <Textarea
            value={markdownDraft}
            onChange={(event) => setMarkdownDraft(event.target.value)}
            className="min-h-[620px] resize-y rounded-2xl border-zinc-200 bg-white font-mono text-sm leading-7 shadow-sm"
            placeholder="在这里直接改字。支持 # 标题、## 小节、- 列表。"
          />
          <p className="text-[11px] text-zinc-500">
            快捷键：Ctrl/Cmd + S 保存修改
          </p>
        </div>
      ) : (
        <div className="min-h-[620px] rounded-2xl border border-zinc-200 bg-white px-6 py-4">
          {markdownDraft.trim() ? (
            <article className="prose prose-zinc mx-auto max-w-3xl leading-7">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeSanitize]}
                components={{
                  h1: (props) => (
                    <h1 className={WORD_PREVIEW_HEADING_CLASSES.h1} {...props} />
                  ),
                  h2: (props) => (
                    <h2 className={WORD_PREVIEW_HEADING_CLASSES.h2} {...props} />
                  ),
                  h3: (props) => (
                    <h3 className={WORD_PREVIEW_HEADING_CLASSES.h3} {...props} />
                  ),
                  p: (props) => <p className="my-4 leading-7 text-zinc-800" {...props} />,
                  ul: (props) => <ul className="my-4 list-disc space-y-1 pl-6" {...props} />,
                  ol: (props) => (
                    <ol className="my-4 list-decimal space-y-1 pl-6" {...props} />
                  ),
                }}
              >
                {markdownDraft}
              </ReactMarkdown>
            </article>
          ) : isPreviewLoading ? (
            <WorkbenchCenteredState
              tone="sky"
              loading
              title="正在生成教案"
              description="正在整理课堂目标、教学流程与练习设计，完成后会自动展示最新文档。"
              pill="教学文档工作台正在准备中"
              minHeightClassName="min-h-[520px]"
            />
          ) : (
            <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-500">
              暂无内容，请先在“编辑”中输入教案文本。
            </div>
          )}
        </div>
      )}
    </div>
  );
}
