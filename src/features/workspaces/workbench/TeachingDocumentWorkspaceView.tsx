"use client";

import { useMutation } from "@tanstack/react-query";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import {
  Check,
  Download,
  MessageSquareText,
  Pencil,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import {
  type TeachingDocumentGenerationDraft,
  type TeachingDocumentRevisionContent,
  teachingDocumentRevisionContentSchema,
} from "@/features/artifacts/documents/contract";
import { MermaidDiagram } from "@/features/artifacts/documents/MermaidDiagram";
import { teachingDocumentEditorJsonToMarkdown } from "@/features/artifacts/documents/markdown";
import { projectTeachingDocument } from "@/features/artifacts/documents/projector";
import {
  fetchTeachingDocumentSuggestions,
  regenerateTeachingDocumentSuggestions,
  teachingDocumentQueryKeys,
} from "@/features/artifacts/documents/queries";
import { teachingDocumentDraftMarkdown } from "@/features/artifacts/documents/realtime";
import {
  applyTeachingDocumentRefineEdits,
  type TeachingDocumentFocus,
} from "@/features/artifacts/documents/refine";
import { normalizeImplicitMarkdownTables } from "@/features/artifacts/documents/tables";
import type { TeachingDocumentArtifact } from "@/features/artifacts/documents/types";
import type { TeachingDocumentEditProposal } from "@/features/artifacts/proposal-contract";
import {
  ArtifactGenerationView,
  ArtifactStartView,
  ArtifactWorkspaceShell,
} from "./ArtifactWorkspacePrimitives";
import type { ArtifactWorkspacePhase } from "./artifactWorkbench";
import { navigateToDocumentExport } from "./document-export-navigation";
import {
  createWorkbenchTeachingDocumentExtensions,
  setTeachingDocumentAssistantDecoration,
  setTeachingDocumentReviewDecoration,
  type TeachingDocumentAssistantDecoration,
  type TeachingDocumentReviewDecoration,
  toTeachingDocumentEditorContent,
} from "./teaching-document-editor-extensions";
import {
  acceptTeachingDocumentProposal,
  prepareTeachingDocumentExport,
  saveTeachingDocumentRevision,
} from "./teaching-document-workspace-client";
import { useArtifactSuggestions } from "./useArtifactSuggestions";

function safeMarkdownHref(href: string | undefined) {
  return href && /^(?:https?:|mailto:|#)/i.test(href) ? href : null;
}

function DocumentMarkdown({ markdown }: { markdown: string }) {
  const t = useTranslations("Workbench");
  return (
    <div className="teaching-document-markdown select-text text-base leading-8 text-[var(--workspace-text-primary)]">
      <ReactMarkdown
        rehypePlugins={[rehypeKatex]}
        remarkPlugins={[remarkGfm, remarkMath]}
        components={{
          a: ({ children, href }) => {
            const safeHref = safeMarkdownHref(href);
            return safeHref ? <a href={safeHref}>{children}</a> : <span>{children}</span>;
          },
          code: ({ children, className }) =>
            className === "language-mermaid" ? (
              <MermaidDiagram errorLabel={t("mermaidRenderFailed")} source={String(children)} />
            ) : (
              <code className={className}>{children}</code>
            ),
          img: ({ alt, src }) => {
            const safeSrc = typeof src === "string" ? safeMarkdownHref(src) : null;
            return (
              <span>
                {alt?.trim() || "…"}
                {safeSrc ? ` (${safeSrc})` : ""}
              </span>
            );
          },
        }}
      >
        {normalizeImplicitMarkdownTables(markdown)}
      </ReactMarkdown>
    </div>
  );
}

function StreamedDocument({ draft }: { draft: TeachingDocumentGenerationDraft }) {
  return <DocumentMarkdown markdown={teachingDocumentDraftMarkdown(draft)} />;
}

function DocumentGenerationPlaceholder({
  description,
  status,
  title,
}: {
  description: string;
  status: string;
  title: string;
}) {
  return (
    <div
      data-testid="document-generation-placeholder"
      role="status"
      aria-live="polite"
      className="min-h-[520px]"
    >
      <span className="sr-only">
        {title}. {description}
      </span>
      <div className="inline-flex items-center gap-2 rounded-full border border-[var(--studio-border)] bg-[var(--studio-surface-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--studio-accent-text)]">
        <RefreshCw className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
        {status}
      </div>
      <div aria-hidden className="mt-10 animate-pulse space-y-10 motion-reduce:animate-none">
        <div className="space-y-4">
          <div className="h-8 w-[62%] rounded-lg bg-[var(--studio-surface)]" />
          <div className="h-3 w-[28%] rounded-full bg-[var(--workspace-surface-muted)]" />
        </div>
        <div className="space-y-4">
          <div className="h-5 w-36 rounded-md bg-[var(--studio-surface)]" />
          <div className="h-3 w-full rounded-full bg-[var(--workspace-surface-muted)]" />
          <div className="h-3 w-[94%] rounded-full bg-[var(--workspace-surface-muted)]" />
          <div className="h-3 w-[72%] rounded-full bg-[var(--workspace-surface-muted)]" />
        </div>
        <div className="space-y-4">
          <div className="h-5 w-44 rounded-md bg-[var(--studio-surface)]" />
          <div className="h-3 w-full rounded-full bg-[var(--workspace-surface-muted)]" />
          <div className="h-3 w-[88%] rounded-full bg-[var(--workspace-surface-muted)]" />
          <div className="space-y-3 pt-1 pl-2">
            {["76%", "64%"].map((width) => (
              <div className="flex items-center gap-3" key={width}>
                <div className="h-2 w-2 shrink-0 rounded-full bg-[var(--studio-border-strong)]" />
                <div
                  className="h-3 rounded-full bg-[var(--workspace-surface-muted)]"
                  style={{ width }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TeachingDocumentWorkspaceView({
  artifact,
  conversationId,
  draft,
  failureCode,
  focus,
  onBack,
  onArtifactUpdated,
  onFocusChange,
  onProposalDismiss,
  onProposalRetry,
  onRequestAssistant,
  onSuggestion,
  pendingTitle,
  phase,
  queued = false,
  proposal,
  readOnly = false,
  workspaceId,
}: {
  artifact: TeachingDocumentArtifact | null;
  conversationId: string;
  draft: TeachingDocumentGenerationDraft | null;
  failureCode: string | null;
  focus?: TeachingDocumentFocus | null;
  onBack: () => void;
  onArtifactUpdated: (artifact: TeachingDocumentArtifact) => void;
  onFocusChange?: ((focus: TeachingDocumentFocus | null) => void) | undefined;
  onProposalDismiss?: (() => void) | undefined;
  onProposalRetry?: ((request: string) => void) | undefined;
  onRequestAssistant?: (() => void) | undefined;
  onSuggestion: (prompt: string) => void;
  pendingTitle: string | null;
  phase: ArtifactWorkspacePhase;
  queued?: boolean;
  proposal?: TeachingDocumentEditProposal | null;
  readOnly?: boolean;
  workspaceId: string;
}) {
  const t = useTranslations("Workbench");
  const locale = useLocale() === "en-US" ? "en-US" : "zh-CN";
  const failureMessage =
    failureCode === "teaching_document_generation_timeout"
      ? t("generateDocumentTimeout")
      : failureCode === "teaching_document_invalid_output"
        ? t("generateDocumentInvalidOutput")
        : failureCode === "teaching_document_rate_limited"
          ? t("generateDocumentRateLimited")
          : failureCode === "teaching_document_provider_configuration"
            ? t("generateDocumentProviderConfiguration")
            : t("generateDocumentFailed");
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(artifact?.title ?? "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");
  const [exportState, setExportState] = useState<"idle" | "preparing" | "error">("idle");
  const [proposalState, setProposalState] = useState<"idle" | "error" | "stale">("idle");
  const [acceptedPreview, setAcceptedPreview] = useState<{
    artifactId: string;
    content: TeachingDocumentRevisionContent;
    revisionId: string;
    title: string;
  } | null>(null);
  const [promotedProposalRunId, setPromotedProposalRunId] = useState<string | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const focusedProposalRunIdRef = useRef<string | null>(null);
  const capturedFocusRef = useRef<
    | (TeachingDocumentAssistantDecoration & {
        revisionId: string;
        selectedText: string;
      })
    | null
  >(null);
  const currentArtifact = artifact;
  const activeProposal = proposal?.runId === promotedProposalRunId ? null : (proposal ?? null);
  const promotionPreview =
    acceptedPreview?.artifactId === currentArtifact?.id ? acceptedPreview : null;
  const displayedContent =
    promotionPreview?.content ?? currentArtifact?.currentRevision.content ?? null;
  const displayedTitle = promotionPreview?.title ?? currentArtifact?.title ?? "";
  const displayedRevisionId =
    promotionPreview?.revisionId ?? currentArtifact?.currentRevision.id ?? null;
  const syncedRevisionIdRef = useRef(displayedRevisionId);
  const acceptProposalMutation = useMutation({
    mutationFn: async ({
      artifactId,
      expectedRevisionId,
      runId,
    }: {
      artifactId: string;
      expectedRevisionId: string;
      runId: string;
    }) => {
      const result = await acceptTeachingDocumentProposal({
        artifactId,
        conversationId,
        expectedRevisionId,
        runId,
        workspaceId,
      });
      return result.status === "conflict" ? null : result;
    },
  });
  const partialGeneration =
    displayedContent?.generation.warnings.includes("partial_generation") ?? false;
  const exportTarget = currentArtifact
    ? `${currentArtifact.id}:${currentArtifact.currentRevision.id}`
    : null;
  const suggestionsQueryKey = teachingDocumentQueryKeys.suggestions(
    workspaceId,
    conversationId,
    locale,
  );
  const suggestions = useArtifactSuggestions({
    enabled: phase === "idle" && !currentArtifact,
    fetchSuggestions: (afterGeneration, waitOnly) =>
      fetchTeachingDocumentSuggestions(workspaceId, locale, afterGeneration, waitOnly),
    queryKey: suggestionsQueryKey,
    regenerateSuggestions: (afterGeneration) =>
      regenerateTeachingDocumentSuggestions(workspaceId, locale, afterGeneration),
  });
  const editor = useEditor({
    content: displayedContent
      ? toTeachingDocumentEditorContent(displayedContent, displayedTitle)
      : { type: "doc", content: [] },
    editable: false,
    extensions: createWorkbenchTeachingDocumentExtensions({
      before: t("documentRefineBeforeLabel"),
      insert: t("documentRefineInsertLabel"),
      pendingDelete: t("documentRefinePendingDelete"),
      pendingInsert: t("documentRefinePendingInsert"),
      pendingReplace: t("documentRefinePendingReplace"),
      replace: t("documentRefineReplaceLabel"),
    }),
    immediatelyRender: false,
  });

  const scrollToFirstProposalChange = useCallback(() => {
    const firstChange = editor?.view.dom.querySelector<HTMLElement>(
      ".teaching-document-refine-removed, .teaching-document-refine-inserted",
    );
    firstChange?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [editor]);

  useEffect(() => {
    if (!editor || !currentArtifact || !displayedContent || !displayedRevisionId) return;
    if (syncedRevisionIdRef.current === displayedRevisionId) return;
    const frame = window.requestAnimationFrame(() => {
      editor.commands.setContent(
        toTeachingDocumentEditorContent(displayedContent, displayedTitle),
        {
          emitUpdate: false,
          errorOnInvalidContent: true,
        },
      );
      editor.setEditable(false);
      syncedRevisionIdRef.current = displayedRevisionId;
    });
    setIsEditing(false);
    setTitle(displayedTitle);
    setProposalState("idle");
    capturedFocusRef.current = null;
    return () => window.cancelAnimationFrame(frame);
  }, [currentArtifact, displayedContent, displayedRevisionId, displayedTitle, editor]);

  useEffect(() => {
    if (
      acceptedPreview &&
      (acceptedPreview.artifactId !== currentArtifact?.id ||
        acceptedPreview.revisionId === currentArtifact.currentRevision.id)
    ) {
      setAcceptedPreview(null);
    }
  }, [acceptedPreview, currentArtifact]);

  useEffect(() => {
    if (!editor) return;
    if (!focus) {
      capturedFocusRef.current = null;
      setTeachingDocumentAssistantDecoration(editor, null);
      return;
    }
    const captured = capturedFocusRef.current;
    const exactRange =
      captured?.revisionId === focus.revisionId &&
      captured.selectedText === focus.selectedText &&
      typeof captured.from === "number" &&
      typeof captured.to === "number"
        ? { from: captured.from, to: captured.to }
        : {};
    setTeachingDocumentAssistantDecoration(editor, {
      blockIds: focus.blockIds,
      ...exactRange,
    });
  }, [editor, focus]);

  useEffect(() => {
    if (!editor) return;
    const review: TeachingDocumentReviewDecoration | null = activeProposal
      ? activeProposal.edits.flatMap((edit) => {
          if (edit.operation === "update_title") return [];
          return [
            {
              blockId: edit.blockId,
              operation: edit.operation,
              ...(edit.operation === "replace_block"
                ? { text: edit.replacementMarkdown }
                : edit.operation === "insert_after"
                  ? { text: edit.markdown }
                  : {}),
            },
          ];
        })
      : null;
    setTeachingDocumentReviewDecoration(editor, review);
    setProposalState("idle");
    if (!activeProposal) {
      focusedProposalRunIdRef.current = null;
      return;
    }
    if (focusedProposalRunIdRef.current === activeProposal.runId) return;
    focusedProposalRunIdRef.current = activeProposal.runId;
    const frame = window.requestAnimationFrame(scrollToFirstProposalChange);
    return () => window.cancelAnimationFrame(frame);
  }, [activeProposal, editor, scrollToFirstProposalChange]);

  useEffect(() => {
    if (exportTarget === null) return;
    exportAbortRef.current?.abort();
    exportAbortRef.current = null;
    setExportState("idle");
    return () => exportAbortRef.current?.abort();
  }, [exportTarget]);

  const save = useCallback(async () => {
    if (!currentArtifact || !editor) return;
    setSaveState("saving");
    const markdown = teachingDocumentEditorJsonToMarkdown(editor.getJSON(), title);
    const outcome = currentArtifact.currentRevision.content.generation.outcome;
    const content = teachingDocumentRevisionContentSchema.safeParse(
      projectTeachingDocument({ outcome, rawOutput: markdown, requestedTitle: title }).revision,
    );
    if (!content.success) return setSaveState("error");
    try {
      const updatedArtifact = await saveTeachingDocumentRevision({
        artifact: currentArtifact,
        content: content.data satisfies TeachingDocumentRevisionContent,
        conversationId,
        workspaceId,
      });
      onArtifactUpdated(updatedArtifact);
      setSaveState("idle");
      editor.setEditable(false);
      setIsEditing(false);
    } catch {
      setSaveState("error");
    }
  }, [conversationId, currentArtifact, editor, onArtifactUpdated, title, workspaceId]);

  const captureSelectionForAssistant = useCallback(() => {
    if (!currentArtifact || !editor || editor.state.selection.empty) return;
    const { from, to } = editor.state.selection;
    const blockIds: string[] = [];
    editor.state.doc.forEach((node, offset) => {
      if (to <= offset || from >= offset + node.nodeSize) return;
      if (typeof node.attrs.id === "string") blockIds.push(node.attrs.id);
    });
    const selectedText = editor.state.doc.textBetween(from, to, " ").trim();
    if (blockIds.length === 0 || !selectedText) return;
    capturedFocusRef.current = {
      blockIds,
      from,
      revisionId: currentArtifact.currentRevision.id,
      selectedText,
      to,
    };
    setTeachingDocumentAssistantDecoration(editor, { blockIds, from, to });
    onFocusChange?.({
      blockIds,
      kind: "teaching_document_blocks",
      revisionId: currentArtifact.currentRevision.id,
      selectedText,
    });
    // Keep a decoration for conversational context, but collapse the native selection so the
    // contextual action does not remain pinned while the user writes in the assistant.
    editor.commands.setTextSelection(to);
    onRequestAssistant?.();
  }, [currentArtifact, editor, onFocusChange, onRequestAssistant]);

  const acceptProposal = useCallback(async () => {
    if (!currentArtifact || !activeProposal || acceptProposalMutation.isPending) return;
    if (
      activeProposal.artifactId !== currentArtifact.id ||
      activeProposal.baseRevisionId !== currentArtifact.currentRevision.id
    ) {
      setProposalState("stale");
      return;
    }
    try {
      applyTeachingDocumentRefineEdits(
        currentArtifact.currentRevision.content,
        activeProposal.edits,
      );
      setProposalState("idle");
      const payload = await acceptProposalMutation.mutateAsync({
        artifactId: currentArtifact.id,
        expectedRevisionId: currentArtifact.currentRevision.id,
        runId: activeProposal.runId,
      });
      if (!payload) {
        setProposalState("stale");
        return;
      }
      setAcceptedPreview({
        artifactId: payload.artifact.id,
        content: payload.artifact.currentRevision.content,
        revisionId: payload.acceptedRevisionId,
        title: payload.artifact.title,
      });
      setPromotedProposalRunId(activeProposal.runId);
      onArtifactUpdated(payload.artifact);
      onFocusChange?.(null);
      onProposalDismiss?.();
      setProposalState("idle");
    } catch {
      setProposalState("error");
    }
  }, [
    activeProposal,
    acceptProposalMutation.isPending,
    acceptProposalMutation.mutateAsync,
    currentArtifact,
    onArtifactUpdated,
    onFocusChange,
    onProposalDismiss,
  ]);

  const exportDocument = useCallback(async () => {
    if (!currentArtifact || exportState === "preparing") return;
    setExportState("preparing");
    exportAbortRef.current?.abort();
    const controller = new AbortController();
    exportAbortRef.current = controller;
    try {
      const downloadUrl = await prepareTeachingDocumentExport({
        artifactId: currentArtifact.id,
        revisionId: currentArtifact.currentRevision.id,
        signal: controller.signal,
      });
      navigateToDocumentExport(downloadUrl);
      setExportState("idle");
      exportAbortRef.current = null;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setExportState("error");
      }
    } finally {
      if (exportAbortRef.current === controller) exportAbortRef.current = null;
    }
  }, [currentArtifact, exportState]);

  const hasCanvas = phase !== "idle" || currentArtifact !== null;
  return (
    <ArtifactWorkspaceShell
      groundingSources={currentArtifact?.groundingSources ?? []}
      actions={
        currentArtifact ? (
          <div className="flex shrink-0 items-center gap-1.5">
            {!readOnly ? (
              <>
                <button
                  type="button"
                  disabled={saveState === "saving"}
                  onClick={() => {
                    if (isEditing) {
                      void save();
                      return;
                    }
                    onProposalDismiss?.();
                    onFocusChange?.(null);
                    editor?.setEditable(true);
                    setIsEditing(true);
                    requestAnimationFrame(() => titleInputRef.current?.focus());
                  }}
                  className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium shadow-sm transition-colors disabled:opacity-50 ${
                    isEditing
                      ? "border-[var(--studio-emphasis)] bg-[var(--studio-emphasis)] text-[var(--studio-on-emphasis)]"
                      : "border-[var(--studio-border)] bg-[var(--studio-surface-subtle)] text-[var(--studio-accent-text)] hover:border-[var(--studio-border-strong)] hover:bg-[var(--studio-surface)]"
                  }`}
                >
                  {isEditing ? (
                    <Save className="h-3.5 w-3.5" />
                  ) : (
                    <Pencil className="h-3.5 w-3.5" />
                  )}
                  {isEditing
                    ? saveState === "saving"
                      ? t("savingDocument")
                      : t("saveDocument")
                    : t("editDocument")}
                </button>
                <button
                  type="button"
                  disabled={exportState === "preparing"}
                  onClick={() => void exportDocument()}
                  className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-[var(--workspace-text-muted)] transition-colors hover:bg-[var(--studio-surface-subtle)] hover:text-[var(--studio-accent-text)]"
                >
                  <Download
                    className={
                      exportState === "preparing" ? "h-3.5 w-3.5 animate-pulse" : "h-3.5 w-3.5"
                    }
                  />
                  {exportState === "preparing"
                    ? t("preparingExport")
                    : exportState === "error"
                      ? t("exportFailed")
                      : t("exportDocument")}
                </button>
              </>
            ) : null}
          </div>
        ) : null
      }
      backLabel={t("backToStudio")}
      liveScrollTestId="document-live-scroll"
      onBack={onBack}
      phase={phase}
      subtitle={t("teachingDocumentSubtitle")}
      testId="teaching-document-workspace"
      title={currentArtifact ? title : (pendingTitle ?? t("teachingDocumentWorkspace"))}
    >
      {!hasCanvas ? (
        <ArtifactStartView
          description={t("documentStartDescription")}
          error={suggestions.error}
          errorLabel={t("suggestionsUnavailable")}
          Icon={Sparkles}
          loading={suggestions.loading}
          loadingLabel={t("preparingSuggestions")}
          onRefresh={suggestions.refresh}
          onRetry={() => void suggestions.retry()}
          onSuggestion={onSuggestion}
          refreshing={suggestions.refreshing}
          refreshLabel={t("retrySuggestions")}
          suggestions={suggestions.suggestions}
          title={t("documentStartTitle")}
        />
      ) : (
        <ArtifactGenerationView
          emptyPreview={
            <DocumentGenerationPlaceholder
              description={
                queued ? t("documentQueuedDescription") : t("documentDraftingDescription")
              }
              status={queued ? t("documentQueued") : t("generatingDocument")}
              title={pendingTitle ?? t("generatingDocumentTitle")}
            />
          }
          failedMessage={failureMessage}
          hasRenderableContent={draft !== null || currentArtifact !== null}
          phase={phase}
          status={phase === "finalizing" ? t("finalizingDocument") : t("generatingDocument")}
          testId="document-generation-placeholder"
        >
          {draft && !currentArtifact ? <StreamedDocument draft={draft} /> : null}
          {currentArtifact ? (
            <>
              {activeProposal ? (
                <div className="sticky top-2 z-20 mb-6 rounded-2xl border border-violet-300/60 bg-[color-mix(in_srgb,var(--workspace-surface-elevated)_94%,#8b5cf6_6%)] p-3 shadow-lg shadow-violet-950/5 backdrop-blur-xl dark:border-violet-700/55">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={scrollToFirstProposalChange}
                        className="flex items-center gap-2 text-xs font-semibold text-violet-700 hover:underline dark:text-violet-300"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        {t("documentRefineProposalCount", { count: activeProposal.edits.length })}
                      </button>
                      <p className="mt-1 truncate text-sm text-[var(--workspace-text-primary)]">
                        {activeProposal.summary}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={acceptProposalMutation.isPending || proposalState === "stale"}
                        onClick={() => void acceptProposal()}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--studio-emphasis)] px-3 text-xs font-semibold text-[var(--studio-on-emphasis)] transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" />
                        {acceptProposalMutation.isPending
                          ? t("documentRefineAccepting")
                          : t("documentRefineAccept")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onProposalDismiss?.();
                          setProposalState("idle");
                        }}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--studio-border)] px-2.5 text-xs text-[var(--workspace-text-muted)] hover:text-[var(--workspace-text-primary)]"
                      >
                        <X className="h-3.5 w-3.5" />
                        {t("documentRefineReject")}
                      </button>
                      <button
                        type="button"
                        onClick={() => onProposalRetry?.(activeProposal.request)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-[var(--studio-accent-text)] hover:bg-[var(--studio-surface-subtle)]"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        {t("documentRefineRetry")}
                      </button>
                    </div>
                  </div>
                  {proposalState === "stale" ? (
                    <p role="alert" className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                      {t("documentRefineStale")}
                    </p>
                  ) : proposalState === "error" ? (
                    <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-300">
                      {t("documentRefineSaveFailed")}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {partialGeneration ? (
                <p
                  role="status"
                  className="mb-6 rounded-xl border border-amber-300/60 bg-amber-50/70 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/25 dark:text-amber-200"
                >
                  {t("partialGenerationWarning")}
                </p>
              ) : null}
              {isEditing ? (
                <input
                  ref={titleInputRef}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={200}
                  aria-label={t("documentTitle")}
                  className="workspace-document-title-input mb-10 w-full select-text border-0 border-b border-transparent bg-transparent pb-2 text-4xl font-bold leading-[1.12] tracking-[-0.035em] transition-colors hover:border-[var(--studio-border-strong)] focus:border-[var(--studio-border-strong)]"
                />
              ) : (
                <h1 className="mb-10 select-text text-4xl font-bold leading-[1.12] tracking-[-0.035em] text-[var(--workspace-text-primary)]">
                  {title}
                </h1>
              )}
              {editor && !isEditing && !activeProposal ? (
                <BubbleMenu
                  editor={editor}
                  shouldShow={({ editor: currentEditor }) => !currentEditor.state.selection.empty}
                  options={{ placement: "top" }}
                >
                  <button
                    type="button"
                    onClick={captureSelectionForAssistant}
                    className="inline-flex h-9 items-center gap-2 rounded-xl border border-violet-300/60 bg-[var(--workspace-surface-elevated)] px-3 text-xs font-semibold text-violet-700 shadow-lg shadow-black/10 transition-transform hover:-translate-y-0.5 dark:border-violet-700/60 dark:text-violet-300 motion-reduce:transform-none"
                  >
                    <MessageSquareText className="h-3.5 w-3.5" />
                    {t("documentRefineAskAi")}
                  </button>
                </BubbleMenu>
              ) : null}
              <EditorContent editor={editor} className="teaching-document-editor select-text" />
              {focus && !activeProposal && !isEditing ? (
                <p className="mt-8 flex items-center gap-2 text-xs text-[var(--workspace-text-muted)]">
                  <Sparkles className="h-3.5 w-3.5 text-violet-500" />
                  {t("documentRefineSelectionActive")}
                </p>
              ) : null}
            </>
          ) : null}
          {saveState === "error" ? (
            <p role="alert" className="mt-4 text-sm text-red-600">
              {t("saveDocumentFailed")}
            </p>
          ) : null}
        </ArtifactGenerationView>
      )}
    </ArtifactWorkspaceShell>
  );
}
