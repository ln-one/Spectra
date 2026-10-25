"use client";

import { ArrowUpRight, CheckCircle2, FileX2, LoaderCircle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import {
  type ArtifactHistoryItem,
  type ArtifactKind,
  artifactEffectiveGenerationState,
} from "@/features/artifacts/types";
import { artifactPresentation } from "@/features/artifacts/ui/artifact-presentation";

export type ArtifactResultCardProps = {
  artifactHistory?: readonly ArtifactHistoryItem[] | undefined;
  artifactId: string;
  conversationId: string;
  fallbackState: ArtifactHistoryItem["generationState"];
  fallbackKind: ArtifactKind;
  fallbackTitle: string;
  historyUnavailable?: boolean | undefined;
  onOpenArtifact?: ((artifactId: string) => void) | undefined;
  onRetryArtifact?: ((artifactId: string) => Promise<void>) | undefined;
  unavailableArtifactIds?: ReadonlySet<string> | undefined;
};

export function ArtifactResultCard({
  artifactHistory,
  artifactId,
  conversationId,
  fallbackState,
  fallbackKind,
  fallbackTitle,
  historyUnavailable,
  onOpenArtifact,
  onRetryArtifact,
  unavailableArtifactIds,
}: ArtifactResultCardProps) {
  const t = useTranslations("Workbench");
  const retryingRef = useRef(false);
  const [retrying, setRetrying] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);
  const currentArtifact = artifactHistory?.find((item) => item.id === artifactId);
  const currentTitle = currentArtifact?.title ?? fallbackTitle;
  const generationState = currentArtifact
    ? artifactEffectiveGenerationState(currentArtifact)
    : fallbackState;
  const artifactKind = currentArtifact?.kind ?? fallbackKind;
  const { Icon: ArtifactIcon, tone: artifactTone } = artifactPresentation(artifactKind);
  const isUnavailable = unavailableArtifactIds?.has(artifactId) ?? false;
  const canRetry =
    !isUnavailable &&
    generationState === "failed" &&
    currentArtifact?.canRetryGeneration === true &&
    onRetryArtifact !== undefined;
  const href = `?conversation=${encodeURIComponent(conversationId)}&artifact=${encodeURIComponent(artifactId)}`;
  const readyLabels: Record<ArtifactKind, string> = {
    animation: t("animationArtifactReady"),
    game: t("gameArtifactReady"),
    mind_map: t("mindMapArtifactReady"),
    presentation: t("presentationArtifactReady"),
    quiz: t("quizArtifactReady"),
    teaching_document: t("teachingDocumentArtifactReady"),
  };
  const previewLabels: Partial<Record<ArtifactKind, string>> = {
    animation: t("artifactPreviewPlaceholderAnimation"),
    mind_map: t("artifactPreviewPlaceholderMindMap"),
    presentation: t("artifactPreviewPlaceholderPresentation"),
    teaching_document: t("artifactPreviewPlaceholderTeachingDocument"),
  };
  const unavailableLabels: Record<ArtifactKind, string> = {
    animation: t("animationArtifactUnavailable"),
    game: t("gameArtifactUnavailable"),
    mind_map: t("mindMapArtifactUnavailable"),
    presentation: t("presentationArtifactUnavailable"),
    quiz: t("quizArtifactUnavailable"),
    teaching_document: t("teachingDocumentArtifactUnavailable"),
  };
  const statusLabel = isUnavailable
    ? unavailableLabels[artifactKind]
    : generationState === "queued"
      ? t("artifactQueued")
      : generationState === "ready"
        ? readyLabels[artifactKind]
        : generationState === "failed"
          ? t("artifactGenerationFailed")
          : generationState === "cancelled"
            ? t("artifactGenerationCancelled")
            : generationState === "finalizing"
              ? t("artifactFinalizing")
              : t("artifactGenerating");
  const failureCode = currentArtifact?.failureCode ?? null;
  const failureMessage = retryFailed
    ? t("artifactRetryFailed")
    : failureCode?.includes("rate_limit")
      ? t("artifactFailureRateLimited")
      : failureCode?.includes("timeout") || failureCode?.includes("stalled")
        ? t("artifactFailureTimedOut")
        : failureCode?.includes("runtime") || failureCode?.includes("configuration")
          ? t("artifactFailureUnavailable")
          : generationState === "failed"
            ? t("artifactFailureGeneric")
            : generationState === "cancelled"
              ? t("artifactCancelledDescription")
              : null;
  const retry = async () => {
    if (!onRetryArtifact || retryingRef.current) return;
    retryingRef.current = true;
    setRetrying(true);
    setRetryFailed(false);
    try {
      await onRetryArtifact(artifactId);
    } catch {
      setRetryFailed(true);
    } finally {
      retryingRef.current = false;
      setRetrying(false);
    }
  };
  const content = (
    <>
      {generationState === "ready" && previewLabels[artifactKind] ? (
        <span
          aria-hidden="true"
          data-testid="artifact-preview-placeholder"
          className="flex h-11 w-16 shrink-0 flex-col items-center justify-center rounded-xl border border-[var(--studio-border)] bg-[var(--studio-surface)] px-1 text-[var(--studio-accent-text)]"
        >
          <ArtifactIcon className="h-4 w-4" strokeWidth={2.1} />
          <span className="mt-0.5 max-w-full truncate text-[9px] font-semibold leading-none">
            {previewLabels[artifactKind]}
          </span>
        </span>
      ) : (
        <span className="workspace-tool-icon-container flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border">
          {isUnavailable || generationState === "failed" || generationState === "cancelled" ? (
            <FileX2 className="h-5 w-5" strokeWidth={2.1} />
          ) : generationState === "ready" ? (
            <CheckCircle2 className="h-5 w-5" strokeWidth={2.1} />
          ) : (
            <ArtifactIcon
              className="h-5 w-5 animate-pulse motion-reduce:animate-none"
              strokeWidth={2.1}
            />
          )}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span
          aria-live="polite"
          className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--studio-accent-text)]"
        >
          {statusLabel}
        </span>
        <span className="mt-0.5 block truncate text-sm font-semibold text-[var(--workspace-text-primary)]">
          {currentTitle}
        </span>
        {failureMessage ? (
          <span className="mt-1 block text-xs leading-4 text-[var(--workspace-text-muted)]">
            {failureMessage}
          </span>
        ) : null}
        {generationState === "failed" && !canRetry && !isUnavailable ? (
          <span className="mt-1 block text-xs leading-4 text-[var(--workspace-text-muted)]">
            {t("artifactRetryUnsupported")}
          </span>
        ) : null}
        {historyUnavailable && !isUnavailable ? (
          <span className="mt-1 block text-xs leading-4 text-[var(--workspace-text-muted)]">
            {t("artifactStatusUpdateUnavailable")}
          </span>
        ) : null}
      </span>
      {canRetry ? (
        <button
          type="button"
          aria-label={t("retryArtifactGeneration", { title: currentTitle })}
          disabled={retrying}
          onClick={() => void retry()}
          className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface)] px-3 text-xs font-medium text-[var(--studio-accent-text)] transition-colors hover:border-[var(--studio-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)] disabled:opacity-60"
        >
          {retrying ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" />
          )}
          {retrying ? t("artifactRetrying") : t("artifactRetry")}
        </button>
      ) : isUnavailable ? null : (
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-[var(--studio-accent-text)]">
          {generationState === "ready"
            ? t("openArtifactAction")
            : generationState === "failed" || generationState === "cancelled"
              ? t("viewArtifactStatus")
              : t("viewGenerationProgress")}
          <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover/artifact:-translate-y-0.5 group-hover/artifact:translate-x-0.5" />
        </span>
      )}
    </>
  );

  if (isUnavailable) {
    return (
      <div className="flex w-full max-w-[72ch] min-w-0 select-none items-center gap-3 overflow-hidden rounded-2xl border border-[var(--workspace-border)] bg-[var(--workspace-surface-muted)] px-3.5 py-3 opacity-75">
        {content}
      </div>
    );
  }
  if (canRetry) {
    return (
      <div
        data-studio-tone={artifactTone}
        className="flex w-full max-w-[72ch] min-w-0 select-none items-center gap-3 overflow-hidden rounded-2xl border border-[var(--studio-border)] bg-[var(--studio-surface-subtle)] px-3.5 py-3 text-left shadow-sm"
      >
        {content}
      </div>
    );
  }
  return (
    <Link
      data-studio-tone={artifactTone}
      href={href}
      aria-label={t("openArtifact", { title: currentTitle })}
      onClick={(event) => {
        if (
          !onOpenArtifact ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        event.preventDefault();
        onOpenArtifact(artifactId);
      }}
      className="group/artifact flex w-full max-w-[72ch] min-w-0 select-none items-center gap-3 overflow-hidden rounded-2xl border border-[var(--studio-border)] bg-[var(--studio-surface-subtle)] px-3.5 py-3 text-left shadow-sm transition-[border-color,background-color,box-shadow] hover:border-[var(--studio-border-strong)] hover:bg-[var(--studio-surface)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
    >
      {content}
    </Link>
  );
}
