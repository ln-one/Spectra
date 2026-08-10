"use client";

import {
  ActionBarPrimitive,
  AuiIf,
  ComposerPrimitive,
  ErrorPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAui,
  useAuiState,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive, normalizeMathDelimiters } from "@assistant-ui/react-markdown";
import * as Popover from "@radix-ui/react-popover";
import {
  ArrowDown,
  ArrowUp,
  BookOpenText,
  Check,
  Copy,
  Gamepad2,
  Globe2,
  Lightbulb,
  ListChecks,
  Mic,
  MonitorPlay,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  Square,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  type ComponentPropsWithoutRef,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import {
  artifactPlanItemFailedDataSchema,
  artifactPlanProgressDataSchema,
} from "@/features/agents/artifact-plan-contract";
import type { KnowledgeCitationEvidence } from "@/features/agents/knowledge-citation-contract";
import { KNOWLEDGE_AGENT_TOOL_IDS } from "@/features/agents/knowledge-tool-contract";
import type { AgentSurfaceContext } from "@/features/agents/surface-context";
import type { ThreadTitleUpdate } from "@/features/agents/thread-events";
import type { ArtifactSelection } from "@/features/artifacts/contract";
import type { ArtifactEditProposal } from "@/features/artifacts/proposal-contract";
import type { ArtifactHistoryItem, ArtifactKind } from "@/features/artifacts/types";
import { parseArtifactStreamEvent } from "@/features/artifacts/workbench-client";
import { ArtifactResultCard } from "./ArtifactResultCard";
import {
  KnowledgeEvidenceBoundary,
  KnowledgeEvidencePopover,
  KnowledgeMarkdownLink,
  useKnowledgeEvidence,
} from "./KnowledgeEvidence";
import { PanelShell } from "./PanelShell";
import { trustedKnowledgeCitationRemarkPlugin } from "./trusted-knowledge-citation-markdown";
import type { ChatPanelViewProps } from "./types";
import {
  AssistantRunStatus,
  extractWebSearchEvidence,
  WebSearchEvidence,
} from "./WebSearchEvidence";
import {
  type ArtifactStreamEvent,
  type ComposerSuggestion,
  messageIntentFromMessages,
  type UserMessageSurfaceSnapshot,
  useCancelAgentRun,
  useDictationError,
  WorkbenchChatRuntime,
  webSearchFromMessages,
  workspaceRetrievalFromMessages,
} from "./WorkbenchChatRuntime";
import { WorkspaceMessageHistoryControl } from "./WorkspaceMessageHistoryControl";

function KnowledgeEvidenceImage({
  alt,
  evidence,
}: {
  alt: string;
  evidence: NonNullable<ReturnType<typeof useKnowledgeEvidence>>["evidence"][number];
}) {
  const context = useKnowledgeEvidence();
  const t = useTranslations("Workbench");
  if (!context) return null;
  const displayNumber = context.displayNumbers.get(evidence.citationToken);
  if (displayNumber === undefined) return null;
  const image = (
    // biome-ignore lint/performance/noImgElement: authorized evidence endpoints must bypass shared image optimization and caching.
    <img
      alt={alt}
      className="max-h-[min(60vh,620px)] w-auto max-w-full rounded-lg object-contain"
      loading="lazy"
      src={`/api/workspaces/${encodeURIComponent(context.workspaceId)}/knowledge/evidence/${encodeURIComponent(evidence.evidenceId)}/image`}
    />
  );

  return (
    <figure className="my-4 max-w-full">
      <KnowledgeEvidencePopover
        displayNumber={displayNumber}
        evidence={evidence}
        trigger={
          <button
            type="button"
            aria-label={t("openKnowledgeEvidence", {
              number: displayNumber,
              source: evidence.sourceName,
            })}
            className="block max-w-full rounded-lg outline-none transition-shadow hover:ring-1 hover:ring-[var(--workspace-border-strong)] focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
            data-testid={`knowledge-visual-${displayNumber}`}
          >
            {image}
          </button>
        }
        onOpenKnowledgeNetwork={context.onOpenKnowledgeNetwork}
        workspaceId={context.workspaceId}
      />
    </figure>
  );
}

function knowledgeEvidenceImageAlt(
  evidence: NonNullable<ReturnType<typeof useKnowledgeEvidence>>["evidence"][number],
) {
  return evidence.content.kind === "visual_region"
    ? (evidence.content.accessibleDescription ?? evidence.sourceName)
    : evidence.sourceName;
}

function preprocessAssistantMarkdown(text: string) {
  return normalizeMathDelimiters(text);
}

function SuppressedMarkdownImage() {
  return null;
}

function KnowledgeMarkdownDiv(props: ComponentPropsWithoutRef<"div">) {
  const knowledgeEvidence = useKnowledgeEvidence();
  const citationToken = Reflect.get(props, "data-knowledge-visual-token");
  if (typeof citationToken === "string") {
    const evidence = knowledgeEvidence?.visualEvidenceByToken.get(citationToken);
    return evidence ? (
      <KnowledgeEvidenceImage alt={knowledgeEvidenceImageAlt(evidence)} evidence={evidence} />
    ) : null;
  }
  return <div {...props} />;
}

function MarkdownText({ partIndex }: { partIndex: number }) {
  const knowledgeEvidence = useKnowledgeEvidence();
  const visualEvidenceTokens =
    knowledgeEvidence?.visualEvidenceTokensByPartIndex.get(partIndex) ?? [];
  const citationPlugin = useMemo(
    () =>
      trustedKnowledgeCitationRemarkPlugin(knowledgeEvidence?.evidence ?? [], visualEvidenceTokens),
    [knowledgeEvidence?.evidence, visualEvidenceTokens],
  );
  return (
    <MarkdownTextPrimitive
      className="aui-md"
      components={{
        a: KnowledgeMarkdownLink,
        div: KnowledgeMarkdownDiv,
        img: SuppressedMarkdownImage,
      }}
      defer
      preprocess={preprocessAssistantMarkdown}
      rehypePlugins={[rehypeKatex]}
      remarkPlugins={[remarkGfm, remarkMath, citationPlugin]}
      smooth={false}
    />
  );
}

export function visibleAssistantTextPartIndexes(
  parts: ReadonlyArray<{ text?: string; toolName?: string; type: string }>,
) {
  return new Set(
    parts.flatMap((part, index) => (part.type === "text" && part.text?.trim() ? [index] : [])),
  );
}

function artifactPlanProgressFromPart(part: { data?: unknown; name?: string; type: string }) {
  if (
    part.type !== "data-artifactPlanProgress" &&
    !(part.type === "data" && part.name === "artifactPlanProgress")
  ) {
    return null;
  }
  const parsed = artifactPlanProgressDataSchema.safeParse(part.data);
  return parsed.success ? parsed.data : null;
}

function artifactPlanFailureFromPart(part: { data?: unknown; name?: string; type: string }) {
  if (
    part.type !== "data-artifactPlanItemFailed" &&
    !(part.type === "data" && part.name === "artifactPlanItemFailed")
  ) {
    return null;
  }
  const parsed = artifactPlanItemFailedDataSchema.safeParse(part.data);
  return parsed.success ? parsed.data : null;
}

function ArtifactPlanProgressPart({
  progress,
}: {
  progress: NonNullable<ReturnType<typeof artifactPlanProgressFromPart>>;
}) {
  const t = useTranslations("Workbench");
  if (progress.status === "completed") return null;
  const labels: Record<ArtifactKind, string> = {
    animation: t("tools.animation"),
    game: t("tools.interactiveGame"),
    mind_map: t("tools.mindMap"),
    presentation: t("tools.smartSlides"),
    quiz: t("tools.quiz"),
    teaching_document: t("tools.teachingDocument"),
  };
  return (
    <div className="py-1 text-xs text-[var(--workspace-text-muted)]" role="status">
      {t("agentToolCreatingArtifact", { kind: labels[progress.kind] })}
    </div>
  );
}

function ArtifactPlanFailurePart({
  failure,
}: {
  failure: NonNullable<ReturnType<typeof artifactPlanFailureFromPart>>;
}) {
  const t = useTranslations("Workbench");
  return (
    <div className="py-1 text-xs text-[var(--workspace-text-muted)]">
      {t("agentToolArtifactFailed", { title: failure.title })}
    </div>
  );
}

function ProjectedMarkdownText({ visibleIndexes }: { visibleIndexes: ReadonlySet<number> }) {
  const aui = useAui();
  if (aui.part.source !== "message") return null;
  const selector = aui.part.query;
  if (selector.type !== "index" || !visibleIndexes.has(selector.index)) return null;
  return <MarkdownText partIndex={selector.index} />;
}

function isLatestArtifactEvent(event: ArtifactStreamEvent, events: readonly ArtifactStreamEvent[]) {
  let latest: ArtifactStreamEvent | undefined;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.detail.id === event.detail.id) {
      latest = events[index];
      break;
    }
  }
  if (!latest) return true;
  return (
    latest.detail.generationSequence === event.detail.generationSequence &&
    latest.detail.generationState === event.detail.generationState &&
    latest.detail.updatedAt === event.detail.updatedAt
  );
}

function AssistantMessage({
  artifactHistory,
  conversationId,
  onOpenArtifact,
  onArtifactEvent,
  onOpenKnowledgeNetwork,
  unavailableArtifactIds,
  workspaceId,
}: {
  artifactHistory?: readonly ArtifactHistoryItem[] | undefined;
  conversationId: string;
  onOpenArtifact?: ((artifactId: string) => void) | undefined;
  onArtifactEvent?: ((event: ArtifactStreamEvent) => void) | undefined;
  onOpenKnowledgeNetwork?: ((evidence: KnowledgeCitationEvidence) => void) | undefined;
  unavailableArtifactIds?: ReadonlySet<string> | undefined;
  workspaceId: string;
}) {
  const t = useTranslations("Workbench");
  const isCopied = useAuiState((state) => state.message.isCopied);
  const isLast = useAuiState((state) => state.message.isLast);
  const isRunning = useAuiState((state) => state.thread.isRunning);
  const isFailed = useAuiState(
    (state) =>
      state.message.status?.type === "incomplete" && state.message.status.reason === "error",
  );
  const sourceUserMessageId = useAuiState((state) => {
    const currentIndex = state.thread.messages.findIndex(
      (message) => message.id === state.message.id,
    );
    for (let index = currentIndex - 1; index >= 0; index -= 1) {
      const message = state.thread.messages[index];
      if (message?.role === "user") return message.id;
    }
    return null;
  });
  const messageParts = useAuiState((state) => state.message.parts);
  const visibleTextPartIndexes = useMemo(
    () => visibleAssistantTextPartIndexes(messageParts),
    [messageParts],
  );
  const artifactDataEvents = useMemo(
    () =>
      messageParts.flatMap((part) => {
        const event = parseArtifactStreamEvent(part);
        return event ? [event] : [];
      }),
    [messageParts],
  );
  const activePlanProgress = useMemo(() => {
    for (let index = messageParts.length - 1; index >= 0; index -= 1) {
      const part = messageParts[index];
      if (!part) continue;
      const progress = artifactPlanProgressFromPart(part);
      if (progress) return progress.status === "running";
    }
    return false;
  }, [messageParts]);
  const shouldRender = useAuiState((state) => {
    const evidence = extractWebSearchEvidence(state.message.parts);
    if (evidence.hasText || evidence.hasError) return true;
    if (state.message.status?.type === "incomplete" && state.message.status.reason === "error") {
      return true;
    }
    return state.message.parts.some((part) => {
      if (part.type === "text") return part.text.trim().length > 0;
      if (part.type === "tool-call") {
        return part.toolName !== "web_search";
      }
      return (
        parseArtifactStreamEvent(part) !== null ||
        artifactPlanProgressFromPart(part) !== null ||
        artifactPlanFailureFromPart(part) !== null
      );
    });
  });
  const showRunStatus = isLast && isRunning && !activePlanProgress;
  if (!shouldRender && !showRunStatus) return null;

  return (
    <MessagePrimitive.Root className="group w-full">
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5 pt-0.5">
        <div className="w-full max-w-[72ch] min-w-0 py-1.5 text-[15px] leading-relaxed text-[var(--workspace-text-primary)]">
          {shouldRender ? (
            <KnowledgeEvidenceBoundary
              isStreaming={isLast && isRunning}
              parts={messageParts}
              visibleTextPartIndexes={visibleTextPartIndexes}
              onOpenKnowledgeNetwork={onOpenKnowledgeNetwork}
              workspaceId={workspaceId}
            >
              <div className="workspace-chat-markdown relative select-text">
                <MessagePrimitive.Parts>
                  {({ part }) => {
                    if (part.type === "text") {
                      return <ProjectedMarkdownText visibleIndexes={visibleTextPartIndexes} />;
                    }
                    if (part.type === "tool-call") {
                      return part.toolName === "web_search" ||
                        part.toolName === KNOWLEDGE_AGENT_TOOL_IDS.searchWorkspace
                        ? false
                        : part.toolUI;
                    }
                    const planProgress = artifactPlanProgressFromPart(part);
                    if (planProgress) {
                      return <ArtifactPlanProgressPart progress={planProgress} />;
                    }
                    const planFailure = artifactPlanFailureFromPart(part);
                    if (planFailure) {
                      return <ArtifactPlanFailurePart failure={planFailure} />;
                    }
                    const artifactEvent = parseArtifactStreamEvent(part);
                    if (artifactEvent) {
                      if (!isLatestArtifactEvent(artifactEvent, artifactDataEvents)) return null;
                      return (
                        <ArtifactDataPart
                          artifactEvent={artifactEvent}
                          artifactHistory={artifactHistory}
                          conversationId={conversationId}
                          isLive={isLast && isRunning}
                          onArtifactEvent={onArtifactEvent}
                          onOpenArtifact={onOpenArtifact}
                          sourceUserMessageId={sourceUserMessageId}
                          unavailableArtifactIds={unavailableArtifactIds}
                        />
                      );
                    }
                    return null;
                  }}
                </MessagePrimitive.Parts>
                <WebSearchEvidence />
              </div>
            </KnowledgeEvidenceBoundary>
          ) : null}
          {showRunStatus ? <AssistantRunStatus /> : null}
        </div>
        <MessagePrimitive.Error>
          <ErrorPrimitive.Root className="text-xs text-red-600">
            {t("agentUnavailable")}
          </ErrorPrimitive.Root>
        </MessagePrimitive.Error>
        <ActionBarPrimitive.Root
          hideWhenRunning
          className={`mt-0.5 flex items-center gap-2 text-[var(--workspace-text-muted)] transition-opacity ${
            isFailed
              ? "opacity-100"
              : "opacity-60 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100"
          }`}
        >
          <ActionBarPrimitive.Copy
            aria-label={isCopied ? t("messageCopied") : t("copyMessage")}
            copiedDuration={2000}
            className="flex h-6 items-center justify-center gap-1 rounded-md px-1.5 transition-colors hover:text-[var(--workspace-text-primary)]"
          >
            {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {isCopied ? <span className="text-[11px]">{t("messageCopied")}</span> : null}
          </ActionBarPrimitive.Copy>
          {isLast && !isRunning && artifactDataEvents.length === 0 ? (
            <ActionBarPrimitive.Reload
              aria-label={isFailed ? t("retryResponse") : t("regenerateResponse")}
              className={`flex items-center justify-center gap-1.5 rounded-md transition-colors hover:text-[var(--workspace-text-primary)] ${
                isFailed
                  ? "h-8 border border-[var(--workspace-border-strong)] bg-[var(--workspace-surface-elevated)] px-3 text-xs font-medium text-[var(--workspace-text-primary)]"
                  : "h-6 px-1.5"
              }`}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {isFailed ? <span>{t("retryResponse")}</span> : null}
            </ActionBarPrimitive.Reload>
          ) : null}
        </ActionBarPrimitive.Root>
      </div>
    </MessagePrimitive.Root>
  );
}

function ArtifactDataPart({
  artifactEvent,
  artifactHistory,
  conversationId,
  isLive,
  onArtifactEvent,
  onOpenArtifact,
  sourceUserMessageId,
  unavailableArtifactIds,
}: {
  artifactEvent: ArtifactStreamEvent;
  artifactHistory?: readonly ArtifactHistoryItem[] | undefined;
  conversationId: string;
  isLive: boolean;
  onArtifactEvent?: ((event: ArtifactStreamEvent) => void) | undefined;
  onOpenArtifact?: ((artifactId: string) => void) | undefined;
  sourceUserMessageId: string | null;
  unavailableArtifactIds?: ReadonlySet<string> | undefined;
}) {
  const reportedRef = useRef(false);
  useEffect(() => {
    if (reportedRef.current) return;
    reportedRef.current = true;
    onArtifactEvent?.({
      ...artifactEvent,
      ...(!isLive ? { replayedFromHistory: true } : {}),
      ...(sourceUserMessageId ? { sourceUserMessageId } : {}),
    });
  }, [artifactEvent, isLive, onArtifactEvent, sourceUserMessageId]);
  return (
    <ArtifactResultCard
      artifactHistory={artifactHistory}
      artifactId={artifactEvent.detail.id}
      conversationId={conversationId}
      fallbackKind={artifactEvent.detail.kind}
      fallbackState={artifactEvent.detail.generationState}
      fallbackTitle={artifactEvent.detail.title}
      onOpenArtifact={onOpenArtifact}
      unavailableArtifactIds={unavailableArtifactIds}
    />
  );
}

function UserMessage() {
  const t = useTranslations("Workbench");
  const canEdit = useAuiState((state) => {
    if (state.thread.isRunning) return false;
    const currentIndex = state.thread.messages.findIndex(
      (message) => message.id === state.message.id,
    );
    for (let index = state.thread.messages.length - 1; index >= 0; index -= 1) {
      const message = state.thread.messages[index];
      if (message?.role !== "user") continue;
      if (message.id !== state.message.id) return false;
      return !state.thread.messages
        .slice(currentIndex + 1)
        .some(
          (candidate) =>
            candidate.role === "assistant" &&
            candidate.parts.some((part) => parseArtifactStreamEvent(part) !== null),
        );
    }
    return false;
  });
  return (
    <MessagePrimitive.Root className="group flex w-full flex-col items-end">
      <div className="flex w-full min-w-0 flex-1 flex-col items-end gap-1.5">
        <div className="w-fit max-w-[78%] select-text rounded-2xl rounded-tr-sm bg-[var(--workspace-surface-muted)] px-4 py-2.5 text-left text-[15px] leading-relaxed text-[var(--workspace-text-primary)]">
          <MessagePrimitive.Parts />
        </div>
        {canEdit ? (
          <ActionBarPrimitive.Root className="flex items-center text-[var(--workspace-text-muted)] opacity-60 transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
            <ActionBarPrimitive.Edit
              aria-label={t("editMessage")}
              className="flex h-6 items-center justify-center rounded-md px-1.5 transition-colors hover:text-[var(--workspace-text-primary)]"
            >
              <Pencil className="h-3.5 w-3.5" />
            </ActionBarPrimitive.Edit>
          </ActionBarPrimitive.Root>
        ) : null}
      </div>
    </MessagePrimitive.Root>
  );
}

function UserEditComposer() {
  const t = useTranslations("Workbench");
  const aui = useAui();
  const isEmpty = useAuiState((state) => state.composer.isEmpty);
  const sendEditedMessage = () => aui.composer().send({ startRun: true });
  return (
    <MessagePrimitive.Root className="flex w-full justify-end">
      <ComposerPrimitive.Root className="flex w-full max-w-[72%] items-end gap-2 rounded-2xl rounded-tr-sm border border-[var(--studio-border)] bg-[var(--studio-surface)] px-3 py-2 transition-colors focus-within:border-[var(--studio-border-strong)]">
        <ComposerPrimitive.Input
          autoFocus
          aria-label={t("editMessage")}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            sendEditedMessage();
          }}
          className="max-h-40 min-h-8 min-w-0 flex-1 select-text resize-none border-0 bg-transparent px-1 py-1 text-left text-[15px] leading-relaxed text-[var(--workspace-text-primary)] outline-none focus:outline-none focus-visible:!outline-none focus-visible:ring-0"
        />
        <div className="flex shrink-0 items-center gap-1 pb-0.5">
          <ComposerPrimitive.Cancel
            aria-label={t("cancelEdit")}
            title={t("cancelEdit")}
            className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--workspace-text-muted)] transition-colors hover:bg-[var(--workspace-surface-elevated)] hover:text-[var(--workspace-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--workspace-border-strong)]"
          >
            <X className="h-3.5 w-3.5" />
          </ComposerPrimitive.Cancel>
          <button
            type="button"
            aria-label={t("saveAndRegenerate")}
            title={t("saveAndRegenerate")}
            disabled={isEmpty}
            onClick={sendEditedMessage}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--studio-emphasis)] text-[var(--studio-on-emphasis)] transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)] disabled:opacity-40"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
        </div>
      </ComposerPrimitive.Root>
    </MessagePrimitive.Root>
  );
}

function UserMessageSlot() {
  const isEditing = useAuiState((state) => state.message.composer.isEditing);
  return isEditing ? <UserEditComposer /> : <UserMessage />;
}

function ComposerAction() {
  const t = useTranslations("Workbench");
  const aui = useAui();
  const cancelAgentRun = useCancelAgentRun();
  const isRunning = useAuiState((state) => state.thread.isRunning);
  const isDictating = useAuiState((state) => state.composer.dictation != null);
  const hasText = useAuiState((state) => state.composer.text.trim().length > 0);
  const quietClassName =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--workspace-border)] text-[var(--workspace-text-muted)] transition-colors hover:bg-[var(--workspace-surface-muted)] hover:text-[var(--workspace-text-primary)] disabled:opacity-50";
  const idleDictationClassName =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--studio-border)] bg-[var(--studio-surface-subtle)] text-[var(--studio-accent-text)] transition-colors hover:border-[var(--studio-border-strong)] hover:bg-[var(--studio-surface)] disabled:opacity-50";

  if (isRunning) {
    return (
      <button
        type="button"
        aria-label={t("stopGenerating")}
        className={quietClassName}
        onClick={() => cancelAgentRun(() => aui.thread().cancelRun())}
      >
        <Square className="h-3.5 w-3.5 fill-current" />
      </button>
    );
  }

  if (isDictating) {
    return (
      <ComposerPrimitive.StopDictation aria-label={t("stopDictation")} className={quietClassName}>
        <Square className="h-3.5 w-3.5 fill-current" />
      </ComposerPrimitive.StopDictation>
    );
  }

  if (hasText) {
    return (
      <ComposerPrimitive.Send
        aria-label={t("send")}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--studio-emphasis)] text-[var(--studio-on-emphasis)] transition-opacity hover:opacity-85 disabled:opacity-50"
      >
        <ArrowUp className="h-4 w-4" />
      </ComposerPrimitive.Send>
    );
  }

  return (
    <ComposerPrimitive.Dictate aria-label={t("startDictation")} className={idleDictationClassName}>
      <Mic className="h-4 w-4" />
    </ComposerPrimitive.Dictate>
  );
}

function DictationErrorNotice() {
  const t = useTranslations("Workbench");
  const dictation = useDictationError();
  if (!dictation?.error) return null;

  return (
    <div
      role="alert"
      className="mb-2 flex items-start gap-2 rounded-xl border border-[var(--app-danger)]/20 bg-[var(--app-danger-bg)] px-3 py-2 text-xs text-[var(--app-danger)]"
    >
      <span className="min-w-0 flex-1">
        {dictation.error === "unsupported" ? t("dictationUnsupported") : t("dictationFailed")}
      </span>
      <button
        type="button"
        aria-label={t("dismissDictationError")}
        onClick={dictation.clear}
        className="shrink-0 rounded-full p-0.5 transition-colors hover:bg-[var(--app-danger)]/10"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function WorkbenchComposerInput({
  composerInputRef,
}: {
  composerInputRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const t = useTranslations("Workbench");
  return (
    <ComposerPrimitive.Input
      ref={composerInputRef}
      placeholder={t("composerPlaceholder")}
      submitMode="enter"
      className="workspace-chat-composer-input relative z-10 min-h-[44px] w-full select-text resize-none overflow-hidden border-none bg-transparent px-3 py-2.5 text-sm leading-5 text-[var(--workspace-text-primary)] outline-none disabled:cursor-wait disabled:opacity-60"
      minRows={2}
      rows={1}
    />
  );
}

function PendingRunStatus() {
  const show = useAuiState((state) => {
    if (!state.thread.isRunning) return false;
    return state.thread.messages.at(-1)?.role === "user";
  });
  return show ? <AssistantRunStatus /> : null;
}

export function ChatPanelView({
  conversationId,
  workspaceId,
  title,
  subtitle,
  messages,
  initialMessagesNextCursor = null,
  onThreadTitle,
  selectedSourceCount,
  surfaceContext = { type: "studio" },
  composerSuggestion,
  onComposerSuggestionConsumed,
  onArtifactEvent,
  onUserMessageCreated,
  artifactHistory,
  onOpenArtifact,
  unavailableArtifactIds,
  artifactContext,
  artifactSelection,
  onClearArtifactSelection,
  composerFocusRequest = 0,
  onArtifactProposal,
  onOpenKnowledgeNetwork,
}: ChatPanelViewProps & {
  artifactHistory?: readonly ArtifactHistoryItem[] | undefined;
  surfaceContext?: AgentSurfaceContext;
  composerSuggestion?: ComposerSuggestion | null | undefined;
  onComposerSuggestionConsumed?: ((id: number) => void) | undefined;
  conversationId: string;
  onThreadTitle?: (update: ThreadTitleUpdate) => void;
  workspaceId: string;
  onArtifactEvent?: ((event: ArtifactStreamEvent) => void) | undefined;
  onUserMessageCreated?: ((snapshot: UserMessageSurfaceSnapshot) => void) | undefined;
  onOpenArtifact?: ((artifactId: string) => void) | undefined;
  unavailableArtifactIds?: ReadonlySet<string> | undefined;
  artifactContext?:
    | { kind: Exclude<ArtifactKind, "presentation">; title: string }
    | { kind: "presentation"; pageCount: number; title: string }
    | undefined;
  artifactSelection?: ArtifactSelection | null | undefined;
  onClearArtifactSelection?: (() => void) | undefined;
  composerFocusRequest?: number | undefined;
  onArtifactProposal?: ((proposal: ArtifactEditProposal) => void) | undefined;
  onOpenKnowledgeNetwork?: ((evidence: KnowledgeCitationEvidence) => void) | undefined;
}) {
  const t = useTranslations("Workbench");
  const locale = useLocale() === "en-US" ? "en-US" : "zh-CN";
  const ArtifactContextIcon =
    artifactContext?.kind === "mind_map"
      ? Network
      : artifactContext?.kind === "quiz"
        ? ListChecks
        : artifactContext?.kind === "presentation"
          ? MonitorPlay
          : artifactContext?.kind === "game"
            ? Gamepad2
            : BookOpenText;
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const [messageIntent, setMessageIntent] = useState<"chat" | "plan">(() =>
    messageIntentFromMessages(messages),
  );
  const [forceWorkspaceRetrieval, setForceWorkspaceRetrieval] = useState(() =>
    workspaceRetrievalFromMessages(messages),
  );
  const [forceWebSearch, setForceWebSearch] = useState(() => webSearchFromMessages(messages));
  useEffect(() => {
    if (composerFocusRequest <= 0) return;
    requestAnimationFrame(() => composerInputRef.current?.focus());
  }, [composerFocusRequest]);

  return (
    <WorkbenchChatRuntime
      conversationId={conversationId}
      locale={locale}
      messages={messages}
      workspaceId={workspaceId}
      surfaceContext={surfaceContext}
      messageIntent={messageIntent}
      forceWorkspaceRetrieval={forceWorkspaceRetrieval}
      forceWebSearch={forceWebSearch}
      onUserMessageCreated={onUserMessageCreated}
      onPlanningFinished={() => setMessageIntent("chat")}
      composerSuggestion={composerSuggestion}
      onComposerSuggestionConsumed={onComposerSuggestionConsumed}
      onArtifactProposal={onArtifactProposal}
      {...(onThreadTitle ? { onThreadTitle } : {})}
    >
      <PanelShell className="workspace-assistant-tone-panel" testId="chat-panel">
        <div className="flex h-[52px] items-center px-4">
          <div className="min-w-0 flex-1 flex-col justify-center">
            <h2 className="truncate text-lg font-bold leading-tight">
              <span className="truncate whitespace-nowrap">{title}</span>
            </h2>
            <div className="mt-0.5 text-xs font-medium leading-tight text-[var(--workspace-text-muted)]">
              {subtitle}
            </div>
          </div>
        </div>
        <ThreadPrimitive.ViewportProvider>
          <ThreadPrimitive.Root className="relative flex h-[calc(100%-52px)] min-h-0 flex-col">
            <ThreadPrimitive.Viewport
              turnAnchor="top"
              className="workspace-chat-viewport relative min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4"
            >
              <div className="mx-auto flex min-h-full w-full flex-col py-4">
                <WorkspaceMessageHistoryControl
                  conversationId={conversationId}
                  initialMessages={messages}
                  initialNextCursor={initialMessagesNextCursor}
                  workspaceId={workspaceId}
                />
                <AuiIf condition={(state) => state.thread.messages.length === 0}>
                  <div className="flex flex-1 items-center justify-center px-6 text-center">
                    <div className="max-w-sm">
                      <h3 className="text-lg font-semibold text-[var(--workspace-text-primary)]">
                        {t("welcomeTitle")}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-[var(--workspace-text-muted)]">
                        {t("welcomeDescription")}
                      </p>
                    </div>
                  </div>
                </AuiIf>
                <div className="space-y-5">
                  <ThreadPrimitive.Messages>
                    {({ message }) =>
                      message.role === "user" ? (
                        <UserMessageSlot />
                      ) : (
                        <AssistantMessage
                          artifactHistory={artifactHistory}
                          conversationId={conversationId}
                          onArtifactEvent={onArtifactEvent}
                          onOpenArtifact={onOpenArtifact}
                          onOpenKnowledgeNetwork={onOpenKnowledgeNetwork}
                          unavailableArtifactIds={unavailableArtifactIds}
                          workspaceId={workspaceId}
                        />
                      )
                    }
                  </ThreadPrimitive.Messages>
                  <PendingRunStatus />
                </div>
              </div>
              <ThreadPrimitive.ScrollToBottom
                aria-label={t("scrollToBottom")}
                behavior="smooth"
                className="sticky bottom-4 left-1/2 z-20 flex h-8 w-8 -translate-x-1/2 items-center justify-center overflow-hidden rounded-full border border-white/80 bg-white/35 text-[var(--workspace-text-primary)] shadow-[inset_0_1px_1px_rgba(255,255,255,1),0_6px_18px_rgba(24,24,27,0.1)] backdrop-blur-2xl backdrop-saturate-150 transition hover:-translate-y-0.5 hover:bg-white/55 dark:border-white/20 dark:bg-white/10 dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] dark:hover:bg-white/15"
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-y-2 left-[-25%] w-[60%] -skew-x-[24deg] bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/15"
                />
                <ArrowDown className="relative h-4 w-4" />
              </ThreadPrimitive.ScrollToBottom>
            </ThreadPrimitive.Viewport>
            <div className="relative z-10 shrink-0 bg-[var(--workspace-surface)] px-4 pt-2 pb-3">
              <div className="relative">
                <DictationErrorNotice />
                <Popover.Root>
                  <Popover.Anchor asChild>
                    <ComposerPrimitive.Root className="workspace-chat-input-shell relative rounded-[22px] border p-2 shadow-sm backdrop-blur-2xl">
                      <div
                        id="workspace-planning-composer-slot"
                        className="workspace-planning-composer-slot"
                      />
                      <div className="workspace-normal-composer">
                        {artifactContext ? (
                          <div className="flex items-center gap-2 px-2.5 pt-1.5 pb-0.5">
                            <div className="flex min-w-0 items-center gap-1.5 rounded-full border border-[var(--studio-border)] bg-[var(--studio-surface-subtle)] px-2.5 py-1 text-[11px] font-medium text-[var(--workspace-text-muted)]">
                              <ArtifactContextIcon className="h-3 w-3 shrink-0 text-[var(--studio-accent-text)]" />
                              <span className="truncate">
                                {artifactSelection?.kind === "teaching_document_blocks"
                                  ? t("documentContextSelection", {
                                      blocks: artifactSelection.blockIds.length,
                                      characters: artifactSelection.selectedText.length,
                                    })
                                  : artifactSelection?.kind === "mind_map_subtrees"
                                    ? t("mindMapContextSelection", {
                                        nodes: artifactSelection.nodeIds.length,
                                      })
                                    : artifactSelection?.kind === "quiz_questions"
                                      ? t("quizContextSelection", {
                                          questions: artifactSelection.questionIds.length,
                                        })
                                      : artifactSelection?.kind === "presentation_slides"
                                        ? t("presentationContextSelection", {
                                            slide: (artifactSelection.slideIndexes[0] ?? 0) + 1,
                                            total:
                                              artifactContext.kind === "presentation"
                                                ? artifactContext.pageCount
                                                : 0,
                                          })
                                        : artifactContext.kind === "mind_map"
                                          ? t("mindMapContextCurrent", {
                                              title: artifactContext.title,
                                            })
                                          : artifactContext.kind === "quiz"
                                            ? t("quizContextCurrent", {
                                                title: artifactContext.title,
                                              })
                                            : artifactContext.kind === "game"
                                              ? t("gameContextCurrent", {
                                                  title: artifactContext.title,
                                                })
                                              : artifactContext.kind === "presentation"
                                                ? t("presentationContextCurrent", {
                                                    title: artifactContext.title,
                                                  })
                                                : t("teachingDocumentContextCurrent", {
                                                    title: artifactContext.title,
                                                  })}
                              </span>
                              {artifactSelection && onClearArtifactSelection ? (
                                <button
                                  type="button"
                                  aria-label={
                                    artifactSelection.kind === "teaching_document_blocks"
                                      ? t("documentContextClearSelection")
                                      : t("artifactContextClearSelection")
                                  }
                                  onClick={onClearArtifactSelection}
                                  className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-[var(--studio-surface)] hover:text-[var(--workspace-text-primary)]"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                        {selectedSourceCount > 0 ? (
                          <div className="px-3 pt-1 pb-0.5 text-[11px] font-medium text-[var(--workspace-text-muted)]">
                            {t("selectedSources", { count: selectedSourceCount })}
                          </div>
                        ) : null}
                        <div className="workspace-chat-composer-scroll max-h-[176px] min-w-0 overflow-y-auto overscroll-y-contain">
                          <WorkbenchComposerInput composerInputRef={composerInputRef} />
                        </div>
                        <div className="flex h-10 w-full items-center justify-between px-1">
                          <div className="flex min-w-0 items-center gap-1">
                            <Popover.Trigger asChild>
                              <button
                                type="button"
                                aria-label={t("composerAddMenu")}
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--workspace-text-muted)] outline-none transition-colors hover:bg-[var(--workspace-surface-muted)] hover:text-[var(--workspace-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
                              >
                                <Plus className="h-5 w-5" />
                              </button>
                            </Popover.Trigger>
                            <Popover.Portal>
                              <Popover.Content
                                data-workspace-theme="mist-zinc"
                                role="menu"
                                align="start"
                                side="top"
                                sideOffset={8}
                                collisionPadding={12}
                                className="z-[80] w-[var(--radix-popover-trigger-width)] rounded-[20px] border border-[var(--workspace-border-strong)] bg-[var(--workspace-surface-elevated)] p-2 text-[var(--workspace-text-primary)] shadow-2xl outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom-1 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-2"
                              >
                                <div className="px-3 pb-1.5 pt-1 text-sm font-medium text-[var(--workspace-text-muted)]">
                                  {t("composerAddTitle")}
                                </div>
                                <Popover.Close asChild>
                                  <button
                                    type="button"
                                    role="menuitemcheckbox"
                                    aria-checked={messageIntent === "plan"}
                                    onClick={() =>
                                      setMessageIntent((value) =>
                                        value === "plan" ? "chat" : "plan",
                                      )
                                    }
                                    className="flex min-h-12 w-full cursor-pointer select-none items-center gap-3 rounded-xl px-3 py-2 text-left outline-none hover:bg-[var(--workspace-surface-muted)] focus-visible:bg-[var(--workspace-surface-muted)]"
                                  >
                                    <Lightbulb className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                                    <span className="flex min-w-0 flex-1 items-baseline gap-2">
                                      <span className="shrink-0 text-sm font-medium">
                                        {t("planStart")}
                                      </span>
                                      <span className="truncate text-sm text-[var(--workspace-text-muted)]">
                                        {t("planDescription")}
                                      </span>
                                    </span>
                                    {messageIntent === "plan" ? (
                                      <Check className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                    ) : null}
                                  </button>
                                </Popover.Close>
                                <Popover.Close asChild>
                                  <button
                                    type="button"
                                    role="menuitemcheckbox"
                                    aria-checked={forceWorkspaceRetrieval}
                                    onClick={() => setForceWorkspaceRetrieval((value) => !value)}
                                    className="flex min-h-12 w-full cursor-pointer select-none items-center gap-3 rounded-xl px-3 py-2 text-left outline-none hover:bg-[var(--workspace-surface-muted)] focus-visible:bg-[var(--workspace-surface-muted)]"
                                  >
                                    <BookOpenText className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
                                    <span className="flex min-w-0 flex-1 items-baseline gap-2">
                                      <span className="shrink-0 text-sm font-medium">
                                        {t("workspaceRetrieval")}
                                      </span>
                                      <span className="truncate text-sm text-[var(--workspace-text-muted)]">
                                        {t("workspaceRetrievalDescription")}
                                      </span>
                                    </span>
                                    {forceWorkspaceRetrieval ? (
                                      <Check className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                    ) : null}
                                  </button>
                                </Popover.Close>
                                <Popover.Close asChild>
                                  <button
                                    type="button"
                                    role="menuitemcheckbox"
                                    aria-checked={forceWebSearch}
                                    onClick={() => setForceWebSearch((value) => !value)}
                                    className="flex min-h-12 w-full cursor-pointer select-none items-center gap-3 rounded-xl px-3 py-2 text-left outline-none hover:bg-[var(--workspace-surface-muted)] focus-visible:bg-[var(--workspace-surface-muted)]"
                                  >
                                    <Globe2 className="h-5 w-5 shrink-0 text-violet-600 dark:text-violet-400" />
                                    <span className="flex min-w-0 flex-1 items-baseline gap-2">
                                      <span className="shrink-0 text-sm font-medium">
                                        {t("webSearch")}
                                      </span>
                                      <span className="truncate text-sm text-[var(--workspace-text-muted)]">
                                        {t("webSearchDescription")}
                                      </span>
                                    </span>
                                    {forceWebSearch ? (
                                      <Check className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                                    ) : null}
                                  </button>
                                </Popover.Close>
                              </Popover.Content>
                            </Popover.Portal>
                            {messageIntent === "plan" ? (
                              <>
                                <span className="mx-1 h-5 w-px bg-[var(--workspace-border-strong)]" />
                                <button
                                  type="button"
                                  onClick={() => setMessageIntent("chat")}
                                  className="flex h-9 items-center gap-1.5 px-1.5 text-sm font-medium text-[var(--workspace-text-primary)] transition-colors hover:text-[var(--workspace-accent)]"
                                >
                                  <Lightbulb className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                  {t("planStart")}
                                </button>
                              </>
                            ) : null}
                            {forceWorkspaceRetrieval ? (
                              <>
                                <span className="mx-1 h-5 w-px bg-[var(--workspace-border-strong)]" />
                                <button
                                  type="button"
                                  onClick={() => setForceWorkspaceRetrieval(false)}
                                  className="flex h-9 items-center gap-1.5 px-1.5 text-sm font-medium text-[var(--workspace-text-primary)] transition-colors hover:text-[var(--workspace-accent)]"
                                >
                                  <BookOpenText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                  {t("workspaceRetrieval")}
                                </button>
                              </>
                            ) : null}
                            {forceWebSearch ? (
                              <>
                                <span className="mx-1 h-5 w-px bg-[var(--workspace-border-strong)]" />
                                <button
                                  type="button"
                                  onClick={() => setForceWebSearch(false)}
                                  className="flex h-9 items-center gap-1.5 px-1.5 text-sm font-medium text-[var(--workspace-text-primary)] transition-colors hover:text-[var(--workspace-accent)]"
                                >
                                  <Globe2 className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                                  {t("webSearch")}
                                </button>
                              </>
                            ) : null}
                          </div>
                          <ComposerAction />
                        </div>
                      </div>
                    </ComposerPrimitive.Root>
                  </Popover.Anchor>
                </Popover.Root>
              </div>
            </div>
          </ThreadPrimitive.Root>
        </ThreadPrimitive.ViewportProvider>
      </PanelShell>
    </WorkbenchChatRuntime>
  );
}
