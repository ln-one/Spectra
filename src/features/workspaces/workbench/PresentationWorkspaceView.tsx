"use client";

import { Maximize2, MonitorPlay, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { presentationEditorHref } from "@/features/artifacts/presentations/editor-route";
import { presentationPreviewPhase } from "@/features/artifacts/presentations/preview";
import type { PresentationFocus } from "@/features/artifacts/presentations/refine";
import {
  type PresentationDetail,
  presentationDetailSchema,
} from "@/features/artifacts/presentations/types";
import type { PresentationEditProposal } from "@/features/artifacts/proposal-contract";
import {
  artifactSuggestionQueryKeys,
  fetchArtifactSuggestions,
  regenerateArtifactSuggestions,
} from "@/features/artifacts/suggestions/queries";
import { fetchArtifactDetail } from "@/features/artifacts/workbench-client";
import {
  ArtifactGenerationView,
  ArtifactStartView,
  ArtifactWorkspaceShell,
} from "./ArtifactWorkspacePrimitives";
import type { ArtifactWorkspacePhase } from "./artifactWorkbench";
import { PresentationEditorFrame } from "./PresentationEditorFrame";
import { PresentationGenerationPreviewFrame } from "./PresentationGenerationPreviewFrame";
import {
  acceptPresentationProposal,
  fetchPresentationProposalSource,
  resolvePresentationProposalAssets,
} from "./presentation-refine-client";
import { useArtifactSuggestions } from "./useArtifactSuggestions";

function PresentationGenerationPlaceholder({ status, title }: { status: string; title: string }) {
  return (
    <div
      aria-live="polite"
      className="min-h-[520px]"
      data-testid="presentation-generation-placeholder"
      role="status"
    >
      <span className="sr-only">
        {title}. {status}
      </span>
      <div className="inline-flex items-center gap-2 rounded-full border border-[var(--studio-border)] bg-[var(--studio-surface-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--studio-accent-text)]">
        <RefreshCw className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
        {status}
      </div>
      <div
        aria-hidden
        className="mt-8 grid min-h-[430px] grid-cols-[150px_minmax(0,1fr)] overflow-hidden rounded-2xl border border-[var(--studio-border)] bg-[var(--workspace-surface-muted)]"
      >
        <div className="space-y-3 border-r border-[var(--studio-border)] p-4">
          {[0, 1, 2, 3].map((slide) => (
            <div className="flex items-start gap-2" key={slide}>
              <span className="w-3 pt-1 text-[9px] text-[var(--workspace-text-muted)]">
                {slide + 1}
              </span>
              <div
                className={`aspect-video min-w-0 flex-1 animate-pulse rounded-md border bg-[var(--workspace-surface)] motion-reduce:animate-none ${
                  slide === 0
                    ? "border-[var(--studio-border-strong)]"
                    : "border-[var(--studio-border)]"
                }`}
              />
            </div>
          ))}
        </div>
        <div className="flex min-w-0 items-center justify-center p-8">
          <div className="aspect-video w-full max-w-[620px] animate-pulse overflow-hidden rounded-xl border border-[var(--studio-border)] bg-[var(--workspace-surface)] p-[8%] shadow-sm motion-reduce:animate-none">
            <div className="h-5 w-[58%] rounded-md bg-[var(--studio-surface)]" />
            <div className="mt-3 h-3 w-[34%] rounded-full bg-[var(--workspace-surface-muted)]" />
            <div className="mt-[12%] grid grid-cols-2 gap-5">
              <div className="aspect-[4/3] rounded-xl bg-[var(--workspace-surface-muted)]" />
              <div className="space-y-3 pt-2">
                <div className="h-3 w-full rounded-full bg-[var(--workspace-surface-muted)]" />
                <div className="h-3 w-[88%] rounded-full bg-[var(--workspace-surface-muted)]" />
                <div className="h-3 w-[72%] rounded-full bg-[var(--workspace-surface-muted)]" />
                <div className="mt-6 h-8 w-24 rounded-lg bg-[var(--studio-surface)]" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type PresentationProposalSource = {
  pageMap: Record<string, string>;
  pptdContent: string;
};

function PresentationProposalReview({
  artifact,
  conversationId,
  error,
  loading,
  onAccept,
  onReject,
  proposal,
  readOnly,
  source,
  unavailableLabel,
  workspaceId,
}: {
  artifact: NonNullable<PresentationDetail["artifact"]>;
  conversationId: string;
  error: boolean;
  loading: boolean;
  onAccept: () => void;
  onReject: () => void;
  proposal: PresentationEditProposal;
  readOnly: boolean;
  source: PresentationProposalSource | null;
  unavailableLabel: string;
  workspaceId: string;
}) {
  const t = useTranslations("Workbench");
  const [mode, setMode] = useState<"candidate" | "original">("candidate");
  const preview = source
    ? {
        pageMap: source.pageMap,
        pptdContent: source.pptdContent,
        totalPages: Object.keys(source.pageMap).length,
      }
    : null;
  const resolveAssets = useCallback(
    async (paths: string[]) => {
      const assets = await resolvePresentationProposalAssets({
        artifactId: artifact.id,
        conversationId,
        expectedRevisionId: proposal.baseRevisionId,
        paths,
        runId: proposal.runId,
        workspaceId,
      });
      return assets.map((asset) => asset ?? undefined);
    },
    [artifact.id, conversationId, proposal.baseRevisionId, proposal.runId, workspaceId],
  );

  return (
    <div className="relative h-full min-h-0" data-testid="presentation-proposal-review">
      <div className="absolute inset-0">
        {loading ? (
          <div
            className="grid h-full place-items-center bg-[var(--workspace-surface-muted)]"
            role="status"
          >
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--studio-border-strong)] border-t-[var(--studio-emphasis)] motion-reduce:animate-none" />
          </div>
        ) : error || !preview ? (
          <div
            className="grid h-full place-items-center bg-[var(--workspace-surface-muted)]"
            role="alert"
          >
            <span className="text-sm text-[var(--workspace-text-muted)]">{unavailableLabel}</span>
          </div>
        ) : mode === "candidate" ? (
          <PresentationGenerationPreviewFrame
            artifactId={artifact.id}
            attemptId={proposal.runId}
            checking
            conversationId={conversationId}
            generationSequence={0}
            preview={preview}
            resolveAssets={resolveAssets}
            unavailableLabel={unavailableLabel}
            workspaceId={workspaceId}
          />
        ) : (
          <PresentationEditorFrame
            artifactId={artifact.id}
            conversationId={conversationId}
            onClose={() => {}}
            onDetailUpdated={() => {}}
            readOnly
            revisionId={artifact.currentRevision.id}
            surface="stream-preview"
            workspaceId={workspaceId}
          />
        )}
      </div>
      <div className="pointer-events-none absolute inset-x-4 bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--studio-border)] bg-[var(--workspace-surface)]/95 p-3 shadow-lg backdrop-blur">
        <div className="pointer-events-auto min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--workspace-text)]">
            {proposal.title}
          </p>
          <p className="mt-1 text-xs text-[var(--workspace-text-muted)]">{proposal.summary}</p>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${mode === "original" ? "bg-[var(--studio-surface-subtle)] text-[var(--studio-accent-text)]" : "text-[var(--workspace-text-muted)]"}`}
            onClick={() => setMode("original")}
            type="button"
          >
            {t("presentationRefineOriginal")}
          </button>
          <button
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${mode === "candidate" ? "bg-[var(--studio-surface-subtle)] text-[var(--studio-accent-text)]" : "text-[var(--workspace-text-muted)]"}`}
            onClick={() => setMode("candidate")}
            type="button"
          >
            {t("presentationRefineCandidate")}
          </button>
          {!readOnly ? (
            <>
              <button
                className="rounded-lg border border-[var(--studio-border)] px-3 py-1.5 text-xs font-semibold text-[var(--workspace-text-muted)] hover:bg-[var(--studio-surface-subtle)]"
                onClick={onReject}
                type="button"
              >
                {t("presentationRefineReject")}
              </button>
              <button
                className="rounded-lg bg-[var(--studio-emphasis)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                onClick={onAccept}
                type="button"
              >
                {t("presentationRefineAccept")}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function PresentationWorkspaceView({
  conversationId,
  detail,
  onBack,
  onDetailUpdated,
  onProposalDismiss,
  onSuggestion,
  phase,
  proposal,
  readOnly = false,
  onSelectionChange,
  workspaceId,
}: {
  conversationId: string;
  detail: PresentationDetail | null;
  onBack: () => void;
  onDetailUpdated: (detail: PresentationDetail) => void;
  onProposalDismiss?: () => void;
  onSuggestion: (prompt: string) => void;
  phase: ArtifactWorkspacePhase;
  proposal?: PresentationEditProposal | null;
  readOnly?: boolean;
  onSelectionChange?: (selection: PresentationFocus | null) => void;
  workspaceId: string;
}) {
  const t = useTranslations("Workbench");
  const locale = useLocale() === "en-US" ? "en-US" : "zh-CN";
  const [retrying, setRetrying] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);
  const [proposalSource, setProposalSource] = useState<PresentationProposalSource | null>(null);
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalError, setProposalError] = useState(false);
  const [proposalSaving, setProposalSaving] = useState(false);
  const artifact = detail?.artifact ?? null;
  const content = artifact?.currentRevision.content ?? null;
  const activeProposal =
    !readOnly &&
    proposal &&
    artifact &&
    proposal.artifactId === artifact.id &&
    proposal.baseRevisionId === artifact.currentRevision.id
      ? proposal
      : null;

  useEffect(() => {
    if (!activeProposal || !artifact) {
      setProposalSource(null);
      setProposalLoading(false);
      setProposalError(false);
      return;
    }
    let cancelled = false;
    setProposalLoading(true);
    setProposalError(false);
    void fetchPresentationProposalSource({
      artifactId: artifact.id,
      conversationId,
      expectedRevisionId: activeProposal.baseRevisionId,
      runId: activeProposal.runId,
      workspaceId,
    })
      .then((source) => {
        if (!cancelled) setProposalSource(source);
      })
      .catch(() => {
        if (!cancelled) setProposalError(true);
      })
      .finally(() => {
        if (!cancelled) setProposalLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeProposal, artifact, conversationId, workspaceId]);
  const suggestions = useArtifactSuggestions({
    enabled: phase === "idle" && !detail,
    fetchSuggestions: (afterGeneration, waitOnly) =>
      fetchArtifactSuggestions(workspaceId, locale, "presentation", afterGeneration, waitOnly),
    queryKey: artifactSuggestionQueryKeys.suggestions(
      workspaceId,
      conversationId,
      locale,
      "presentation",
    ),
    regenerateSuggestions: (afterGeneration) =>
      regenerateArtifactSuggestions(workspaceId, locale, "presentation", afterGeneration),
  });
  const stage =
    detail?.generationDraft?.phase ??
    (detail?.generationState === "finalizing" ? "publishing" : "queued");
  const stageLabel = {
    authoring: t("presentationStageAuthoring"),
    cancelled: t("presentationStageQueued"),
    failed: t("presentationStageQueued"),
    provisioning: t("presentationStageProvisioning"),
    publishing: t("presentationStagePublishing"),
    queued: t("presentationStageQueued"),
    succeeded: t("presentationStagePublishing"),
  }[stage];
  const previewPhase = presentationPreviewPhase(detail);
  const livePreview = detail?.generationDraft?.preview;
  const hasLivePreview =
    Boolean(livePreview) && previewPhase !== "waiting" && previewPhase !== "ready";
  const hasEmbeddedPreview =
    hasLivePreview || Boolean(artifact && content) || Boolean(activeProposal);
  const visibleStageLabel =
    previewPhase === "checking"
      ? t("presentationStageChecking")
      : previewPhase === "ready" && content
        ? t("presentationReadySubtitle", { slides: content.pageCount })
        : stageLabel;

  const retry = async () => {
    if (!detail) return;
    setRetrying(true);
    setRetryFailed(false);
    try {
      const response = await fetch(`/api/artifacts/presentation/${detail.id}/retry`, {
        body: JSON.stringify({ conversationId, workspaceId }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!response.ok) throw new Error("presentation_retry_failed");
      const payload: unknown = await response.json();
      const retried = presentationDetailSchema.parse(
        payload && typeof payload === "object" ? Reflect.get(payload, "detail") : null,
      );
      onDetailUpdated(retried);
    } catch {
      setRetryFailed(true);
    } finally {
      setRetrying(false);
    }
  };

  const acceptProposal = async () => {
    if (!activeProposal || !artifact || proposalSaving) return;
    setProposalSaving(true);
    try {
      await acceptPresentationProposal({
        artifactId: artifact.id,
        conversationId,
        expectedRevisionId: artifact.currentRevision.id,
        proposal: activeProposal,
        workspaceId,
      });
      const refreshed = await fetchArtifactDetail({
        artifactId: artifact.id,
        conversationId,
        workspaceId,
      });
      if (refreshed.kind !== "presentation") throw new Error("presentation_detail_invalid");
      onDetailUpdated(refreshed);
      onProposalDismiss?.();
    } catch {
      setProposalError(true);
    } finally {
      setProposalSaving(false);
    }
  };

  return (
    <ArtifactWorkspaceShell
      actions={
        artifact && content ? (
          <Link
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-[var(--studio-emphasis)] px-3 text-xs font-semibold text-white transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
            href={presentationEditorHref({ artifactId: artifact.id, conversationId, workspaceId })}
          >
            <Maximize2 className="h-3.5 w-3.5" />
            {readOnly ? t("presentationFullscreenView") : t("presentationFullscreenEdit")}
          </Link>
        ) : null
      }
      backLabel={t("presentationBack")}
      {...(hasEmbeddedPreview ? { contentClassName: "h-full p-0" } : {})}
      groundingSources={artifact?.groundingSources ?? []}
      liveScrollTestId="presentation-live-scroll"
      onBack={onBack}
      phase={phase}
      {...(hasEmbeddedPreview ? { scrollClassName: "overflow-hidden" } : {})}
      subtitle={visibleStageLabel}
      testId="presentation-workspace"
      title={content?.title ?? detail?.title ?? t("presentationTitle")}
    >
      {activeProposal && artifact ? (
        <PresentationProposalReview
          artifact={artifact}
          conversationId={conversationId}
          error={proposalError}
          loading={proposalLoading || proposalSaving}
          onAccept={() => void acceptProposal()}
          onReject={() => onProposalDismiss?.()}
          proposal={activeProposal}
          readOnly={readOnly}
          source={proposalSource}
          unavailableLabel={t("presentationPreviewUnavailable")}
          workspaceId={workspaceId}
        />
      ) : previewPhase === "ready" && artifact && content ? (
        <PresentationEditorFrame
          artifactId={artifact.id}
          conversationId={conversationId}
          onClose={onBack}
          onDetailUpdated={onDetailUpdated}
          onSlideSelectionChange={(slideIndexes) => {
            onSelectionChange?.(
              slideIndexes.length > 0
                ? {
                    kind: "presentation_slides",
                    revisionId: artifact.currentRevision.id,
                    slideIndexes,
                  }
                : null,
            );
          }}
          readOnly
          revisionId={artifact.currentRevision.id}
          surface="stream-preview"
          workspaceId={workspaceId}
        />
      ) : !detail && phase === "idle" ? (
        <ArtifactStartView
          description={t("presentationStartDescription")}
          error={suggestions.error}
          errorLabel={t("suggestionsUnavailable")}
          Icon={MonitorPlay}
          loading={suggestions.loading}
          loadingLabel={t("preparingSuggestions")}
          onRefresh={suggestions.refresh}
          onRetry={() => void suggestions.retry()}
          onSuggestion={onSuggestion}
          refreshing={suggestions.refreshing}
          refreshLabel={t("retrySuggestions")}
          suggestions={suggestions.suggestions}
          title={t("presentationStartTitle")}
        />
      ) : hasLivePreview && detail?.generationAttemptId && livePreview ? (
        <div className="relative h-full min-h-0">
          <PresentationGenerationPreviewFrame
            artifactId={detail.id}
            attemptId={detail.generationAttemptId}
            checking={previewPhase === "checking"}
            conversationId={conversationId}
            generationSequence={detail.generationSequence}
            preview={livePreview}
            unavailableLabel={t("presentationPreviewUnavailable")}
            workspaceId={workspaceId}
          />
          <div className="pointer-events-none absolute left-4 top-4 z-10">
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--studio-border)] bg-[var(--workspace-surface)]/95 px-3 py-1.5 text-xs font-medium text-[var(--studio-accent-text)] shadow-sm backdrop-blur">
              {previewPhase !== "failed" ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
              ) : null}
              {previewPhase === "failed"
                ? t("presentationGenerationFailedDescription")
                : visibleStageLabel}
            </span>
          </div>
          {previewPhase === "failed" ? (
            <div className="absolute inset-x-4 bottom-4 z-10 flex items-center justify-between gap-4 rounded-xl border border-[var(--studio-border)] bg-[var(--workspace-surface)]/95 p-4 text-sm text-[var(--workspace-text-muted)] shadow-lg backdrop-blur">
              <p>{t("presentationGenerationFailedDescription")}</p>
              <button
                className="pointer-events-auto shrink-0 rounded-lg bg-[var(--studio-emphasis)] px-4 py-2 text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-60"
                disabled={retrying}
                onClick={() => void retry()}
                type="button"
              >
                {retrying ? t("presentationRetrying") : t("presentationRetry")}
              </button>
              {retryFailed ? (
                <span className="sr-only">{t("presentationPreviewUnavailable")}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : phase === "failed" ? (
        <div
          className="mx-auto flex min-h-[420px] max-w-3xl flex-col items-center justify-center gap-4 text-center text-sm text-[var(--workspace-text-muted)]"
          role="alert"
        >
          <p>{t("presentationGenerationFailedDescription")}</p>
          {detail ? (
            <button
              className="rounded-lg bg-[var(--studio-emphasis)] px-4 py-2 text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-60"
              disabled={retrying}
              onClick={() => void retry()}
              type="button"
            >
              {retrying ? t("presentationRetrying") : t("presentationRetry")}
            </button>
          ) : null}
          {retryFailed ? <p>{t("presentationGenerationFailedDescription")}</p> : null}
        </div>
      ) : (
        <ArtifactGenerationView
          emptyPreview={
            <PresentationGenerationPlaceholder
              status={stageLabel}
              title={detail?.title ?? t("presentationTitle")}
            />
          }
          failedMessage={t("presentationGenerationFailedDescription")}
          hasRenderableContent={false}
          phase={phase}
          status={stageLabel}
          testId="presentation-generation-placeholder"
        >
          {null}
        </ArtifactGenerationView>
      )}
    </ArtifactWorkspaceShell>
  );
}
