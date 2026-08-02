"use client";

import { Clapperboard, Download, RefreshCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { type AnimationDetail, animationDetailSchema } from "@/features/artifacts/animations/types";
import {
  artifactSuggestionQueryKeys,
  fetchArtifactSuggestions,
  regenerateArtifactSuggestions,
} from "@/features/artifacts/suggestions/queries";
import { AnimationPlayer } from "./AnimationPlayer";
import {
  ArtifactGenerationView,
  ArtifactStartView,
  ArtifactWorkspaceShell,
} from "./ArtifactWorkspacePrimitives";
import type { ArtifactWorkspacePhase } from "./artifactWorkbench";
import { useArtifactSuggestions } from "./useArtifactSuggestions";

function AnimationGenerationPlaceholder({ status, title }: { status: string; title: string }) {
  return (
    <div
      aria-live="polite"
      className="flex h-full min-h-0 flex-col"
      data-testid="animation-generation-placeholder"
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
        className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--studio-border)] bg-[var(--workspace-surface)] shadow-sm"
      >
        <div
          className="relative min-h-0 flex-1 animate-pulse overflow-hidden bg-[var(--workspace-surface-muted)] motion-reduce:animate-none"
          data-testid="animation-preview-placeholder"
        >
          <div className="absolute inset-[12%] rounded-2xl border border-[var(--studio-border)] bg-[var(--workspace-surface-elevated)]" />
          <div className="absolute top-[24%] left-[18%] h-3 w-[38%] rounded-full bg-[var(--studio-surface)]" />
          <div className="absolute top-[32%] left-[18%] h-2.5 w-[24%] rounded-full bg-[var(--workspace-surface-muted)]" />
          <div className="absolute right-[17%] bottom-[20%] h-[38%] w-[34%] rounded-2xl border border-[var(--studio-border-strong)] bg-[var(--studio-surface)]" />
          <div className="absolute bottom-[25%] left-[18%] h-12 w-12 rounded-full border border-[var(--studio-border-strong)] bg-[var(--workspace-surface)]" />
          <div className="absolute bottom-[31%] left-[27%] h-px w-[19%] bg-[var(--workspace-border-strong)]" />
        </div>
        <div
          className="shrink-0 border-t border-[var(--studio-border)] bg-[var(--studio-surface-subtle)] px-4 py-3"
          data-testid="animation-timeline-placeholder"
        >
          <div className="mb-2 flex items-center justify-between">
            <div className="h-2.5 w-24 rounded-full bg-[var(--studio-surface)]" />
            <div className="h-2.5 w-12 rounded-full bg-[var(--workspace-surface-muted)]" />
          </div>
          <div className="relative grid h-10 grid-cols-[1.1fr_1.35fr_0.9fr_1.2fr] gap-1.5">
            {[0, 1, 2, 3].map((scene) => (
              <div
                className="rounded-md border border-[var(--studio-border)] bg-[var(--workspace-surface)]"
                key={scene}
              />
            ))}
            <div className="absolute top-[-5px] bottom-[-5px] left-[27%] w-px bg-[var(--studio-accent-text)]">
              <span className="absolute -top-1 -left-[3px] h-1.5 w-1.5 rotate-45 bg-[var(--studio-accent-text)]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AnimationWorkspaceView({
  conversationId,
  detail,
  onBack,
  onDetailUpdated,
  onSuggestion,
  phase,
  readOnly = false,
  workspaceId,
}: {
  conversationId: string;
  detail: AnimationDetail | null;
  onBack: () => void;
  onDetailUpdated: (detail: AnimationDetail) => void;
  onSuggestion: (prompt: string) => void;
  phase: ArtifactWorkspacePhase;
  readOnly?: boolean;
  workspaceId: string;
}) {
  const t = useTranslations("Workbench");
  const locale = useLocale() === "en-US" ? "en-US" : "zh-CN";
  const [retrying, setRetrying] = useState(false);
  const artifact = detail?.artifact ?? null;
  const content = artifact?.currentRevision.content ?? null;
  const query = artifact
    ? new URLSearchParams({
        conversationId,
        revisionId: artifact.currentRevision.id,
        workspaceId,
      })
    : null;
  const videoUrl =
    artifact && query ? `/api/artifacts/animation/${artifact.id}/video.mp4?${query}` : "";
  const downloadUrl =
    artifact && query && !readOnly
      ? `/api/artifacts/animation/${artifact.id}/download?${query}`
      : "";
  const suggestions = useArtifactSuggestions({
    enabled: phase === "idle" && !detail,
    fetchSuggestions: (afterGeneration, waitOnly) =>
      fetchArtifactSuggestions(workspaceId, locale, "animation", afterGeneration, waitOnly),
    queryKey: artifactSuggestionQueryKeys.suggestions(
      workspaceId,
      conversationId,
      locale,
      "animation",
    ),
    regenerateSuggestions: (afterGeneration) =>
      regenerateArtifactSuggestions(workspaceId, locale, "animation", afterGeneration),
  });
  const stage =
    detail?.generationDraft?.phase ??
    (detail?.generationState === "finalizing" ? "publishing" : "queued");
  const stageLabel = {
    authoring: t("animationStageAuthoring"),
    cancelled: t("animationStageQueued"),
    failed: t("animationStageQueued"),
    provisioning: t("animationStageProvisioning"),
    publishing: t("animationStagePublishing"),
    queued: t("animationStageQueued"),
    rendering: t("animationStageRendering"),
    succeeded: t("animationStagePublishing"),
  }[stage];
  const fitGenerationToViewport = !content && (phase === "generating" || phase === "finalizing");
  const fitReadyToViewport = Boolean(content);

  return (
    <ArtifactWorkspaceShell
      actions={
        downloadUrl ? (
          <a
            className="flex h-8 items-center gap-1.5 rounded-lg bg-[var(--studio-emphasis)] px-3 text-xs font-semibold text-white"
            href={downloadUrl}
          >
            <Download className="h-3.5 w-3.5" />
            {t("animationDownload")}
          </a>
        ) : undefined
      }
      backLabel={t("animationBack")}
      groundingSources={artifact?.groundingSources ?? []}
      liveScrollTestId="animation-live-scroll"
      onBack={onBack}
      phase={phase}
      {...(fitGenerationToViewport || fitReadyToViewport
        ? { contentClassName: "h-full p-4 sm:p-6", scrollClassName: "overflow-hidden" }
        : {})}
      subtitle={
        content
          ? t("animationReadySubtitle", {
              seconds: Math.round(content.durationInFrames / content.fps),
            })
          : stageLabel
      }
      testId="animation-workspace"
      title={content?.title ?? detail?.title ?? t("animationTitle")}
    >
      {!detail && phase === "idle" ? (
        <ArtifactStartView
          description={t("animationStartDescription")}
          error={suggestions.error}
          errorLabel={t("suggestionsUnavailable")}
          Icon={Clapperboard}
          loading={suggestions.loading}
          loadingLabel={t("preparingSuggestions")}
          onRefresh={suggestions.refresh}
          onRetry={() => void suggestions.retry()}
          onSuggestion={onSuggestion}
          refreshing={suggestions.refreshing}
          refreshLabel={t("retrySuggestions")}
          suggestions={suggestions.suggestions}
          title={t("animationStartTitle")}
        />
      ) : content ? (
        <AnimationPlayer
          height={content.height}
          src={videoUrl}
          title={content.title}
          width={content.width}
        />
      ) : phase === "failed" ? (
        <div className="flex min-h-[420px] flex-col items-center justify-center gap-4 text-center">
          <p className="text-sm text-[var(--workspace-text-muted)]">
            {t("animationGenerationFailedDescription")}
          </p>
          {detail ? (
            <button
              className="rounded-lg bg-[var(--studio-emphasis)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
              disabled={retrying}
              onClick={async () => {
                setRetrying(true);
                try {
                  const response = await fetch(`/api/artifacts/animation/${detail.id}/retry`, {
                    body: JSON.stringify({ conversationId, workspaceId }),
                    headers: { "content-type": "application/json" },
                    method: "POST",
                  });
                  if (!response.ok) throw new Error("animation_retry_failed");
                  const payload: unknown = await response.json();
                  onDetailUpdated(
                    animationDetailSchema.parse(
                      payload && typeof payload === "object"
                        ? Reflect.get(payload, "detail")
                        : null,
                    ),
                  );
                } finally {
                  setRetrying(false);
                }
              }}
              type="button"
            >
              {retrying ? t("animationRetrying") : t("animationRetry")}
            </button>
          ) : null}
        </div>
      ) : (
        <ArtifactGenerationView
          emptyPreview={
            <AnimationGenerationPlaceholder
              status={stageLabel}
              title={detail?.title ?? t("animationTitle")}
            />
          }
          failedMessage={t("animationGenerationFailedDescription")}
          fitViewport
          hasRenderableContent={false}
          phase={phase}
          status={stageLabel}
          testId="animation-generation-placeholder"
        >
          {null}
        </ArtifactGenerationView>
      )}
    </ArtifactWorkspaceShell>
  );
}
