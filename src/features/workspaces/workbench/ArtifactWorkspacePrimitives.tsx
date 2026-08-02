"use client";

import * as Popover from "@radix-ui/react-popover";
import { ArrowLeft, BookOpenText, type LucideIcon, RefreshCw, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { StickToBottom } from "use-stick-to-bottom";
import { WorkspaceSourceIcon } from "@/components/icons/WorkspaceSourceIcon";
import type { ArtifactGroundingSource } from "@/features/artifacts/grounding";
import { SourcePresentationIcon } from "@/features/sources/ui/SourcePresentationIcon";
import { sourcePresentationFromHint } from "@/features/sources/ui/source-file-presentation";
import type { ArtifactWorkspacePhase } from "./artifactWorkbench";
import { PanelShell } from "./PanelShell";

export type ArtifactSuggestion = { prompt: string; title: string };

export function ArtifactWorkspaceShell({
  actions,
  backBusy = false,
  backLabel,
  backDisabled = false,
  children,
  contentClassName,
  groundingSources = [],
  liveScrollTestId,
  onBack,
  phase,
  scrollClassName,
  subtitle,
  testId,
  title,
}: {
  actions?: ReactNode;
  backBusy?: boolean;
  backLabel: string;
  backDisabled?: boolean;
  children: ReactNode;
  contentClassName?: string;
  groundingSources?: readonly ArtifactGroundingSource[];
  liveScrollTestId: string;
  onBack: () => void;
  phase: ArtifactWorkspacePhase;
  scrollClassName?: string;
  subtitle: string;
  testId: string;
  title: string;
}) {
  return (
    <PanelShell className="workspace-artifact-tone-panel" testId={testId}>
      <div className="flex h-full min-h-0 flex-col">
        <header className="workspace-artifact-header flex h-[58px] shrink-0 items-center gap-3 border-b px-4">
          <button
            type="button"
            aria-busy={backBusy}
            disabled={backDisabled || backBusy}
            onClick={onBack}
            aria-label={backLabel}
            className="workspace-artifact-back-button flex h-8 w-8 items-center justify-center rounded-lg border transition-[color,background-color,border-color,box-shadow] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {backBusy ? (
              <RefreshCw className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <ArrowLeft className="h-4 w-4" />
            )}
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold">{title}</h2>
            <p className="text-[11px] text-[var(--workspace-text-muted)]">{subtitle}</p>
          </div>
          <ArtifactSourceReceipt sources={groundingSources} />
          {actions}
        </header>
        <StickToBottom
          key={phase === "idle" || phase === "failed" ? "static" : "artifact-session"}
          data-testid={liveScrollTestId}
          className="workspace-artifact-canvas min-h-0 flex-1"
          initial={phase === "generating" || phase === "finalizing" ? "instant" : false}
          resize="smooth"
        >
          <StickToBottom.Content
            scrollClassName={scrollClassName ?? "overflow-y-auto overscroll-y-contain"}
            className={`min-h-full ${contentClassName ?? "p-6"}`}
          >
            {children}
          </StickToBottom.Content>
        </StickToBottom>
      </div>
    </PanelShell>
  );
}

function ArtifactSourceReceipt({ sources }: { sources: readonly ArtifactGroundingSource[] }) {
  const t = useTranslations("Workbench");
  if (sources.length === 0) return null;
  const singlePresentation =
    sources.length === 1
      ? sourcePresentationFromHint(sources[0]?.sourcePresentation, sources[0]?.sourceName ?? "")
      : null;
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--workspace-border)] bg-[var(--workspace-surface-muted)] px-2.5 text-xs font-medium text-[var(--workspace-text-muted)] outline-none transition-colors hover:border-[var(--workspace-border-strong)] hover:text-[var(--workspace-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)] data-[state=open]:border-[var(--studio-border-strong)] data-[state=open]:text-[var(--studio-accent-text)]"
          aria-label={t("artifactSourcesOpen", { count: sources.length })}
        >
          {singlePresentation ? (
            <SourcePresentationIcon
              className="h-5 w-5 rounded-md"
              iconClassName="h-3 w-3"
              presentation={singlePresentation}
            />
          ) : (
            <BookOpenText className="h-3.5 w-3.5" />
          )}
          {t("artifactSourcesTrigger", { count: sources.length })}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          aria-label={t("artifactSourcesTitle")}
          collisionPadding={12}
          data-studio-tone="sky"
          data-workspace-theme="mist-zinc"
          side="bottom"
          sideOffset={8}
          className="z-[120] w-[min(360px,calc(100vw-24px))] rounded-xl border border-[var(--workspace-border-strong)] bg-[var(--workspace-surface-elevated)] p-3.5 text-[var(--workspace-text-primary)] shadow-xl outline-none data-[state=closed]:animate-out data-[state=open]:animate-in focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--studio-surface-subtle)] text-[var(--studio-accent-text)]">
              <BookOpenText className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t("artifactSourcesTitle")}</p>
              <p className="mt-0.5 text-xs leading-5 text-[var(--workspace-text-muted)]">
                {t("artifactSourcesDescription")}
              </p>
            </div>
            <Popover.Close asChild>
              <button
                type="button"
                aria-label={t("artifactSourcesClose")}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--workspace-text-muted)] outline-none hover:bg-[var(--workspace-surface-muted)] hover:text-[var(--workspace-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
              >
                <X className="h-4 w-4" />
              </button>
            </Popover.Close>
          </div>
          <ul className="mt-3.5 max-h-64 space-y-1.5 overflow-y-auto border-t border-[var(--workspace-border)] pt-3">
            {sources.map((source) => (
              <li
                key={source.sourceId}
                className="flex items-center gap-2.5 rounded-lg bg-[var(--workspace-surface-muted)] px-3 py-2"
              >
                <SourcePresentationIcon
                  className="h-7 w-7 rounded-md"
                  iconClassName="h-3.5 w-3.5"
                  presentation={sourcePresentationFromHint(
                    source.sourcePresentation,
                    source.sourceName,
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm" title={source.sourceName}>
                    {source.sourceName}
                  </span>
                  {source.workspaceOrigin?.workspaceRelation === "referenced" ? (
                    <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] font-medium text-teal-700 dark:text-teal-300">
                      <WorkspaceSourceIcon className="h-3 w-3 shrink-0" />
                      {t("knowledgeEvidenceWorkspaceOrigin", {
                        workspace: source.workspaceOrigin.workspaceName,
                      })}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          <Popover.Arrow className="fill-[var(--workspace-surface-elevated)]" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function SuggestionCardSkeleton() {
  return (
    <div
      aria-hidden
      data-testid="suggestion-card-skeleton"
      className="workspace-suggestion-card h-[172px] rounded-2xl border"
    />
  );
}

export function ArtifactStartView({
  description,
  error,
  errorLabel,
  Icon,
  loading,
  loadingLabel,
  onRefresh,
  onRetry,
  onSuggestion,
  refreshing,
  refreshLabel,
  suggestions,
  title,
}: {
  description: string;
  error: boolean;
  errorLabel: string;
  Icon: LucideIcon;
  loading: boolean;
  loadingLabel: string;
  onRefresh: () => void;
  onRetry: () => void;
  onSuggestion: (prompt: string) => void;
  refreshing: boolean;
  refreshLabel: string;
  suggestions: readonly ArtifactSuggestion[] | undefined;
  title: string;
}) {
  if (suggestions && suggestions.length !== 4) {
    throw new Error("Artifact start view requires exactly four suggestions");
  }
  return (
    <div className="mx-auto flex min-h-full max-w-4xl flex-col justify-center py-12">
      <div className="mb-8 flex items-start justify-between gap-6">
        <div className="max-w-2xl">
          <div className="workspace-tool-icon-container mb-3 flex h-10 w-10 items-center justify-center rounded-xl border">
            <Icon className="h-5 w-5" />
          </div>
          <h3 className="text-2xl font-semibold tracking-tight">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--workspace-text-muted)]">{description}</p>
        </div>
        {suggestions ? (
          <button
            type="button"
            disabled={refreshing}
            onClick={onRefresh}
            className="mt-1 flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-xs text-[var(--workspace-text-muted)] transition-colors hover:bg-[var(--workspace-surface)] hover:text-[var(--workspace-text-primary)] disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshing ? "animate-spin motion-reduce:animate-none" : ""}`}
            />
            {refreshing ? loadingLabel : refreshLabel}
          </button>
        ) : loading ? (
          <div
            role="status"
            className="mt-1 flex h-9 shrink-0 items-center gap-2 px-3 text-xs font-medium text-[var(--studio-accent-text)]"
          >
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--studio-emphasis)] motion-reduce:animate-none" />
            {loadingLabel}
          </div>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-4" aria-busy={refreshing || undefined}>
        {refreshing && suggestions ? (
          <span role="status" className="sr-only">
            {loadingLabel}
          </span>
        ) : null}
        {loading ? [0, 1, 2, 3].map((item) => <SuggestionCardSkeleton key={item} />) : null}
        {suggestions?.map((suggestion, index) => (
          <button
            key={`${suggestion.title}:${suggestion.prompt}`}
            type="button"
            disabled={refreshing}
            onClick={() => onSuggestion(suggestion.prompt)}
            className="workspace-suggestion-card group flex h-[172px] flex-col justify-center overflow-hidden rounded-2xl border p-5 text-left transition-[transform,border-color,box-shadow,background-color] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--workspace-surface-muted)] disabled:cursor-wait disabled:hover:translate-y-0"
          >
            <span
              data-testid="suggestion-card-content"
              className={refreshing ? "workspace-suggestion-content-refreshing" : undefined}
            >
              <span className="flex items-start gap-3">
                <span className="workspace-suggestion-index flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-semibold">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="line-clamp-2 pt-0.5 text-sm leading-5 font-semibold text-[var(--workspace-text-primary)]">
                  {suggestion.title}
                </span>
              </span>
              <span className="mt-4 line-clamp-2 block pl-10 text-[13px] leading-[1.4rem] text-[var(--workspace-text-muted)]">
                {suggestion.prompt}
              </span>
            </span>
          </button>
        ))}
      </div>
      {error ? (
        <div
          role="alert"
          className="mt-4 flex items-center justify-between gap-4 rounded-xl bg-[var(--workspace-surface)] px-4 py-3 text-sm text-[var(--workspace-text-muted)]"
        >
          <span>{errorLabel}</span>
          <button
            type="button"
            onClick={onRetry}
            className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 font-medium hover:bg-[var(--studio-surface-subtle)]"
          >
            <RefreshCw className="h-4 w-4" />
            {refreshLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function ArtifactGenerationView({
  children,
  emptyPreview,
  failedMessage,
  fitViewport = false,
  hasRenderableContent,
  phase,
  status,
  testId,
}: {
  children: ReactNode;
  emptyPreview?: ReactNode;
  failedMessage: string;
  fitViewport?: boolean;
  hasRenderableContent: boolean;
  phase: ArtifactWorkspacePhase;
  status: string;
  testId: string;
}) {
  return (
    <article
      className={`mx-auto max-w-[900px] rounded-[18px] border border-[var(--studio-border)] bg-[var(--workspace-surface)] shadow-sm ${
        fitViewport ? "h-full overflow-hidden px-6 py-5 sm:px-8 sm:py-6" : "min-h-full px-12 py-10"
      }`}
    >
      {!hasRenderableContent ? (
        phase === "failed" ? (
          <div
            role="alert"
            aria-live="polite"
            className="flex min-h-[420px] items-center justify-center text-sm text-[var(--workspace-text-muted)]"
          >
            {failedMessage}
          </div>
        ) : emptyPreview ? (
          emptyPreview
        ) : (
          <div
            data-testid={testId}
            role="status"
            aria-live="polite"
            className="relative flex min-h-[520px] items-start overflow-hidden"
          >
            <div
              aria-hidden
              className="absolute inset-x-[12%] top-[18%] h-56 animate-pulse rounded-full bg-[radial-gradient(circle,var(--studio-glow),transparent_70%)] motion-reduce:animate-none"
            />
            <div className="relative inline-flex items-center gap-2 rounded-full border border-[var(--studio-border)] bg-[var(--studio-surface-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--studio-accent-text)]">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--studio-accent)] motion-reduce:animate-none" />
              {status}
            </div>
          </div>
        )
      ) : (
        children
      )}
    </article>
  );
}
