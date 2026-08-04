"use client";

import { ChevronDown, List, Network, PanelRightOpen, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { SourcePresentationIcon } from "@/features/sources/ui/SourcePresentationIcon";
import {
  artifactSourcePresentation,
  sourceFilePresentation,
  workspaceSourcePresentation,
} from "@/features/sources/ui/source-file-presentation";
import { PanelShell } from "@/features/workspaces/workbench/PanelShell";
import { useSourcePanelLayout } from "@/features/workspaces/workbench/SourcePanelLayoutContext";
import { SourcesPanelView } from "@/features/workspaces/workbench/SourcesPanelView";
import type { SourceItemViewModel } from "@/features/workspaces/workbench/types";
import {
  type KnowledgeNetworkGraphCitationFocus,
  type KnowledgeNetworkGraphFocusRequest,
  KnowledgeNetworkGraphView,
} from "./KnowledgeNetworkGraphView";
import type {
  KnowledgeNetworkGraphPlan,
  KnowledgeNetworkLabels,
  KnowledgeNetworkNodeSelectionLabels,
  KnowledgeNetworkSourceListEntry,
  KnowledgeNetworkSourceMode,
  KnowledgeNetworkTrace,
} from "./model";

export function KnowledgeNetworkSourcesPanel({
  labels,
  graphPlan,
  theme,
  selectedId,
  shouldReduceMotion,
  sourceMode,
  sourceEntries,
  trace,
  focusRequest,
  citationFocus,
  onSelect,
  onGraphSelect,
  selectionLabels,
  onSourceModeChange,
}: {
  labels: KnowledgeNetworkLabels;
  graphPlan: KnowledgeNetworkGraphPlan;
  theme: "light" | "dark";
  selectedId: string | null;
  shouldReduceMotion: boolean;
  sourceMode: KnowledgeNetworkSourceMode;
  sourceEntries: KnowledgeNetworkSourceListEntry[];
  trace: KnowledgeNetworkTrace;
  focusRequest: KnowledgeNetworkGraphFocusRequest | null;
  citationFocus: KnowledgeNetworkGraphCitationFocus | null;
  onSelect: (id: string) => void;
  onGraphSelect: (id: string | null) => void;
  selectionLabels: KnowledgeNetworkNodeSelectionLabels;
  onSourceModeChange: (mode: KnowledgeNetworkSourceMode) => void;
}) {
  const t = useTranslations("Workbench");
  const panelLayout = useSourcePanelLayout();

  const toggleControl = (
    <KnowledgeNetworkViewToggle
      labels={labels}
      sourceMode={sourceMode}
      onToggle={() => onSourceModeChange(sourceMode === "list" ? "network" : "list")}
    />
  );

  const sourceItems = useMemo(
    () => sourceEntries.map((entry) => knowledgeNetworkSourceItem(entry, selectedId, labels)),
    [labels, selectedId, sourceEntries],
  );

  if (sourceMode === "list") {
    return (
      <SourcesPanelView
        title={labels.sourceTitle}
        summary={labels.sourceListSummary}
        sources={sourceItems}
        onRequestDelete={() => undefined}
        importControl={
          <KnowledgeNetworkSourcePanelActions
            collapsed={Boolean(panelLayout?.collapsed)}
            labels={labels}
            onSwitchToNetwork={() => onSourceModeChange("network")}
          />
        }
      />
    );
  }

  if (panelLayout?.collapsed) {
    return (
      <PanelShell testId="knowledge-network-sources-panel" overflowVisible>
        <nav
          aria-label={labels.sourceTitle}
          className="flex h-full w-full flex-col items-center overflow-visible px-2 py-2"
        >
          <button
            type="button"
            aria-label={labels.sourceTitle}
            onClick={panelLayout.expand}
            title={labels.sourceTitle}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--workspace-text-muted)] transition-colors hover:bg-[var(--workspace-surface-muted)] hover:text-[var(--workspace-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
          >
            <PanelRightOpen className="h-5 w-5" strokeWidth={2.1} />
          </button>
          <div className="my-2 h-px w-7 shrink-0 bg-[var(--workspace-border)]" />
          <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto overflow-x-visible py-1">
            {sourceEntries.map((entry) => (
              <button
                key={entry.kind === "workspace" ? entry.workspace.id : entry.source.id}
                type="button"
                aria-label={entry.kind === "workspace" ? entry.workspace.name : entry.source.name}
                title={entry.kind === "workspace" ? entry.workspace.name : entry.source.name}
                onClick={() =>
                  onSelect(entry.kind === "workspace" ? entry.workspace.id : entry.source.id)
                }
                className="workspace-source-rail-button group relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl outline-none transition-[background-color,box-shadow,transform] hover:-translate-y-px hover:bg-[var(--workspace-surface-muted)] hover:shadow-sm"
              >
                <KnowledgeNetworkSourceIcon entry={entry} />
              </button>
            ))}
          </div>
          <div className="my-2 h-px w-7 shrink-0 bg-[var(--workspace-border)]" />
          {toggleControl}
        </nav>
      </PanelShell>
    );
  }

  return (
    <PanelShell testId="knowledge-network-sources-panel">
      <div className="workspace-sources-container flex h-full min-h-0 flex-col">
        <div className="workspace-sources-header flex h-[52px] shrink-0 items-center justify-between px-4">
          <div className="workspace-sources-heading min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold leading-tight tracking-tight">
              {labels.sourceTitle}
            </h2>
            <div className="mt-0.5 truncate text-xs font-medium leading-tight text-[var(--workspace-text-muted)]">
              {sourceMode === "network" ? labels.networkSummary : labels.sourceListSummary}
            </div>
          </div>
          <div className="workspace-sources-header-actions ml-2 flex shrink-0 items-center gap-1 text-[var(--workspace-text-muted)]">
            {toggleControl}
            <button
              type="button"
              aria-label={labels.importLabel}
              title={labels.importLabel}
              className="workspace-sources-import-action flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-[var(--workspace-text-muted)] transition-[color,background-color,box-shadow,transform] hover:bg-[var(--workspace-surface-muted)] hover:text-[var(--workspace-text-primary)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
            >
              <Upload className="h-3.5 w-3.5 shrink-0" />
              <span className="workspace-sources-import-label">{labels.importLabel}</span>
              <ChevronDown className="workspace-sources-import-chevron h-3 w-3" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden px-2 pb-2 pt-2">
          <div className="relative flex h-full min-h-0 flex-col rounded-xl border border-[var(--workspace-border)] bg-[var(--workspace-surface-muted)]/45">
            <div className="relative min-h-0 flex-1 overflow-hidden">
              <KnowledgeNetworkGraphView
                trace={trace}
                plan={graphPlan}
                reducedMotion={shouldReduceMotion}
                theme={theme}
                embedded
                focusRequest={focusRequest}
                citationFocus={citationFocus}
                selectedId={selectedId}
                onSelect={onGraphSelect}
                selectionLabels={selectionLabels}
                showSelectionCard={false}
              />
              <div className="pointer-events-none absolute bottom-3 right-3 z-10 text-[10px] font-medium text-[var(--workspace-text-muted)]">
                {t("knowledgeNetworkStats", {
                  workspaceCount: trace.workspaces.length,
                  sourceCount: trace.sources.length,
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PanelShell>
  );
}

function knowledgeNetworkSourceItem(
  entry: KnowledgeNetworkSourceListEntry,
  selectedId: string | null,
  labels: KnowledgeNetworkLabels,
): SourceItemViewModel {
  if (entry.kind === "workspace") {
    const presentation = workspaceSourcePresentation();
    return {
      id: entry.workspace.id,
      name: entry.workspace.name,
      status: labels.workspaceSourceStatus,
      Icon: presentation.Icon,
      iconTone: presentation.iconTone,
      kind: "workspace",
      typeLabel: labels.workspaceSourceType,
      selected: selectedId === entry.workspace.id,
      canOpen: false,
      canDelete: false,
      statusTone: "success",
    };
  }

  if (entry.source.artifactKind) {
    const presentation = artifactSourcePresentation(entry.source.artifactKind);
    return {
      id: entry.source.id,
      name: entry.source.name,
      status: entry.source.detail,
      Icon: presentation.Icon,
      artifactKind: entry.source.artifactKind,
      artifactTone: presentation.tone,
      kind: "artifact",
      selected: selectedId === entry.source.id,
      canOpen: false,
      canDelete: false,
      statusTone: "success",
    };
  }

  const presentation = sourceFilePresentation(entry.source.name);
  return {
    id: entry.source.id,
    name: entry.source.name,
    status: entry.source.detail,
    Icon: presentation.Icon,
    iconTone: presentation.iconTone,
    kind: "file",
    selected: selectedId === entry.source.id,
    canOpen: false,
    canDelete: true,
    statusTone: "success",
  };
}

function KnowledgeNetworkSourcePanelActions({
  collapsed,
  labels,
  onSwitchToNetwork,
}: {
  collapsed: boolean;
  labels: KnowledgeNetworkLabels;
  onSwitchToNetwork: () => void;
}) {
  const importButton = (
    <button
      type="button"
      aria-label={labels.importLabel}
      title={labels.importLabel}
      className="workspace-sources-import-action flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-[var(--workspace-text-muted)] transition-[color,background-color,box-shadow,transform] hover:bg-[var(--workspace-surface-muted)] hover:text-[var(--workspace-text-primary)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
    >
      <Upload className="h-3.5 w-3.5 shrink-0" />
      <span className="workspace-sources-import-label">{labels.importLabel}</span>
      <ChevronDown className="workspace-sources-import-chevron h-3 w-3" />
    </button>
  );

  if (collapsed) return importButton;

  return (
    <>
      <KnowledgeNetworkViewToggle labels={labels} sourceMode="list" onToggle={onSwitchToNetwork} />
      {importButton}
    </>
  );
}

function KnowledgeNetworkViewToggle({
  labels,
  sourceMode,
  onToggle,
}: {
  labels: KnowledgeNetworkLabels;
  sourceMode: KnowledgeNetworkSourceMode;
  onToggle: () => void;
}) {
  const nextLabel = sourceMode === "list" ? labels.switchToNetwork : labels.switchToList;
  return (
    <button
      type="button"
      aria-label={nextLabel}
      aria-pressed={sourceMode === "network"}
      title={nextLabel}
      onClick={onToggle}
      className="workspace-sources-import-action flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--studio-border)] bg-[var(--studio-surface-subtle)] text-[var(--studio-accent-text)] shadow-sm transition-[color,background-color,border-color,box-shadow,transform] hover:border-[var(--studio-border-strong)] hover:bg-[var(--studio-surface)] hover:shadow-md active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)]"
    >
      {sourceMode === "list" ? (
        <Network className="h-4 w-4 shrink-0" strokeWidth={2.2} />
      ) : (
        <List className="h-4 w-4 shrink-0" strokeWidth={2.2} />
      )}
    </button>
  );
}

function KnowledgeNetworkSourceIcon({ entry }: { entry: KnowledgeNetworkSourceListEntry }) {
  const presentation =
    entry.kind === "workspace"
      ? workspaceSourcePresentation()
      : entry.source.artifactKind
        ? artifactSourcePresentation(entry.source.artifactKind)
        : { category: "file" as const, ...sourceFilePresentation(entry.source.name) };
  return (
    <SourcePresentationIcon
      presentation={presentation}
      className="h-8 w-8 rounded-lg"
      iconClassName="h-[19px] w-[19px]"
    />
  );
}
