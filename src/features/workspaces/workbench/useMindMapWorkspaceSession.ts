"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  type MindMapContent,
  type MindMapDraftSnapshot,
  mindMapRevisionContentSchema,
} from "@/features/artifacts/mind-maps/contract";
import { mindMapEditReducer } from "@/features/artifacts/mind-maps/editor";
import { getMindMapPath, revealMindMapNode } from "@/features/artifacts/mind-maps/layout";
import {
  classifyMindMapProposal,
  countMindMapRefineChanges,
  type MindMapFocus,
} from "@/features/artifacts/mind-maps/refine";
import type { MindMapArtifact } from "@/features/artifacts/mind-maps/types";
import type { MindMapEditProposal } from "@/features/artifacts/proposal-contract";
import {
  emptyMindMapViewState,
  type MindMapViewState,
  mindMapViewStorageKey,
  persistMindMapViewState,
  readMindMapViewState,
  reconcileMindMapViewState,
} from "./mind-map-view-state";
import { acceptMindMapProposal, saveMindMapRevision } from "./mind-map-workspace-client";

export type MindMapNodeAction = { nodeId: string; type: "add-child" | "edit" } | null;
export type MindMapProposalState = "error" | "idle" | "promoted" | "saving";
export type MindMapSaveState = "conflict" | "error" | "idle" | "saving";

export function useMindMapWorkspaceSession(input: {
  artifact: MindMapArtifact | null;
  conversationId: string;
  draft: MindMapDraftSnapshot | null;
  onArtifactUpdated: (artifact: MindMapArtifact) => void;
  onFocusChange: ((focus: MindMapFocus | null) => void) | undefined;
  onProposalDismiss: (() => void) | undefined;
  proposal: MindMapEditProposal | null | undefined;
  workspaceId: string;
}) {
  const {
    artifact,
    conversationId,
    draft,
    onArtifactUpdated,
    onFocusChange,
    onProposalDismiss,
    proposal,
    workspaceId,
  } = input;
  const canonical = artifact?.currentRevision.content ?? null;
  const partialGeneration = canonical?.generation.warnings.includes("partial_generation");
  const [editing, setEditing] = useState(false);
  const [draftContent, dispatch] = useReducer(
    mindMapEditReducer,
    canonical ?? draft ?? { nodes: [], rootId: "" },
  );
  const [proposalState, setProposalState] = useState<MindMapProposalState>("idle");
  const [proposalDetailsOpen, setProposalDetailsOpen] = useState(false);
  const [proposalStale, setProposalStale] = useState(false);
  const [acceptedPreview, setAcceptedPreview] = useState<{
    artifactId: string;
    content: MindMapContent;
    revisionId: string;
  } | null>(null);
  const proposalMatchesCurrent = Boolean(
    proposal &&
      artifact &&
      proposal.artifactId === artifact.id &&
      proposal.baseRevisionId === artifact.currentRevision.id,
  );
  const activeProposal =
    proposalState !== "promoted" && proposalMatchesCurrent ? (proposal ?? null) : null;
  const promotionPreview = acceptedPreview?.artifactId === artifact?.id ? acceptedPreview : null;
  const baseContent = editing ? null : (canonical ?? draft);
  const content = editing
    ? draftContent
    : (activeProposal?.content ?? promotionPreview?.content ?? baseContent);
  const proposalDiff = useMemo(
    () =>
      activeProposal && baseContent
        ? classifyMindMapProposal(baseContent, activeProposal.content)
        : null,
    [activeProposal, baseContent],
  );
  const proposalChangeCount = activeProposal ? countMindMapRefineChanges(activeProposal.edits) : 0;
  const viewStorageKey = artifact
    ? mindMapViewStorageKey(artifact.id, artifact.currentRevision.id)
    : null;
  const viewIdentity = viewStorageKey ?? (content ? `draft:${content.rootId}` : null);
  const initialViewContent = baseContent ?? content;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fitRequest, setFitRequest] = useState(0);
  const [locateRequest, setLocateRequest] = useState<{ id: string; sequence: number } | null>(null);
  const [viewState, setViewState] = useState<MindMapViewState>(() =>
    initialViewContent
      ? readMindMapViewState(initialViewContent, viewStorageKey)
      : emptyMindMapViewState(),
  );
  const [saveState, setSaveState] = useState<MindMapSaveState>("idle");
  const [baseRevisionId, setBaseRevisionId] = useState<string | null>(null);
  const [actionDialog, setActionDialog] = useState<MindMapNodeAction>(null);
  const [deleteNodeId, setDeleteNodeId] = useState<string | null>(null);
  const [dialogTitle, setDialogTitle] = useState("");
  const [dialogNote, setDialogNote] = useState("");
  const initializedViewIdentity = useRef<string | null>(viewIdentity);
  const pendingHydratedViewState = useRef<string | null>(null);
  const proposalRunId = useRef<string | null>(proposal?.runId ?? null);
  const collapsedIds = useMemo(() => new Set(viewState.collapsedIds), [viewState.collapsedIds]);
  const previewCollapsedIds = useMemo(() => {
    if (!proposalDiff || !content) return collapsedIds;
    const proposedIds = new Set(content.nodes.map((node) => node.id));
    let revealed = collapsedIds;
    for (const change of proposalDiff.changes.values()) {
      if (change.state === "unchanged") continue;
      const source = proposedIds.has(change.id) ? content : baseContent;
      if (!source) continue;
      revealed = revealMindMapNode({
        collapsedIds: revealed,
        content: source,
        nodeId: change.id,
      });
    }
    return revealed;
  }, [baseContent, collapsedIds, content, proposalDiff]);

  useEffect(() => {
    if (!content || !viewIdentity || initializedViewIdentity.current === viewIdentity) return;
    const next = readMindMapViewState(content, viewStorageKey);
    initializedViewIdentity.current = viewIdentity;
    pendingHydratedViewState.current = JSON.stringify(next);
    setViewState(next);
    setSelectedId(null);
  }, [content, viewIdentity, viewStorageKey]);

  useEffect(() => {
    if ((proposal?.runId ?? null) === proposalRunId.current) return;
    proposalRunId.current = proposal?.runId ?? null;
    if (!proposal) return;
    setProposalState("idle");
    setProposalDetailsOpen(false);
    setProposalStale(false);
  }, [proposal]);

  useEffect(() => {
    if (!proposal || proposalState === "promoted" || proposalMatchesCurrent) return;
    setProposalStale(true);
    onProposalDismiss?.();
  }, [onProposalDismiss, proposal, proposalMatchesCurrent, proposalState]);

  useEffect(() => {
    if (
      acceptedPreview &&
      (acceptedPreview.artifactId !== artifact?.id ||
        acceptedPreview.revisionId === artifact?.currentRevision.id)
    ) {
      setAcceptedPreview(null);
    }
  }, [acceptedPreview, artifact?.currentRevision.id, artifact?.id]);

  const selectNode = useCallback(
    (id: string | null) => {
      setSelectedId(id);
      if (!artifact || !id) {
        onFocusChange?.(null);
        return;
      }
      onFocusChange?.({
        kind: "mind_map_subtrees",
        nodeIds: [id],
        revisionId: artifact.currentRevision.id,
      });
    },
    [artifact, onFocusChange],
  );

  const acceptProposal = useCallback(async () => {
    if (!artifact || !activeProposal) return;
    setProposalState("saving");
    setProposalStale(false);
    try {
      const payload = await acceptMindMapProposal({
        artifactId: artifact.id,
        conversationId,
        expectedRevisionId: activeProposal.baseRevisionId,
        runId: activeProposal.runId,
        workspaceId,
      });
      if (payload.status === "conflict") {
        setProposalState("idle");
        setProposalStale(true);
        onProposalDismiss?.();
        return;
      }
      const nextContent = payload.artifact.currentRevision.content;
      const nextViewState = reconcileMindMapViewState(
        { ...viewState, collapsedIds: [...previewCollapsedIds] },
        nextContent,
      );
      const nextStorageKey = mindMapViewStorageKey(artifact.id, payload.acceptedRevisionId);
      persistMindMapViewState(nextStorageKey, nextViewState);
      initializedViewIdentity.current = nextStorageKey;
      pendingHydratedViewState.current = null;
      setViewState(nextViewState);
      setSelectedId((current) =>
        current && nextContent.nodes.some((node) => node.id === current) ? current : null,
      );
      setAcceptedPreview({
        artifactId: artifact.id,
        content: activeProposal.content,
        revisionId: payload.acceptedRevisionId,
      });
      setProposalState("promoted");
      onArtifactUpdated(payload.artifact);
      onProposalDismiss?.();
    } catch {
      setProposalState("error");
    }
  }, [
    activeProposal,
    artifact,
    conversationId,
    onArtifactUpdated,
    onProposalDismiss,
    previewCollapsedIds,
    viewState,
    workspaceId,
  ]);

  const dismissProposal = useCallback(() => {
    setProposalState("idle");
    setProposalDetailsOpen(false);
    setProposalStale(false);
    onProposalDismiss?.();
  }, [onProposalDismiss]);

  useEffect(() => {
    if (!viewStorageKey || initializedViewIdentity.current !== viewIdentity) return;
    const serialized = JSON.stringify(viewState);
    if (pendingHydratedViewState.current === serialized) {
      pendingHydratedViewState.current = null;
      return;
    }
    if (pendingHydratedViewState.current) return;
    persistMindMapViewState(viewStorageKey, viewState);
  }, [viewIdentity, viewState, viewStorageKey]);

  useEffect(() => {
    const next = artifact?.currentRevision.content ?? draft;
    if (!next || editing) return;
    dispatch({ type: "replace", content: next });
    setSelectedId((current) =>
      current && next.nodes.some((node) => node.id === current) ? current : null,
    );
  }, [artifact, draft, editing]);

  const updateCollapsedIds = useCallback((next: ReadonlySet<string>) => {
    setViewState((current) => ({ ...current, collapsedIds: [...next] }));
  }, []);

  const toggleCollapsed = useCallback(
    (nodeId: string) => {
      const next = new Set(collapsedIds);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      updateCollapsedIds(next);
    },
    [collapsedIds, updateCollapsedIds],
  );

  const focusBranch = useCallback((nodeId: string) => {
    setSelectedId(nodeId);
    setViewState((current) => ({ ...current, focusRootId: nodeId, mode: "canvas" }));
    setFitRequest((value) => value + 1);
  }, []);

  const exitFocus = useCallback(() => {
    setViewState((current) => ({ ...current, focusRootId: null }));
    setSelectedId(null);
    setFitRequest((value) => value + 1);
  }, []);

  const locateNode = useCallback(
    (nodeId: string) => {
      if (!content) return;
      const revealed = revealMindMapNode({ collapsedIds, content, nodeId });
      setViewState((current) => ({
        ...current,
        collapsedIds: [...revealed],
        focusRootId: null,
        mode: "canvas",
      }));
      setSelectedId(nodeId);
      setLocateRequest((current) => ({ id: nodeId, sequence: (current?.sequence ?? 0) + 1 }));
    },
    [collapsedIds, content],
  );

  const startEditing = useCallback(() => {
    if (!canonical || !artifact) return;
    dispatch({ type: "replace", content: canonical });
    setBaseRevisionId(artifact.currentRevision.id);
    setSelectedId(canonical.rootId);
    setSaveState("idle");
    setEditing(true);
  }, [artifact, canonical]);

  const closeTransientEditors = useCallback(() => {
    setActionDialog(null);
    setDeleteNodeId(null);
  }, []);

  const cancelEditing = useCallback(() => {
    if (canonical) dispatch({ type: "replace", content: canonical });
    closeTransientEditors();
    setBaseRevisionId(null);
    setSaveState("idle");
    setEditing(false);
  }, [canonical, closeTransientEditors]);

  const save = useCallback(async () => {
    if (!artifact || !baseRevisionId) return;
    const parsed = mindMapRevisionContentSchema.safeParse({
      ...draftContent,
      generation: canonical?.generation,
      schemaVersion: 2,
    });
    if (!parsed.success) {
      setSaveState("error");
      return;
    }
    setSaveState("saving");
    try {
      const payload = await saveMindMapRevision({
        artifact,
        content: parsed.data,
        conversationId,
        expectedRevisionId: baseRevisionId,
        workspaceId,
      });
      if (payload.status === "conflict") {
        setSaveState("conflict");
        return;
      }
      onArtifactUpdated(payload.artifact);
      setBaseRevisionId(null);
      setSaveState("idle");
      setEditing(false);
    } catch {
      setSaveState("error");
    }
  }, [
    artifact,
    baseRevisionId,
    canonical?.generation,
    conversationId,
    draftContent,
    onArtifactUpdated,
    workspaceId,
  ]);

  const openEditDialog = useCallback(
    (nodeId: string) => {
      const node = draftContent.nodes.find((candidate) => candidate.id === nodeId);
      if (!node) return;
      setSelectedId(nodeId);
      setDialogTitle(node.label);
      setDialogNote(node.note ?? "");
      setActionDialog({ nodeId, type: "edit" });
    },
    [draftContent.nodes],
  );

  const openAddDialog = useCallback((nodeId: string) => {
    setSelectedId(nodeId);
    setDialogTitle("");
    setDialogNote("");
    setActionDialog({ nodeId, type: "add-child" });
  }, []);

  const submitNodeDialog = useCallback(() => {
    if (!actionDialog || !dialogTitle.trim()) return;
    if (actionDialog.type === "edit") {
      dispatch({
        type: "update",
        id: actionDialog.nodeId,
        label: dialogTitle.trim(),
        note: dialogNote,
      });
    } else {
      const id = crypto.randomUUID();
      dispatch({
        type: "add_child",
        id,
        label: dialogTitle.trim(),
        note: dialogNote,
        parentId: actionDialog.nodeId,
      });
      setSelectedId(id);
    }
    setSaveState("idle");
    setActionDialog(null);
  }, [actionDialog, dialogNote, dialogTitle]);

  const confirmDelete = useCallback(() => {
    if (!deleteNodeId || deleteNodeId === draftContent.rootId) return;
    const node = draftContent.nodes.find((candidate) => candidate.id === deleteNodeId);
    dispatch({ type: "delete_subtree", id: deleteNodeId });
    setSelectedId(node?.parentId ?? draftContent.rootId);
    setSaveState("idle");
    setDeleteNodeId(null);
  }, [deleteNodeId, draftContent]);

  const setViewMode = useCallback((mode: MindMapViewState["mode"]) => {
    setViewState((current) => ({ ...current, mode }));
  }, []);

  return {
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
    focusPath:
      content && viewState.focusRootId ? getMindMapPath(content, viewState.focusRootId) : [],
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
    requestFit: () => setFitRequest((value) => value + 1),
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
  };
}
