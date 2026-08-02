import {
  ChevronRight,
  File,
  FolderPlus,
  History,
  PanelLeftOpen,
  RefreshCw,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatArtifactHistoryTimestamp } from "@/features/artifacts/artifact-history";
import {
  type ArtifactHistoryItem,
  artifactEffectiveGenerationState,
  isArtifactSourceKind,
} from "@/features/artifacts/types";
import { ArtifactHistoryDeleteDialog } from "./ArtifactHistoryDeleteDialog";
import { isArtifactCreationToolAvailable, studioToolForArtifactKind } from "./artifactWorkbench";
import { PanelShell } from "./PanelShell";
import { STUDIO_TOOL_PRESENTATIONS, type StudioToolId } from "./studioTools";
import type { StudioPanelViewProps } from "./types";

const RAIL_ARTIFACT_HEIGHT = 36;
const RAIL_ARTIFACT_GAP = 4;

export function artifactRailCapacity(height: number) {
  const contentHeight = Math.max(0, height - RAIL_ARTIFACT_GAP * 2);
  return Math.max(
    0,
    Math.floor((contentHeight + RAIL_ARTIFACT_GAP) / (RAIL_ARTIFACT_HEIGHT + RAIL_ARTIFACT_GAP)),
  );
}

export function StudioPanelView({
  title,
  subtitle,
  tools,
  runtimeUnavailableTools = [],
  artifactHistory,
  artifactHistoryError,
  artifactHref,
  isRefreshingHistory,
  onSelectTool,
  onRefreshHistory,
  onOpenArtifact,
  onDeleteArtifact,
  onAddArtifactSource,
  addingArtifactSourceId = null,
  artifactSourceAddError,
  selectedArtifactId,
  collapsed = false,
  historyFocusRequest = 0,
  onExpand,
  onShowHistory,
  formatArtifactTimestamp,
}: StudioPanelViewProps & {
  artifactHistory: readonly ArtifactHistoryItem[];
  artifactHistoryError: boolean;
  artifactHref: (artifactId: string) => string;
  isRefreshingHistory: boolean;
  onRefreshHistory: () => void | Promise<void>;
  onOpenArtifact?: (artifactId: string) => void;
  onDeleteArtifact: (artifactId: string) => Promise<void>;
  onAddArtifactSource?: (artifactId: string) => Promise<void>;
  addingArtifactSourceId?: string | null;
  artifactSourceAddError?: boolean;
  onSelectTool?: (toolId: StudioToolId) => void;
  selectedArtifactId: string | null;
  collapsed?: boolean;
  historyFocusRequest?: number;
  onExpand?: () => void;
  onShowHistory?: () => void;
  formatArtifactTimestamp?: (value: string) => string;
}) {
  const t = useTranslations("Workbench");
  const locale = useLocale();
  const [artifactToDelete, setArtifactToDelete] = useState<{ id: string; title: string } | null>(
    null,
  );
  const [isRefreshAcknowledged, setIsRefreshAcknowledged] = useState(false);
  const [runtimeUnavailableTool, setRuntimeUnavailableTool] = useState<string | null>(null);
  const historySectionRef = useRef<HTMLDivElement | null>(null);
  const railHistoryRef = useRef<HTMLDivElement | null>(null);
  const [railHistoryCapacity, setRailHistoryCapacity] = useState(0);
  const isRefreshActive = isRefreshingHistory || isRefreshAcknowledged;
  const artifactTimestamp = (value: string) =>
    formatArtifactTimestamp?.(value) ?? formatArtifactHistoryTimestamp(value, locale);

  useLayoutEffect(() => {
    if (!collapsed) return;
    const historyViewport = railHistoryRef.current;
    if (!historyViewport) return;

    const updateCapacity = (height: number) => {
      setRailHistoryCapacity(artifactRailCapacity(height));
    };
    updateCapacity(historyViewport.clientHeight);

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(([entry]) => {
        if (entry) updateCapacity(entry.contentRect.height);
      });
      observer.observe(historyViewport);
      return () => observer.disconnect();
    }

    const handleResize = () => updateCapacity(historyViewport.clientHeight);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [collapsed]);

  useEffect(() => {
    if (collapsed || historyFocusRequest === 0) return;
    const historySection = historySectionRef.current;
    if (!historySection) return;
    historySection.focus({ preventScroll: true });
    historySection.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  }, [collapsed, historyFocusRequest]);

  async function refreshHistory() {
    if (isRefreshActive) return;
    setIsRefreshAcknowledged(true);
    try {
      await Promise.all([
        onRefreshHistory(),
        new Promise<void>((resolve) => window.setTimeout(resolve, 500)),
      ]);
    } finally {
      setIsRefreshAcknowledged(false);
    }
  }

  if (collapsed) {
    const visibleRailArtifacts = artifactHistory.slice(0, railHistoryCapacity);
    const hiddenRailArtifactCount = Math.max(
      0,
      artifactHistory.length - visibleRailArtifacts.length,
    );

    return (
      <PanelShell testId="studio-panel" overflowVisible>
        <nav
          aria-label={title}
          className="flex h-full w-full flex-col items-center overflow-visible px-2 py-2"
          data-testid="studio-rail"
        >
          <button
            type="button"
            aria-label={t("expandStudio")}
            onClick={onExpand}
            title={t("expandStudio")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--workspace-text-muted)] transition-colors hover:bg-[var(--workspace-surface-muted)] hover:text-[var(--workspace-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
          >
            <PanelLeftOpen className="h-5 w-5" strokeWidth={2.1} />
          </button>
          <div className="my-2 h-px w-7 shrink-0 bg-[var(--workspace-border)]" />
          <div className="flex shrink-0 flex-col items-center gap-1 overflow-visible">
            {tools.map((id) => {
              const { Icon, labelKey, tone } = STUDIO_TOOL_PRESENTATIONS[id];
              const localizedLabel = t(labelKey);
              const available = isArtifactCreationToolAvailable(id);
              const runtimeUnavailable = runtimeUnavailableTools.includes(id);
              const titleText = runtimeUnavailable
                ? t("toolRuntimeUnavailable", { name: localizedLabel })
                : available
                  ? localizedLabel
                  : t("toolUnavailable", { name: localizedLabel });
              return (
                <button
                  type="button"
                  aria-label={localizedLabel}
                  data-studio-tone={tone}
                  disabled={!available || runtimeUnavailable}
                  key={id}
                  onClick={() => onSelectTool?.(id)}
                  title={titleText}
                  className="group flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-[background-color,box-shadow,transform] enabled:hover:-translate-y-px enabled:hover:bg-[var(--studio-surface-subtle)] enabled:hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <span className="workspace-tool-icon-container flex h-8 w-8 items-center justify-center rounded-[10px] border">
                    <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
                  </span>
                </button>
              );
            })}
          </div>
          <div className="my-2 h-px w-7 shrink-0 bg-[var(--workspace-border)]" />
          <div
            ref={railHistoryRef}
            className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-hidden py-1"
            data-testid="studio-rail-history"
          >
            {visibleRailArtifacts.map((artifact) => {
              const effectiveGenerationState = artifactEffectiveGenerationState(artifact);
              const historyTool = studioToolForArtifactKind(artifact.kind);
              const historyPresentation = historyTool
                ? STUDIO_TOOL_PRESENTATIONS[historyTool]
                : null;
              const HistoryIcon = historyPresentation?.Icon ?? File;
              const isGenerating =
                effectiveGenerationState === "queued" ||
                effectiveGenerationState === "generating" ||
                effectiveGenerationState === "finalizing";
              const stateLabel =
                effectiveGenerationState === "queued"
                  ? t("artifactQueued")
                  : effectiveGenerationState === "generating"
                    ? t("artifactGenerating")
                    : effectiveGenerationState === "finalizing"
                      ? t("artifactFinalizing")
                      : effectiveGenerationState === "failed"
                        ? t("artifactGenerationFailed")
                        : t("artifactUpdatedOn", {
                            date: artifactTimestamp(artifact.updatedAt),
                          });
              const kindLabel = historyPresentation
                ? t(historyPresentation.labelKey)
                : t("artifactHistoryKind");
              const tooltip = `${artifact.title} · ${kindLabel} · ${stateLabel}`;

              return (
                <Link
                  key={artifact.id}
                  href={artifactHref(artifact.id)}
                  aria-current={selectedArtifactId === artifact.id ? "page" : undefined}
                  aria-label={tooltip}
                  title={tooltip}
                  data-artifact-membership-id={
                    isArtifactSourceKind(artifact.kind) ? artifact.id : undefined
                  }
                  data-artifact-membership-destination={
                    isArtifactSourceKind(artifact.kind) ? "history" : undefined
                  }
                  data-studio-tone={historyPresentation?.tone ?? "neutral"}
                  data-testid="studio-rail-artifact"
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
                    onOpenArtifact(artifact.id);
                  }}
                  className={`group relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] outline-none transition-[background-color,box-shadow,transform] hover:-translate-y-px hover:bg-[var(--studio-surface-subtle)] focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)] ${
                    selectedArtifactId === artifact.id
                      ? "bg-[var(--studio-surface-subtle)] ring-2 ring-[var(--studio-ring)]"
                      : ""
                  }`}
                >
                  <span className="workspace-tool-icon-container flex h-8 w-8 items-center justify-center rounded-[10px] border opacity-[0.85] transition-opacity group-hover:opacity-100">
                    <HistoryIcon className="h-[17px] w-[17px]" strokeWidth={2.1} />
                  </span>
                  {isGenerating ? (
                    <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[var(--workspace-surface)] bg-[var(--workspace-surface-elevated)] text-[var(--studio-accent-text)]">
                      <RefreshCw
                        className="h-2.5 w-2.5 animate-spin motion-reduce:animate-none"
                        strokeWidth={2.4}
                      />
                    </span>
                  ) : effectiveGenerationState === "failed" ? (
                    <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-[var(--workspace-surface)] bg-amber-500" />
                  ) : null}
                </Link>
              );
            })}
          </div>
          <button
            type="button"
            aria-label={t("openHistory")}
            onClick={onShowHistory}
            title={
              hiddenRailArtifactCount > 0
                ? `${t("history")} · +${hiddenRailArtifactCount}`
                : t("history")
            }
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--workspace-text-muted)] transition-colors hover:bg-[var(--workspace-surface-muted)] hover:text-[var(--workspace-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
          >
            <History className="h-5 w-5" strokeWidth={2.1} />
            {hiddenRailArtifactCount > 0 ? (
              <span
                aria-hidden="true"
                className="absolute -right-1 -top-0.5 min-w-4 rounded-full border border-[var(--workspace-surface)] bg-[var(--workspace-surface-elevated)] px-1 text-center text-[8px] font-semibold leading-[14px] text-[var(--workspace-text-muted)] shadow-sm"
              >
                +{hiddenRailArtifactCount > 99 ? "99" : hiddenRailArtifactCount}
              </span>
            ) : null}
          </button>
        </nav>
      </PanelShell>
    );
  }

  return (
    <PanelShell testId="studio-panel">
      <div className="workspace-studio-container h-full">
        <div className="flex h-[52px] items-center justify-between px-4">
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="flex min-w-0 flex-col justify-center">
              <h2 className="text-lg font-bold leading-tight tracking-tight">
                <span className="relative block h-6 overflow-hidden">
                  <span className="absolute inset-0 block truncate whitespace-nowrap">{title}</span>
                </span>
              </h2>
              <div className="text-xs leading-tight text-[var(--workspace-text-muted)]">
                <span className="relative block h-4 overflow-hidden">
                  <span className="absolute inset-0 block truncate whitespace-nowrap">
                    {subtitle}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="h-[calc(100%-52px)] overflow-hidden">
          <div className="h-full overflow-y-auto">
            <div className="workspace-studio-content w-full min-w-[340px] p-3">
              <div className="workspace-studio-tool-grid grid min-w-0 grid-cols-2 gap-3 pb-2">
                {tools.map((id) => {
                  const { Icon, labelKey, tone } = STUDIO_TOOL_PRESENTATIONS[id];
                  const localizedLabel = t(labelKey);
                  const available = isArtifactCreationToolAvailable(id);
                  const runtimeUnavailable = runtimeUnavailableTools.includes(id);
                  return (
                    <button
                      type="button"
                      data-studio-tool-id={id}
                      data-studio-tone={tone}
                      disabled={!available}
                      onClick={() => {
                        if (runtimeUnavailable) {
                          setRuntimeUnavailableTool(localizedLabel);
                          return;
                        }
                        setRuntimeUnavailableTool(null);
                        onSelectTool?.(id);
                      }}
                      title={
                        runtimeUnavailable
                          ? t("toolRuntimeUnavailable", { name: localizedLabel })
                          : available
                            ? localizedLabel
                            : t("toolUnavailable", { name: localizedLabel })
                      }
                      key={id}
                      className="workspace-tool-card group relative isolate flex min-h-[96px] w-full min-w-0 flex-col justify-between overflow-hidden rounded-[16px] border border-[var(--workspace-border)] bg-[var(--workspace-surface)] p-4 pt-4 shadow-sm backdrop-blur-sm transition-[transform,border-color,box-shadow,background-color] enabled:hover:-translate-y-0.5 enabled:hover:border-[var(--studio-border-strong)] enabled:hover:shadow-md disabled:cursor-not-allowed"
                    >
                      <div className="workspace-tool-card-aura pointer-events-none absolute -left-10 -top-10 z-0 h-40 w-40 rounded-full opacity-50" />
                      <span className="workspace-tool-icon-container pointer-events-none relative z-10 flex h-10 w-10 items-center justify-center rounded-xl border">
                        <Icon className="h-6 w-6" strokeWidth={2.25} />
                      </span>
                      <div className="relative z-10 mt-4 flex w-full items-center justify-between gap-2">
                        <span className="truncate text-[14px] font-medium text-[var(--workspace-text-primary)]">
                          {localizedLabel}
                        </span>
                        <ChevronRight
                          className="h-4 w-4 shrink-0 text-[var(--workspace-text-muted)] opacity-40"
                          strokeWidth={2.5}
                        />
                      </div>
                      <div className="workspace-tool-card-wash pointer-events-none absolute inset-0 z-0" />
                    </button>
                  );
                })}
              </div>
              {runtimeUnavailableTool ? (
                <p role="alert" className="pb-2 text-xs text-amber-600 dark:text-amber-400">
                  {t("toolRuntimeUnavailable", { name: runtimeUnavailableTool })}
                </p>
              ) : null}

              <div
                ref={historySectionRef}
                tabIndex={-1}
                className="mt-1 scroll-mt-3 border-t border-[var(--workspace-border)] pt-3 outline-none"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-[var(--workspace-text-muted)]">
                    {t("history")}
                  </span>
                  <button
                    type="button"
                    data-studio-tone="blue"
                    onClick={() => void refreshHistory()}
                    aria-label={t("refreshHistory")}
                    aria-busy={isRefreshActive}
                    disabled={isRefreshActive}
                    className={`flex h-7 w-7 items-center justify-center rounded-lg transition-[color,background-color,box-shadow] disabled:cursor-wait ${
                      isRefreshActive
                        ? "bg-[var(--studio-surface)] text-[var(--studio-accent-text)] shadow-sm ring-1 ring-inset ring-[var(--studio-border)]"
                        : "text-[var(--workspace-text-muted)] hover:bg-[var(--workspace-surface-muted)] hover:text-[var(--workspace-text-primary)]"
                    }`}
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${isRefreshActive ? "animate-spin motion-reduce:animate-none" : ""}`}
                      strokeWidth={2.2}
                    />
                  </button>
                </div>
                {artifactHistoryError ? (
                  <p role="alert" className="mb-2 text-[11px] text-amber-600 dark:text-amber-400">
                    {t("historyLoadFailed")}
                  </p>
                ) : null}
                {artifactSourceAddError ? (
                  <p role="alert" className="mb-2 text-[11px] text-amber-600 dark:text-amber-400">
                    {t("artifactSourceAddFailed")}
                  </p>
                ) : null}
                {artifactHistory.length === 0 && !artifactHistoryError ? (
                  <p className="py-3 text-[11px] leading-5 text-[var(--workspace-text-muted)]">
                    {t("historyEmpty")}
                  </p>
                ) : null}
                <div className="space-y-1.5">
                  {artifactHistory.map(
                    ({ currentRevisionId, generationState, id, kind, title, updatedAt }) => {
                      const effectiveGenerationState = currentRevisionId
                        ? "ready"
                        : generationState;
                      const historyTool = studioToolForArtifactKind(kind);
                      const historyPresentation = historyTool
                        ? STUDIO_TOOL_PRESENTATIONS[historyTool]
                        : null;
                      const HistoryIcon = historyPresentation?.Icon ?? File;
                      const updatedLabel =
                        effectiveGenerationState === "queued"
                          ? t("artifactQueued")
                          : effectiveGenerationState === "generating"
                            ? t("artifactGenerating")
                            : effectiveGenerationState === "finalizing"
                              ? t("artifactFinalizing")
                              : effectiveGenerationState === "failed"
                                ? t("artifactGenerationFailed")
                                : t("artifactUpdatedOn", {
                                    date: artifactTimestamp(updatedAt),
                                  });
                      return (
                        <div
                          key={id}
                          tabIndex={isArtifactSourceKind(kind) ? -1 : undefined}
                          data-artifact-membership-id={isArtifactSourceKind(kind) ? id : undefined}
                          data-artifact-membership-destination={
                            isArtifactSourceKind(kind) ? "history" : undefined
                          }
                          data-studio-tone={historyPresentation?.tone ?? "neutral"}
                          className={`group flex w-full items-center rounded-xl border outline-none transition-[border-color] hover:border-[var(--studio-border-strong)] hover:bg-[var(--studio-surface-subtle)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--studio-ring)] ${
                            selectedArtifactId === id
                              ? "border-[var(--studio-border-strong)] bg-[var(--studio-surface-subtle)]"
                              : "border-[var(--workspace-border)] bg-[var(--workspace-surface-elevated)]"
                          }`}
                        >
                          <Link
                            href={artifactHref(id)}
                            aria-current={selectedArtifactId === id ? "page" : undefined}
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
                              onOpenArtifact(id);
                            }}
                            className="flex min-w-0 flex-1 items-center gap-2 p-2"
                          >
                            <span
                              className={`${isArtifactSourceKind(kind) ? "workspace-artifact-source-icon" : "workspace-tool-icon-container"} flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border`}
                            >
                              {effectiveGenerationState === "queued" ||
                              effectiveGenerationState === "generating" ||
                              effectiveGenerationState === "finalizing" ? (
                                <RefreshCw
                                  className="h-[17px] w-[17px] animate-spin motion-reduce:animate-none"
                                  strokeWidth={2.1}
                                />
                              ) : (
                                <HistoryIcon className="h-[17px] w-[17px]" strokeWidth={2.1} />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[11px] font-medium text-[var(--workspace-text-primary)]">
                                {title}
                              </span>
                              <span className="mt-0.5 block truncate text-[10px] text-[var(--workspace-text-muted)]">
                                {historyPresentation
                                  ? t(historyPresentation.labelKey)
                                  : t("artifactHistoryKind")}{" "}
                                · {updatedLabel}
                              </span>
                            </span>
                          </Link>
                          {isArtifactSourceKind(kind) &&
                          effectiveGenerationState === "ready" &&
                          currentRevisionId &&
                          onAddArtifactSource ? (
                            <button
                              type="button"
                              aria-label={t("addArtifactSource", { title })}
                              disabled={addingArtifactSourceId !== null}
                              onClick={() => void onAddArtifactSource?.(id)}
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--workspace-text-muted)] transition-colors hover:bg-[var(--studio-surface)] hover:text-[var(--studio-accent-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)] disabled:opacity-50"
                            >
                              {addingArtifactSourceId === id ? (
                                <RefreshCw className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                              ) : (
                                <FolderPlus className="h-3.5 w-3.5" />
                              )}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            aria-label={t("deleteArtifact", { title })}
                            onClick={() => setArtifactToDelete({ id, title })}
                            className="mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--workspace-text-muted)] transition-colors hover:bg-[var(--workspace-surface-muted)] hover:text-[var(--app-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      );
                    },
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <ArtifactHistoryDeleteDialog
        artifact={artifactToDelete}
        onDelete={onDeleteArtifact}
        onOpenChange={(open) => {
          if (!open) setArtifactToDelete(null);
        }}
      />
    </PanelShell>
  );
}
