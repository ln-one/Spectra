"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";
import * as Dialog from "@radix-ui/react-dialog";
import { ReactFlowProvider } from "@xyflow/react";
import {
  ChevronDown,
  ListTree,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Scan,
  Undo2,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { MindMapContent, MindMapDraftSnapshot } from "@/features/artifacts/mind-maps/contract";
import { collapseMindMapToFirstLevel } from "@/features/artifacts/mind-maps/layout";
import type { MindMapFocus } from "@/features/artifacts/mind-maps/refine";
import type { MindMapArtifact } from "@/features/artifacts/mind-maps/types";
import type { MindMapEditProposal } from "@/features/artifacts/proposal-contract";
import {
  artifactSuggestionQueryKeys,
  fetchArtifactSuggestions,
  regenerateArtifactSuggestions,
} from "@/features/artifacts/suggestions/queries";
import {
  ArtifactGenerationView,
  ArtifactStartView,
  ArtifactWorkspaceShell,
} from "./ArtifactWorkspacePrimitives";
import type { ArtifactWorkspacePhase } from "./artifactWorkbench";
import { MindMapCanvas, MindMapOutline } from "./MindMapRendering";
import { useArtifactSuggestions } from "./useArtifactSuggestions";
import { type MindMapNodeAction, useMindMapWorkspaceSession } from "./useMindMapWorkspaceSession";

function MindMapGenerationPlaceholder({ status, title }: { status: string; title: string }) {
  return (
    <div
      data-testid="mind-map-generation-placeholder"
      role="status"
      aria-live="polite"
      className="min-h-[520px]"
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
        className="relative mt-10 h-[390px] animate-pulse overflow-hidden rounded-2xl border border-[var(--workspace-border)] bg-[var(--workspace-surface-muted)] motion-reduce:animate-none"
      >
        <div className="absolute top-1/2 left-[8%] h-20 w-40 -translate-y-1/2 rounded-2xl border border-[var(--studio-border-strong)] bg-[var(--studio-surface)]" />
        <div className="absolute top-1/2 left-[27%] h-px w-[13%] bg-[var(--workspace-border-strong)]" />
        <div className="absolute top-[15%] bottom-[15%] left-[40%] w-px bg-[var(--workspace-border-strong)]" />
        {["18%", "42%", "66%"].map((top, index) => (
          <div key={top}>
            <div
              className="absolute left-[40%] h-px w-[11%] bg-[var(--workspace-border-strong)]"
              style={{ top }}
            />
            <div
              className="absolute left-[51%] h-16 w-36 rounded-xl border border-[var(--workspace-border-strong)] bg-[var(--workspace-surface-elevated)]"
              style={{ top: `calc(${top} - 2rem)` }}
            />
            <div
              className="absolute left-[67%] h-px w-[8%] bg-[var(--workspace-border-strong)]"
              style={{ top }}
            />
            <div
              className="absolute left-[75%] h-12 rounded-xl border border-[var(--workspace-border)] bg-[var(--workspace-surface-elevated)]"
              style={{ top: `calc(${top} - 1.5rem)`, width: index === 1 ? "17%" : "14%" }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function NodeEditDialog({
  action,
  content,
  note,
  onClose,
  onNoteChange,
  onSubmit,
  onTitleChange,
  title,
}: {
  action: MindMapNodeAction;
  content: MindMapContent;
  note: string;
  onClose: () => void;
  onNoteChange: (value: string) => void;
  onSubmit: () => void;
  onTitleChange: (value: string) => void;
  title: string;
}) {
  const t = useTranslations("Workbench");
  const node = action ? content.nodes.find((candidate) => candidate.id === action.nodeId) : null;
  const canSubmit =
    Boolean(title.trim()) &&
    (action?.type !== "edit" || title.trim() !== node?.label || note !== (node?.note ?? ""));
  return (
    <Dialog.Root open={Boolean(action && node)} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[120] bg-black/45 backdrop-blur-[2px]" />
        <Dialog.Content
          data-studio-tone="teal"
          data-workspace-theme="mist-zinc"
          className="fixed top-1/2 left-1/2 z-[121] w-[min(460px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] p-6 text-[var(--app-text)] shadow-2xl"
        >
          <Dialog.Title className="text-lg font-semibold">
            {action?.type === "edit" ? t("mindMapEditNodeTitle") : t("mindMapAddNodeTitle")}
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm text-[var(--app-text-muted)]">
            {action?.type === "edit"
              ? t("mindMapEditNodeDescription", { title: node?.label ?? "" })
              : t("mindMapAddNodeDescription", { title: node?.label ?? "" })}
          </Dialog.Description>
          <form
            className="mt-5"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            <label className="block text-xs font-medium text-[var(--app-text-muted)]">
              {t("mindMapNodeLabel")}
              <input
                maxLength={120}
                value={title}
                onChange={(event) => onTitleChange(event.target.value)}
                placeholder={t("mindMapNodeLabelPlaceholder")}
                className="mt-1.5 h-10 w-full rounded-xl border border-[var(--app-border-strong)] bg-transparent px-3 text-sm text-[var(--app-text)] outline-none focus:ring-2 focus:ring-[var(--workspace-accent)]"
              />
            </label>
            <label className="mt-4 block text-xs font-medium text-[var(--app-text-muted)]">
              {t("mindMapNodeNote")}
              <textarea
                maxLength={2000}
                rows={5}
                value={note}
                onChange={(event) => onNoteChange(event.target.value)}
                placeholder={t("mindMapNodeNotePlaceholder")}
                className="mt-1.5 w-full resize-y rounded-xl border border-[var(--app-border-strong)] bg-transparent px-3 py-2 text-sm leading-5 text-[var(--app-text)] outline-none focus:ring-2 focus:ring-[var(--workspace-accent)]"
              />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="h-10 rounded-xl border border-[var(--app-border-strong)] px-4 text-sm font-medium hover:bg-[var(--app-surface-muted)]"
                >
                  {t("cancel")}
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={!canSubmit}
                className="flex h-10 items-center gap-2 rounded-xl bg-[var(--studio-emphasis)] px-4 text-sm font-semibold text-[var(--studio-on-emphasis)] shadow-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-surface)] disabled:cursor-not-allowed disabled:shadow-none disabled:opacity-45"
              >
                {action?.type === "edit" ? (
                  <Save className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {action?.type === "edit" ? t("mindMapApplyEdit") : t("mindMapConfirmAdd")}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DeleteNodeDialog({
  content,
  nodeId,
  onClose,
  onConfirm,
}: {
  content: MindMapContent;
  nodeId: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("Workbench");
  const node = content.nodes.find((candidate) => candidate.id === nodeId);
  return (
    <AlertDialog.Root open={Boolean(node)} onOpenChange={(open) => !open && onClose()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[120] bg-black/45 backdrop-blur-[2px]" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-[121] w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--app-border-strong)] bg-[var(--app-surface)] p-6 text-[var(--app-text)] shadow-2xl">
          <AlertDialog.Title className="text-lg font-semibold">
            {t("mindMapDeleteTitle")}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-[var(--app-text-muted)]">
            {t("mindMapDeleteDescription", { title: node?.label ?? "" })}
          </AlertDialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <button
                type="button"
                className="h-10 rounded-xl border border-[var(--app-border-strong)] px-4 text-sm font-medium hover:bg-[var(--app-surface-muted)]"
              >
                {t("cancel")}
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                type="button"
                onClick={onConfirm}
                className="h-10 rounded-xl bg-[var(--app-danger)] px-4 text-sm font-semibold text-white hover:opacity-90"
              >
                {t("mindMapConfirmDelete")}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

function MindMapProposalChanges({
  content,
  proposal,
}: {
  content: MindMapContent;
  proposal: MindMapEditProposal;
}) {
  const t = useTranslations("Workbench");
  const labelsById = new Map(content.nodes.map((node) => [node.id, node.label]));
  const additionsByParent = new Map<string, Array<{ key: string; path: string }>>();
  const otherEdits: Array<
    Extract<MindMapEditProposal["edits"][number], { type: "delete_subtree" | "move" | "update" }>
  > = [];
  for (const edit of proposal.edits) {
    if (edit.type !== "add_child" && edit.type !== "add_tree") {
      otherEdits.push(edit);
      continue;
    }
    const paths = additionsByParent.get(edit.parentId) ?? [];
    if (edit.type === "add_child") {
      paths.push({ key: `${edit.parentId}:${paths.length}:${edit.label}`, path: edit.label });
    } else {
      const nodesByKey = new Map(edit.nodes.map((node) => [node.key, node]));
      for (const node of edit.nodes) {
        const labels = [node.label];
        let parentKey = node.parentKey;
        while (parentKey !== null) {
          const parent = nodesByKey.get(parentKey);
          if (!parent) break;
          labels.unshift(parent.label);
          parentKey = parent.parentKey;
        }
        paths.push({ key: `${edit.parentId}:${node.key}`, path: labels.join(" › ") });
      }
    }
    additionsByParent.set(edit.parentId, paths);
  }

  return (
    <div className="mt-3 max-h-44 space-y-2 overflow-y-auto pr-1">
      <p className="text-[11px] font-semibold tracking-wide text-[var(--workspace-text-muted)] uppercase">
        {t("mindMapRefinePlannedChanges")}
      </p>
      {[...additionsByParent.entries()].map(([parentId, paths]) => (
        <section
          key={parentId}
          className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2"
        >
          <p className="text-xs font-medium text-[var(--workspace-text-primary)]">
            {t("mindMapRefineAddTo", {
              count: paths.length,
              parent: labelsById.get(parentId) ?? parentId,
            })}
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {paths.map((item) => (
              <li
                key={item.key}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400"
              >
                <Plus aria-hidden className="h-3 w-3" />
                {item.path}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {otherEdits.map((edit) => {
        const nodeLabel = labelsById.get(edit.id) ?? edit.id;
        const description =
          edit.type === "update"
            ? edit.label
              ? t("mindMapRefineRename", { after: edit.label, before: nodeLabel })
              : t("mindMapRefineUpdateNote", { node: nodeLabel })
            : edit.type === "delete_subtree"
              ? t("mindMapRefineDeleteDescription", { node: nodeLabel })
              : t(edit.direction === "up" ? "mindMapRefineMoveUp" : "mindMapRefineMoveDown", {
                  node: nodeLabel,
                });
        return (
          <p
            key={`${edit.type}:${edit.id}:${JSON.stringify(edit)}`}
            className="rounded-lg border border-[var(--workspace-border)] bg-[var(--workspace-surface-muted)] px-3 py-2 text-xs text-[var(--workspace-text-primary)]"
          >
            {description}
          </p>
        );
      })}
    </div>
  );
}

export function MindMapWorkspaceView({
  artifact,
  conversationId,
  draft,
  failureCode,
  onArtifactUpdated,
  onBack,
  onSuggestion,
  pendingTitle,
  phase,
  workspaceId,
  proposal,
  onFocusChange,
  onProposalDismiss,
  readOnly = false,
}: {
  artifact: MindMapArtifact | null;
  conversationId: string;
  draft: MindMapDraftSnapshot | null;
  failureCode: string | null;
  onArtifactUpdated: (artifact: MindMapArtifact) => void;
  onBack: () => void;
  onSuggestion: (prompt: string) => void;
  pendingTitle: string | null;
  phase: ArtifactWorkspacePhase;
  workspaceId: string;
  proposal?: MindMapEditProposal | null;
  readOnly?: boolean;
  onFocusChange?: (focus: MindMapFocus | null) => void;
  onProposalDismiss?: () => void;
}) {
  const t = useTranslations("Workbench");
  const locale = useLocale() === "en-US" ? "en-US" : "zh-CN";
  const suggestions = useArtifactSuggestions({
    enabled: phase === "idle" && !artifact && !draft,
    fetchSuggestions: (afterGeneration, waitOnly) =>
      fetchArtifactSuggestions(workspaceId, locale, "mind_map", afterGeneration, waitOnly),
    queryKey: artifactSuggestionQueryKeys.suggestions(
      workspaceId,
      conversationId,
      locale,
      "mind_map",
    ),
    regenerateSuggestions: (afterGeneration) =>
      regenerateArtifactSuggestions(workspaceId, locale, "mind_map", afterGeneration),
  });
  const {
    acceptProposal,
    actionDialog,
    activeProposal,
    baseContent,
    cancelEditing,
    closeTransientEditors,
    confirmDelete,
    content,
    deleteNodeId,
    dialogNote,
    dialogTitle,
    dismissProposal,
    draftContent,
    editing,
    exitFocus,
    fitRequest,
    focusBranch,
    focusPath,
    locateNode,
    locateRequest,
    openAddDialog,
    openEditDialog,
    partialGeneration,
    previewCollapsedIds,
    proposalChangeCount,
    proposalDetailsOpen,
    proposalDiff,
    proposalStale,
    proposalState,
    requestFit,
    save,
    saveState,
    selectNode,
    selectedId,
    setActionDialog,
    setDeleteNodeId,
    setDialogNote,
    setDialogTitle,
    setProposalDetailsOpen,
    setViewMode,
    startEditing,
    submitNodeDialog,
    toggleCollapsed,
    updateCollapsedIds,
    viewState,
  } = useMindMapWorkspaceSession({
    artifact,
    conversationId,
    draft,
    onArtifactUpdated,
    onFocusChange,
    onProposalDismiss,
    proposal,
    workspaceId,
  });
  const statusMessage = proposalStale
    ? t("mindMapProposalStale")
    : saveState === "error"
      ? t("mindMapSaveFailed")
      : saveState === "conflict"
        ? t("mindMapConflict")
        : null;

  return (
    <ArtifactWorkspaceShell
      groundingSources={artifact?.groundingSources ?? []}
      actions={
        content ? (
          <div className="flex items-center gap-1">
            <div className="mr-1 flex h-8 items-center rounded-lg border border-[var(--workspace-border)] bg-[var(--workspace-surface-muted)] p-0.5">
              <button
                type="button"
                aria-pressed={viewState.mode === "canvas"}
                onClick={() => setViewMode("canvas")}
                className={`flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium ${
                  viewState.mode === "canvas"
                    ? "bg-[var(--workspace-surface-elevated)] text-[var(--workspace-text-primary)] shadow-sm"
                    : "text-[var(--workspace-text-muted)]"
                }`}
              >
                <MapIcon className="h-3.5 w-3.5" />
                {t("mindMapCanvasMode")}
              </button>
              <button
                type="button"
                aria-pressed={viewState.mode === "outline"}
                onClick={() => setViewMode("outline")}
                className={`flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium ${
                  viewState.mode === "outline"
                    ? "bg-[var(--workspace-surface-elevated)] text-[var(--workspace-text-primary)] shadow-sm"
                    : "text-[var(--workspace-text-muted)]"
                }`}
              >
                <ListTree className="h-3.5 w-3.5" />
                {t("mindMapOutlineMode")}
              </button>
            </div>
            {viewState.mode === "canvas" ? (
              <>
                <button
                  type="button"
                  onClick={() =>
                    updateCollapsedIds(
                      collapseMindMapToFirstLevel({
                        content,
                        focusRootId: viewState.focusRootId,
                      }),
                    )
                  }
                  aria-label={t("mindMapCollapseAll")}
                  title={t("mindMapCollapseAll")}
                  className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-[var(--workspace-text-muted)] hover:bg-[var(--studio-surface-subtle)]"
                >
                  <Minimize2 className="h-3.5 w-3.5" />
                  <span className="hidden 2xl:inline">{t("mindMapCollapseAll")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => updateCollapsedIds(new Set())}
                  aria-label={t("mindMapExpandAll")}
                  title={t("mindMapExpandAll")}
                  className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-[var(--workspace-text-muted)] hover:bg-[var(--studio-surface-subtle)]"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                  <span className="hidden 2xl:inline">{t("mindMapExpandAll")}</span>
                </button>
                <button
                  type="button"
                  onClick={requestFit}
                  aria-label={t("mindMapFitView")}
                  title={t("mindMapFitView")}
                  className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-[var(--workspace-text-muted)] hover:bg-[var(--studio-surface-subtle)]"
                >
                  <Scan className="h-3.5 w-3.5" />
                  <span className="hidden 2xl:inline">{t("mindMapFitView")}</span>
                </button>
              </>
            ) : null}
            {artifact && !readOnly ? (
              editing ? (
                <>
                  <button
                    type="button"
                    disabled={saveState === "saving"}
                    onClick={cancelEditing}
                    className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-[var(--workspace-text-muted)] hover:bg-[var(--studio-surface-subtle)] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <X className="h-3.5 w-3.5" />
                    {t("cancel")}
                  </button>
                  <button
                    type="button"
                    disabled={
                      saveState === "saving" ||
                      saveState === "conflict" ||
                      Boolean(actionDialog) ||
                      Boolean(deleteNodeId)
                    }
                    onClick={() => void save()}
                    className="flex h-8 items-center gap-1.5 rounded-lg bg-[var(--studio-emphasis)] px-2.5 text-xs font-medium text-[var(--studio-on-emphasis)] disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {saveState === "saving" ? t("mindMapSaving") : t("mindMapSave")}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={startEditing}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--studio-border)] px-2.5 text-xs font-medium text-[var(--studio-accent-text)]"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {t("mindMapEdit")}
                </button>
              )
            ) : null}
          </div>
        ) : null
      }
      backLabel={t("backToStudio")}
      backDisabled={saveState === "saving"}
      liveScrollTestId="mind-map-live-scroll"
      onBack={onBack}
      phase={phase}
      subtitle={t("mindMapSubtitle")}
      testId="mind-map-workspace"
      title={
        artifact?.title ??
        draft?.nodes.find((node) => node.id === draft.rootId)?.label ??
        pendingTitle ??
        t("mindMapWorkspace")
      }
      {...(content ? { contentClassName: "p-0", scrollClassName: "overflow-hidden" } : {})}
    >
      {!content && phase === "idle" ? (
        <ArtifactStartView
          description={t("mindMapStartDescription")}
          error={suggestions.error}
          errorLabel={t("suggestionsUnavailable")}
          Icon={Network}
          loading={suggestions.loading}
          loadingLabel={t("preparingSuggestions")}
          onRefresh={suggestions.refresh}
          onRetry={() => void suggestions.retry()}
          onSuggestion={onSuggestion}
          refreshing={suggestions.refreshing}
          refreshLabel={t("retrySuggestions")}
          suggestions={suggestions.suggestions}
          title={t("mindMapStartTitle")}
        />
      ) : content ? (
        <div className="relative h-[calc(100dvh-10rem)] min-h-[520px] max-h-[760px] w-full">
          {activeProposal ? (
            <section
              aria-label={t("mindMapProposalPreview", { count: proposalChangeCount })}
              className="absolute top-3 right-3 z-40 w-[min(520px,calc(100%-1.5rem))] rounded-xl border border-violet-500/40 bg-[var(--workspace-surface-elevated)]/95 p-2.5 shadow-xl backdrop-blur"
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  aria-expanded={proposalDetailsOpen}
                  onClick={() => setProposalDetailsOpen((open) => !open)}
                  className="flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1 text-left text-xs font-semibold text-violet-500 hover:bg-violet-500/10"
                >
                  <ChevronDown
                    className={`h-3.5 w-3.5 shrink-0 transition-transform motion-reduce:transition-none ${proposalDetailsOpen ? "rotate-180" : ""}`}
                  />
                  <span className="truncate">
                    {t("mindMapProposalPreview", { count: proposalChangeCount })}
                  </span>
                </button>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    disabled={proposalState === "saving"}
                    onClick={() => void acceptProposal()}
                    className="rounded-lg bg-[var(--studio-emphasis)] px-3 py-1.5 text-xs font-medium text-[var(--studio-on-emphasis)] disabled:opacity-50"
                  >
                    {proposalState === "saving"
                      ? t("mindMapRefineAccepting")
                      : t("mindMapRefineAccept")}
                  </button>
                  <button
                    type="button"
                    disabled={proposalState === "saving"}
                    onClick={dismissProposal}
                    className="rounded-lg border border-[var(--workspace-border)] px-3 py-1.5 text-xs disabled:opacity-50"
                  >
                    {t("mindMapRefineReject")}
                  </button>
                </div>
              </div>
              {proposalDetailsOpen ? (
                <div className="mt-2 border-t border-[var(--workspace-border)] pt-2">
                  <p className="text-xs text-[var(--workspace-text-primary)]">
                    {activeProposal.summary}
                  </p>
                  <MindMapProposalChanges
                    content={baseContent ?? content}
                    proposal={activeProposal}
                  />
                </div>
              ) : null}
              {proposalState === "error" ? (
                <p role="alert" className="mt-2 text-xs text-[var(--app-danger)]">
                  {t("mindMapRefineSaveFailed")}
                </p>
              ) : null}
            </section>
          ) : null}
          {partialGeneration ? (
            <p className="pointer-events-none absolute top-4 left-1/2 z-30 -translate-x-1/2 rounded-full border border-amber-500/40 bg-[var(--workspace-surface-elevated)] px-3 py-1.5 text-xs text-[var(--workspace-text-primary)] shadow-sm backdrop-blur">
              {t("partialGenerationWarning")}
            </p>
          ) : null}
          {viewState.mode === "canvas" ? (
            <>
              {focusPath.length ? (
                <div className="absolute top-3 left-3 z-30 flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-xl border border-[var(--workspace-border)] bg-[var(--workspace-surface-elevated)]/95 px-2 py-1.5 text-xs text-[var(--workspace-text-muted)] shadow-md backdrop-blur">
                  <button
                    type="button"
                    onClick={exitFocus}
                    className="flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 font-medium text-[var(--studio-accent-text)] hover:bg-[var(--studio-surface-subtle)]"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                    {t("mindMapExitFocus")}
                  </button>
                  <span className="truncate">
                    {focusPath.map((node) => node.label).join(" / ")}
                  </span>
                </div>
              ) : null}
              <ReactFlowProvider>
                <MindMapCanvas
                  key={artifact?.id ?? "draft"}
                  autoFitChanges={editing}
                  baseContent={proposalDiff ? baseContent : null}
                  collapsedIds={previewCollapsedIds}
                  content={content}
                  editing={editing && saveState !== "saving"}
                  fitRequest={fitRequest}
                  focusRootId={viewState.focusRootId}
                  locateRequest={locateRequest}
                  onCanvasClick={() => {
                    selectNode(null);
                    closeTransientEditors();
                  }}
                  onRequestAddChild={openAddDialog}
                  onRequestDelete={(id) => setDeleteNodeId(id)}
                  onRequestEdit={openEditDialog}
                  onRequestFocus={focusBranch}
                  onSelect={(id) => selectNode(id)}
                  onToggleCollapsed={toggleCollapsed}
                  proposalDiff={proposalDiff}
                  selectedId={selectedId}
                  statusMessage={statusMessage}
                />
              </ReactFlowProvider>
            </>
          ) : (
            <MindMapOutline
              baseContent={proposalDiff ? baseContent : null}
              collapsedIds={previewCollapsedIds}
              content={content}
              editing={editing && saveState !== "saving"}
              focusRootId={viewState.focusRootId}
              onLocate={locateNode}
              onRequestAddChild={openAddDialog}
              onRequestEdit={openEditDialog}
              onSelect={(id) => selectNode(id)}
              onToggleCollapsed={toggleCollapsed}
              proposalDiff={proposalDiff}
              selectedId={selectedId}
            />
          )}
          {editing ? (
            <>
              <NodeEditDialog
                action={actionDialog}
                content={draftContent}
                note={dialogNote}
                onClose={() => setActionDialog(null)}
                onNoteChange={setDialogNote}
                onSubmit={submitNodeDialog}
                onTitleChange={setDialogTitle}
                title={dialogTitle}
              />
              <DeleteNodeDialog
                content={draftContent}
                nodeId={deleteNodeId}
                onClose={() => setDeleteNodeId(null)}
                onConfirm={confirmDelete}
              />
            </>
          ) : null}
        </div>
      ) : (
        <ArtifactGenerationView
          emptyPreview={
            <MindMapGenerationPlaceholder
              status={t("mindMapGenerating")}
              title={pendingTitle ?? t("mindMapWorkspace")}
            />
          }
          failedMessage={t("mindMapGenerationFailed", { code: failureCode ?? "unknown" })}
          hasRenderableContent={false}
          phase={phase}
          status={t("mindMapGenerating")}
          testId="mind-map-generation-placeholder"
        >
          {null}
        </ArtifactGenerationView>
      )}
    </ArtifactWorkspaceShell>
  );
}
