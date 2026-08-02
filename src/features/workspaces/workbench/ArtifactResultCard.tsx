"use client";

import { ArrowUpRight, CheckCircle2, FileX2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
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
  onOpenArtifact?: ((artifactId: string) => void) | undefined;
  unavailableArtifactIds?: ReadonlySet<string> | undefined;
};

export function ArtifactResultCard({
  artifactHistory,
  artifactId,
  conversationId,
  fallbackState,
  fallbackKind,
  fallbackTitle,
  onOpenArtifact,
  unavailableArtifactIds,
}: ArtifactResultCardProps) {
  const t = useTranslations("Workbench");
  const currentArtifact = artifactHistory?.find((item) => item.id === artifactId);
  const currentTitle = currentArtifact?.title ?? fallbackTitle;
  const generationState = currentArtifact
    ? artifactEffectiveGenerationState(currentArtifact)
    : fallbackState;
  const artifactKind = currentArtifact?.kind ?? fallbackKind;
  const { Icon: ArtifactIcon, tone: artifactTone } = artifactPresentation(artifactKind);
  const isUnavailable = unavailableArtifactIds?.has(artifactId) ?? false;
  const href = `?conversation=${encodeURIComponent(conversationId)}&artifact=${encodeURIComponent(artifactId)}`;
  const readyLabels: Record<ArtifactKind, string> = {
    animation: t("animationArtifactReady"),
    game: t("gameArtifactReady"),
    mind_map: t("mindMapArtifactReady"),
    presentation: t("presentationArtifactReady"),
    quiz: t("quizArtifactReady"),
    teaching_document: t("teachingDocumentArtifactReady"),
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
          : generationState === "finalizing"
            ? t("artifactFinalizing")
            : t("artifactGenerating");
  const content = (
    <>
      <span className="workspace-tool-icon-container flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border">
        {isUnavailable || generationState === "failed" ? (
          <FileX2 className="h-5 w-5" strokeWidth={2.1} />
        ) : generationState === "ready" ? (
          <CheckCircle2 className="h-5 w-5" strokeWidth={2.1} />
        ) : (
          <ArtifactIcon className="h-5 w-5 animate-pulse" strokeWidth={2.1} />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--studio-accent-text)]">
          {statusLabel}
        </span>
        <span className="mt-0.5 block truncate text-sm font-semibold text-[var(--workspace-text-primary)]">
          {currentTitle}
        </span>
      </span>
      {isUnavailable ? null : (
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-[var(--studio-accent-text)]">
          {t("openArtifactAction")}
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
