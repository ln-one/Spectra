import {
  ArrowUpRight,
  Check,
  ChevronDown,
  FolderMinus,
  Network,
  PanelRightOpen,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { sourceIconStyle } from "@/features/sources/ui/SourcePresentationIcon";
import { useKnowledgeNetworkHost } from "./KnowledgeNetworkHostContext";
import { PanelShell } from "./PanelShell";
import { useSourcePanelLayout } from "./SourcePanelLayoutContext";
import type { SourceItemViewModel, SourcesPanelViewProps } from "./types";

function SourceGlyph({ source }: { source: SourceItemViewModel }) {
  const { Icon } = source;
  const artifact = source.kind === "artifact";
  return (
    <span
      className={`flex h-8 w-8 items-center justify-center rounded-lg border ${
        artifact
          ? "workspace-artifact-source-icon"
          : source.kind === "workspace" && source.iconTone === "workspace"
            ? "workspace-source-file-icon workspace-reference-source-icon"
            : "workspace-source-file-icon"
      }`}
      data-studio-tone={source.kind === "artifact" ? source.artifactTone : undefined}
      style={source.kind === "artifact" ? undefined : sourceIconStyle(source.iconTone)}
    >
      <Icon className="h-[19px] w-[19px]" strokeWidth={2.2} />
    </span>
  );
}

function sourceStatusClass(source: SourceItemViewModel) {
  if (source.statusTone === "success") return "bg-emerald-500";
  if (source.statusTone === "error") return "bg-red-500";
  if (source.statusTone === "active") {
    return "animate-pulse bg-[var(--app-info)] motion-reduce:animate-none";
  }
  return "bg-amber-400";
}

export function SourcesPanelView({
  title,
  summary,
  permissionNotice,
  sources,
  importControl,
  deletingSourceId,
  processingSourceId,
  uploadError,
  onRequestDelete,
  onRequestOpen,
  onRequestPrefetch,
  onRequestProcess,
  onRequestRetryUpload,
  onDismissUploadError,
  processError,
}: SourcesPanelViewProps) {
  const t = useTranslations("Workbench");
  const panelLayout = useSourcePanelLayout();
  const knowledgeNetworkHost = useKnowledgeNetworkHost();
  const sourceElementsRef = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    if (panelLayout?.collapsed || !panelLayout?.focusRequest) return;
    const sourceElement = sourceElementsRef.current.get(panelLayout.focusRequest.id);
    if (!sourceElement) return;
    sourceElement.focus({ preventScroll: true });
    sourceElement.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "nearest",
    });
  }, [panelLayout?.collapsed, panelLayout?.focusRequest]);

  const fallbackImportControl = (
    <button
      type="button"
      aria-label={t("import")}
      disabled
      title={t("importSourcesUnavailable")}
      className="workspace-sources-import-action flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-[var(--workspace-text-muted)] transition-[color,background-color,box-shadow,transform] hover:bg-[var(--workspace-surface-muted)] hover:text-[var(--workspace-text-primary)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)] disabled:opacity-45"
    >
      <Upload className="h-3.5 w-3.5 shrink-0" />
      <span className="workspace-sources-import-label">{t("import")}</span>
      <ChevronDown className="workspace-sources-import-chevron h-3 w-3" />
    </button>
  );
  const resolvedImportControl = importControl ?? fallbackImportControl;
  const knowledgeNetworkControl = knowledgeNetworkHost ? (
    <button
      type="button"
      aria-label={knowledgeNetworkHost.label}
      aria-pressed={knowledgeNetworkHost.active}
      title={knowledgeNetworkHost.label}
      onClick={knowledgeNetworkHost.open}
      className="workspace-sources-import-action flex h-8 w-8 items-center justify-center rounded-full px-0 text-[var(--workspace-text-muted)] transition-[color,background-color,transform] hover:bg-[var(--workspace-surface-muted)] hover:text-[var(--workspace-text-primary)] aria-pressed:bg-[var(--workspace-surface-muted)] aria-pressed:text-[var(--workspace-text-primary)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
    >
      <Network className="h-4 w-4 shrink-0" strokeWidth={2.2} />
    </button>
  ) : null;
  const resolvedHeaderControls = (
    <div className="flex items-center gap-1.5">
      {knowledgeNetworkControl}
      {resolvedImportControl}
    </div>
  );

  if (panelLayout?.collapsed) {
    return (
      <PanelShell testId="sources-panel" overflowVisible>
        <nav
          aria-label={title}
          className="flex h-full w-full flex-col items-center overflow-visible px-2 py-2"
          data-testid="sources-rail"
        >
          <button
            type="button"
            aria-label={t("expandSources")}
            onClick={panelLayout.expand}
            title={t("expandSources")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--workspace-text-muted)] transition-colors hover:bg-[var(--workspace-surface-muted)] hover:text-[var(--workspace-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
          >
            <PanelRightOpen className="h-5 w-5" strokeWidth={2.1} />
          </button>
          <div className="my-2 h-px w-7 shrink-0 bg-[var(--workspace-border)]" />
          <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto overflow-x-visible py-1">
            {sources.map((source) => (
              <button
                type="button"
                aria-label={t("showSource", { name: source.name })}
                data-source-kind={source.kind}
                key={source.id}
                onClick={() => panelLayout.showSource(source.id)}
                title={`${source.name} · ${source.status}`}
                className="workspace-source-rail-button group relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl outline-none transition-[background-color,box-shadow,transform] hover:-translate-y-px hover:bg-[var(--workspace-surface-muted)] hover:shadow-sm"
              >
                <SourceGlyph source={source} />
                <span
                  aria-hidden="true"
                  className={`absolute right-0.5 top-0.5 h-2 w-2 rounded-full border-2 border-[var(--workspace-surface)] ${sourceStatusClass(source)}`}
                />
              </button>
            ))}
          </div>
          <div className="my-2 h-px w-7 shrink-0 bg-[var(--workspace-border)]" />
          <div className="workspace-sources-rail-import flex h-auto min-h-10 shrink-0 flex-col items-center justify-center gap-1">
            {knowledgeNetworkControl}
            {resolvedImportControl}
          </div>
        </nav>
      </PanelShell>
    );
  }

  return (
    <PanelShell testId="sources-panel">
      <div className="workspace-sources-container h-full">
        <div className="workspace-sources-header flex h-[52px] items-center justify-between px-4">
          <div className="workspace-sources-heading min-w-0 flex-1 flex-col justify-center">
            <h2 className="truncate text-lg font-bold leading-tight tracking-tight">
              <span className="truncate whitespace-nowrap">{title}</span>
            </h2>
            <div className="mt-0.5 truncate text-xs font-medium leading-tight text-[var(--workspace-text-muted)]">
              {summary}
            </div>
          </div>
          <div className="workspace-sources-header-actions ml-2 flex shrink-0 items-center gap-1.5 text-[var(--workspace-text-muted)]">
            {resolvedHeaderControls}
          </div>
        </div>
        <div className="workspace-sources-body h-[calc(100%-52px)] overflow-y-auto px-2 pb-3 pt-2">
          {permissionNotice ? (
            <p className="workspace-sources-copy mb-2 px-1 text-[11px] leading-4 text-[var(--workspace-text-muted)]">
              {permissionNotice}
            </p>
          ) : null}
          {uploadError ? (
            <div
              role="alert"
              className="workspace-sources-copy mb-2 flex items-start gap-2 rounded-lg border border-[var(--app-danger)]/25 bg-[var(--app-danger-bg)] px-2.5 py-2 text-[11px] leading-4 text-[var(--app-danger)]"
            >
              <span className="min-w-0 flex-1">{uploadError}</span>
              <button
                type="button"
                disabled={!onDismissUploadError}
                aria-label={t("dismissUploadError")}
                onClick={onDismissUploadError}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-[var(--app-danger)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)] disabled:opacity-50"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : null}
          <div className="space-y-2">
            {sources.map((source) => {
              const {
                id,
                name,
                status,
                kind,
                selected,
                canOpen,
                openHref,
                canDelete,
                canProcess,
                canRetryUpload,
                uploadProgress,
              } = source;
              const workspace = kind === "workspace";

              return (
                <div
                  key={id}
                  ref={(element) => {
                    if (element) sourceElementsRef.current.set(id, element);
                    else sourceElementsRef.current.delete(id);
                  }}
                  tabIndex={-1}
                  title={name}
                  data-artifact-membership-id={kind === "artifact" ? source.artifactId : undefined}
                  data-artifact-membership-destination={kind === "artifact" ? "sources" : undefined}
                  data-source-id={id}
                  data-source-kind={kind}
                  className={`workspace-sources-rail-item workspace-sources-rail-layout group relative grid min-h-[52px] w-full grid-cols-[32px_1fr_auto] items-center gap-2.5 overflow-visible rounded-xl border bg-[var(--workspace-surface-elevated)] p-2.5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--studio-ring)] ${workspace ? "workspace-reference-source" : ""} ${selected ? "border-[var(--studio-border-strong)] shadow-md ring-1 ring-[var(--studio-ring)]" : workspace ? "" : "border-[var(--workspace-border)] shadow-sm"}`}
                >
                  <div className="col-span-2 grid min-w-0 grid-cols-[32px_1fr] items-center gap-2.5">
                    <SourceGlyph source={source} />
                    <div className="workspace-sources-copy min-w-0">
                      <p className="truncate text-xs font-medium">{name}</p>
                      <p className="mt-0.5 truncate text-[10px] text-[var(--workspace-text-muted)]">
                        {(workspace || kind === "artifact") && source.typeLabel ? (
                          <span className="inline-flex max-w-full items-center gap-1">
                            <span
                              className={`${workspace ? "workspace-reference-type-label" : "workspace-artifact-type-label"} font-semibold`}
                              data-studio-tone={
                                source.kind === "artifact" ? source.artifactTone : undefined
                              }
                            >
                              {source.typeLabel}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="truncate">{status}</span>
                          </span>
                        ) : (
                          status
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="workspace-sources-actions flex items-center gap-1.5 border-l border-[var(--workspace-border)] pl-1.5">
                    {workspace ? null : (
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${source.statusTone === "success" ? "bg-emerald-500" : source.statusTone === "error" ? "bg-red-500" : source.statusTone === "active" ? "animate-pulse bg-[var(--app-info)] motion-reduce:animate-none" : "bg-amber-400"}`}
                      />
                    )}
                    {canRetryUpload ? (
                      <button
                        type="button"
                        disabled={!onRequestRetryUpload}
                        aria-label={t("retryUpload", { name })}
                        onClick={() => onRequestRetryUpload?.(source)}
                        className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--workspace-surface-muted)] text-[var(--workspace-text-muted)] transition-colors hover:text-[var(--workspace-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)] disabled:opacity-60"
                      >
                        <RotateCcw className="h-3 w-3" />
                      </button>
                    ) : null}
                    {canProcess ? (
                      <button
                        type="button"
                        disabled={!onRequestProcess || processingSourceId === id}
                        aria-label={t(
                          processingSourceId === id ? "processingSource" : "processSource",
                          {
                            name,
                          },
                        )}
                        onClick={() => onRequestProcess?.(source)}
                        className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--workspace-surface-muted)] disabled:opacity-60"
                      >
                        <RefreshCw
                          className={`h-3 w-3 text-[var(--workspace-text-muted)] ${processingSourceId === id ? "animate-spin motion-reduce:animate-none" : ""}`}
                        />
                      </button>
                    ) : null}
                    {canOpen ? (
                      openHref ? (
                        <Link
                          href={openHref}
                          aria-label={t("openSource", { name })}
                          onClick={(event) => {
                            if (
                              !onRequestOpen ||
                              source.kind !== "artifact" ||
                              event.button !== 0 ||
                              event.metaKey ||
                              event.ctrlKey ||
                              event.shiftKey ||
                              event.altKey
                            ) {
                              return;
                            }
                            const sourceElement =
                              event.currentTarget.closest<HTMLElement>("[data-source-id]");
                            if (!sourceElement) return;
                            event.preventDefault();
                            onRequestOpen(source, sourceElement);
                          }}
                          onFocus={() => onRequestPrefetch?.(source)}
                          onPointerEnter={() => onRequestPrefetch?.(source)}
                          className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--workspace-surface-muted)] transition-colors hover:text-[var(--workspace-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
                        >
                          <ArrowUpRight className="h-3 w-3 text-[var(--workspace-text-muted)]" />
                        </Link>
                      ) : (
                        <button
                          type="button"
                          disabled
                          aria-label={t("openUnavailable", { name })}
                          className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--workspace-surface-muted)]"
                        >
                          <ArrowUpRight className="h-3 w-3 text-[var(--workspace-text-muted)]" />
                        </button>
                      )
                    ) : null}
                    {canDelete ? (
                      <button
                        type="button"
                        disabled={!onRequestDelete || deletingSourceId === id}
                        aria-label={
                          onRequestDelete
                            ? kind === "workspace"
                              ? t("removeWorkspaceReference", { name })
                              : kind === "artifact"
                                ? t("removeArtifactSource", { name })
                                : t("deleteSource", { name })
                            : t("deleteUnavailable", { name })
                        }
                        onClick={() => onRequestDelete?.(source)}
                        className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--workspace-text-muted)] transition-colors hover:bg-[var(--app-danger-bg)] hover:text-[var(--app-danger)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)] disabled:opacity-60"
                      >
                        {kind === "artifact" ? (
                          <FolderMinus className="h-3 w-3" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </button>
                    ) : null}
                  </div>
                  {uploadProgress !== undefined ? (
                    <div
                      role="progressbar"
                      aria-label={t("uploadProgress", { name, progress: uploadProgress })}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={uploadProgress}
                      className="absolute inset-x-2 bottom-0 h-0.5 overflow-hidden rounded-full bg-[var(--workspace-border)]"
                    >
                      <span
                        className="block h-full rounded-full bg-[var(--studio-emphasis)] transition-[width] duration-200 motion-reduce:transition-none"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  ) : null}
                  {selected ? (
                    <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--studio-emphasis)] text-[var(--studio-on-emphasis)]">
                      <Check className="h-2.5 w-2.5" />
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
          {processError ? (
            <p role="alert" className="mt-2 px-1 text-xs text-[var(--app-danger)]">
              {processError}
            </p>
          ) : null}
        </div>
      </div>
    </PanelShell>
  );
}
