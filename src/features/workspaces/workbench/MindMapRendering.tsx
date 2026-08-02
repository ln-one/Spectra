"use client";

import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  type Edge,
  type EdgeProps,
  getBezierPath,
  Handle,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  type ReactFlowInstance,
} from "@xyflow/react";
import {
  ChevronDown,
  ChevronRight,
  Focus,
  LocateFixed,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MindMapContent } from "@/features/artifacts/mind-maps/contract";
import {
  getMindMapDescendantCounts,
  getMindMapPath,
  getMindMapVisibleNodeIds,
  layoutMindMap,
  type MindMapSide,
} from "@/features/artifacts/mind-maps/layout";
import type {
  MindMapProposalDiff,
  MindMapProposalNodeChange,
} from "@/features/artifacts/mind-maps/refine";

const BRANCH_COLORS = [
  "var(--mind-map-branch-1)",
  "var(--mind-map-branch-2)",
  "var(--mind-map-branch-3)",
  "var(--mind-map-branch-4)",
  "var(--mind-map-branch-5)",
  "var(--mind-map-branch-6)",
] as const;

function mindMapBranchColor(branchIndex: number) {
  if (branchIndex < 0) return "var(--studio-emphasis)";
  return BRANCH_COLORS[branchIndex % BRANCH_COLORS.length] ?? BRANCH_COLORS[0];
}

type MindMapProposalVisualState = MindMapProposalNodeChange["state"] | "move_origin";
type MindMapFlowData = {
  branchColor: string;
  childCount: number;
  collapsible: boolean;
  collapseLabel: string;
  collapsed: boolean;
  expandLabel: string;
  height: number;
  hiddenCount: number;
  hiddenProposalCount: number;
  label: string;
  onToggleCollapsed: (id: string) => void;
  previousLabel?: string;
  proposalLabel: string | null;
  proposalState: MindMapProposalVisualState;
  root: boolean;
  side: MindMapSide;
  width: number;
};
type MindMapFlowNode = Node<MindMapFlowData, "mindMap">;

function MindMapNode({ data, id, selected }: NodeProps<MindMapFlowNode>) {
  const targetPosition = data.side === "left" ? Position.Right : Position.Left;
  const sourcePosition = data.side === "left" ? Position.Left : Position.Right;
  const foldSide = data.side === "left" ? "-left-3.5" : "-right-3.5";
  const proposalClasses = {
    added: "border-emerald-500/80 bg-emerald-500/10",
    deleted: "border-rose-500/70 bg-rose-500/5 opacity-60",
    move_origin: "border-violet-500/50 bg-transparent opacity-35",
    moved: "border-violet-500/80 bg-violet-500/10",
    scope: "border-violet-500/70 bg-violet-500/5",
    unchanged: "",
    updated: "border-amber-500/80 bg-amber-500/10",
  }[data.proposalState];
  const proposalBadgeClasses = {
    added: "border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
    deleted: "border-rose-500/40 bg-rose-500/15 text-rose-600 dark:text-rose-300",
    move_origin: "border-violet-500/30 bg-violet-500/5 text-violet-600 dark:text-violet-300",
    moved: "border-violet-500/40 bg-violet-500/15 text-violet-600 dark:text-violet-300",
    scope: "border-violet-500/40 bg-violet-500/15 text-violet-600 dark:text-violet-300",
    unchanged: "",
    updated: "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300",
  }[data.proposalState];
  return (
    <>
      {!data.root ? (
        <Handle
          id={data.side === "left" ? "in-right" : "in-left"}
          type="target"
          position={targetPosition}
          isConnectable={false}
          className="!h-1.5 !w-1.5 !border-0"
          style={{ background: data.branchColor }}
        />
      ) : null}
      <div
        className={`relative flex items-center rounded-xl border px-3 shadow-sm transition-[border-color,box-shadow,background-color,opacity] duration-200 motion-reduce:transition-none ${proposalClasses} ${
          data.proposalState === "unchanged" && selected
            ? "bg-[var(--studio-surface)] shadow-md"
            : data.proposalState === "unchanged"
              ? "bg-[var(--workspace-surface-elevated)] hover:shadow-md"
              : "shadow-md"
        }`}
        style={
          {
            ...(data.proposalState === "unchanged"
              ? {
                  borderColor: selected ? data.branchColor : "var(--workspace-border-strong)",
                }
              : {}),
            height: data.height,
            width: data.width,
          } as CSSProperties
        }
      >
        <span
          aria-hidden
          className="mr-2.5 h-2 w-2 shrink-0 rounded-full"
          style={{ background: data.branchColor }}
        />
        <div className="min-w-0">
          {data.previousLabel ? (
            <p className="truncate text-[10px] text-rose-500 line-through">{data.previousLabel}</p>
          ) : null}
          <p
            className={`line-clamp-2 text-[var(--workspace-text-primary)] ${
              data.proposalState === "deleted" ? "line-through" : ""
            } ${data.root ? "text-sm font-bold leading-5" : "text-xs font-semibold leading-4"}`}
          >
            {data.label}
          </p>
        </div>
        {data.proposalLabel ? (
          <span
            className={`absolute -top-2 right-2 rounded-full border px-1.5 py-0.5 text-[9px] font-bold no-underline ${proposalBadgeClasses}`}
          >
            {data.proposalLabel}
          </span>
        ) : null}
      </div>
      {data.root ? (
        <>
          <Handle
            id="out-left"
            type="source"
            position={Position.Left}
            isConnectable={false}
            className="!h-1.5 !w-1.5 !border-0 !bg-[var(--studio-emphasis)]"
          />
          <Handle
            id="out-right"
            type="source"
            position={Position.Right}
            isConnectable={false}
            className="!h-1.5 !w-1.5 !border-0 !bg-[var(--studio-emphasis)]"
          />
        </>
      ) : data.childCount > 0 ? (
        <Handle
          id={data.side === "left" ? "out-left" : "out-right"}
          type="source"
          position={sourcePosition}
          isConnectable={false}
          className="!h-1.5 !w-1.5 !border-0"
          style={{ background: data.branchColor }}
        />
      ) : null}
      {data.collapsible ? (
        <button
          type="button"
          aria-label={data.collapsed ? data.expandLabel : data.collapseLabel}
          title={data.collapsed ? data.expandLabel : data.collapseLabel}
          onClick={(event) => {
            event.stopPropagation();
            data.onToggleCollapsed(id);
          }}
          className={`nodrag nopan absolute top-1/2 z-10 flex min-h-7 min-w-7 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--workspace-border-strong)] bg-[var(--workspace-surface-elevated)] px-1.5 text-[10px] font-bold text-[var(--workspace-text-primary)] shadow-sm transition hover:border-[var(--studio-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--studio-ring)] ${foldSide}`}
        >
          {data.collapsed
            ? `+${data.hiddenCount}${data.hiddenProposalCount ? ` / Δ${data.hiddenProposalCount}` : ""}`
            : "−"}
        </button>
      ) : null}
    </>
  );
}

function MindMapEdge({
  id,
  markerEnd,
  sourcePosition,
  sourceX,
  sourceY,
  style,
  targetPosition,
  targetX,
  targetY,
}: EdgeProps) {
  const [path] = getBezierPath({
    curvature: 0.42,
    sourcePosition,
    sourceX,
    sourceY,
    targetPosition,
    targetX,
    targetY,
  });
  return (
    <BaseEdge
      id={id}
      path={path}
      {...(markerEnd ? { markerEnd } : {})}
      {...(style ? { style } : {})}
    />
  );
}

const nodeTypes = { mindMap: MindMapNode };
const edgeTypes = { mindMap: MindMapEdge };

function getHiddenMindMapProposalCounts(input: {
  baseContent: MindMapContent | null;
  collapsedIds: ReadonlySet<string>;
  content: MindMapContent;
  proposalDiff: MindMapProposalDiff | null;
}) {
  const counts = new Map<string, number>();
  if (!input.proposalDiff) return counts;
  const contentIds = new Set(input.content.nodes.map((node) => node.id));
  for (const change of input.proposalDiff.changes.values()) {
    if (change.state === "scope" || change.state === "unchanged") continue;
    const source = contentIds.has(change.id) ? input.content : input.baseContent;
    if (!source) continue;
    const path = getMindMapPath(source, change.id);
    const hiddenBy = path
      .slice(0, -1)
      .reverse()
      .find((node) => input.collapsedIds.has(node.id));
    if (hiddenBy) counts.set(hiddenBy.id, (counts.get(hiddenBy.id) ?? 0) + 1);
  }
  return counts;
}

export function MindMapCanvas({
  autoFitChanges,
  baseContent,
  collapsedIds,
  content,
  editing,
  fitRequest,
  focusRootId,
  locateRequest,
  onCanvasClick,
  onRequestAddChild,
  onRequestDelete,
  onRequestEdit,
  onRequestFocus,
  onSelect,
  onToggleCollapsed,
  proposalDiff,
  selectedId,
  statusMessage,
}: {
  autoFitChanges: boolean;
  baseContent: MindMapContent | null;
  collapsedIds: ReadonlySet<string>;
  content: MindMapContent;
  editing: boolean;
  fitRequest: number;
  focusRootId: string | null;
  locateRequest: { id: string; sequence: number } | null;
  onCanvasClick: () => void;
  onRequestAddChild: (id: string) => void;
  onRequestDelete: (id: string) => void;
  onRequestEdit: (id: string) => void;
  onRequestFocus: (id: string) => void;
  onSelect: (id: string) => void;
  onToggleCollapsed: (id: string) => void;
  proposalDiff: MindMapProposalDiff | null;
  selectedId: string | null;
  statusMessage: string | null;
}) {
  const t = useTranslations("Workbench");
  const instanceRef = useRef<ReactFlowInstance<MindMapFlowNode, Edge> | null>(null);
  const initialFitDone = useRef(false);
  const visualRootId =
    focusRootId && content.nodes.some((node) => node.id === focusRootId)
      ? focusRootId
      : content.rootId;
  const positioned = useMemo(
    () => layoutMindMap({ collapsedIds, content, focusRootId }),
    [collapsedIds, content, focusRootId],
  );
  const positionedById = useMemo(
    () => new Map(positioned.map((node) => [node.id, node])),
    [positioned],
  );
  const basePositioned = useMemo(
    () =>
      baseContent && proposalDiff
        ? layoutMindMap({ collapsedIds, content: baseContent, focusRootId })
        : [],
    [baseContent, collapsedIds, focusRootId, proposalDiff],
  );
  const descendantCounts = useMemo(() => getMindMapDescendantCounts(content), [content]);
  const baseDescendantCounts = useMemo(
    () => (baseContent ? getMindMapDescendantCounts(baseContent) : new Map<string, number>()),
    [baseContent],
  );
  const hiddenProposalCounts = useMemo(
    () => getHiddenMindMapProposalCounts({ baseContent, collapsedIds, content, proposalDiff }),
    [baseContent, collapsedIds, content, proposalDiff],
  );
  const proposalLabel = useCallback(
    (state: MindMapProposalVisualState) =>
      state === "added"
        ? t("mindMapProposalAdded")
        : state === "updated"
          ? t("mindMapProposalUpdated")
          : state === "deleted"
            ? t("mindMapProposalDeleted")
            : state === "moved"
              ? t("mindMapProposalMoved")
              : state === "scope"
                ? t("mindMapProposalScope")
                : state === "move_origin"
                  ? t("mindMapProposalMoveOrigin")
                  : null,
    [t],
  );
  const projectedNodes = useMemo(
    () => [
      ...positioned.map((node) => ({
        node,
        source: content,
        stateOverride: null,
        visualId: node.id,
      })),
      ...(baseContent
        ? basePositioned
            .filter((node) => proposalDiff?.deletedNodeIds.has(node.id))
            .map((node) => ({
              node,
              source: baseContent,
              stateOverride: "deleted" as const,
              visualId: node.id,
            }))
        : []),
      ...(baseContent
        ? basePositioned
            .filter((node) => {
              if (proposalDiff?.changes.get(node.id)?.state !== "moved") return false;
              const next = positionedById.get(node.id);
              return (
                next && (next.position.x !== node.position.x || next.position.y !== node.position.y)
              );
            })
            .map((node) => ({
              node,
              source: baseContent,
              stateOverride: "move_origin" as const,
              visualId: `move-origin:${node.id}`,
            }))
        : []),
    ],
    [baseContent, basePositioned, content, positioned, positionedById, proposalDiff],
  );
  const nodes = useMemo<MindMapFlowNode[]>(
    () =>
      projectedNodes.flatMap(({ node: positionedNode, source, stateOverride, visualId }) => {
        const node = source.nodes.find((candidate) => candidate.id === positionedNode.id);
        if (!node) return [];
        const directChildren = source.nodes.filter((candidate) => candidate.parentId === node.id);
        const deletedDirectChildren =
          source === content && baseContent && proposalDiff
            ? baseContent.nodes.filter(
                (candidate) =>
                  candidate.parentId === node.id && proposalDiff.deletedNodeIds.has(candidate.id),
              )
            : [];
        const branchColor = mindMapBranchColor(positionedNode.branchIndex);
        const change = proposalDiff?.changes.get(node.id);
        const state = stateOverride ?? change?.state ?? "unchanged";
        const hiddenCount =
          state === "deleted"
            ? (baseDescendantCounts.get(node.id) ?? 0)
            : (descendantCounts.get(node.id) ?? 0);
        const stateLabel = proposalLabel(state);
        return [
          {
            ariaLabel: stateLabel ? `${node.label}，${stateLabel}` : node.label,
            ...(proposalDiff && state !== "deleted"
              ? {
                  className: "transition-transform duration-200 motion-reduce:transition-none",
                }
              : {}),
            data: {
              branchColor,
              childCount: directChildren.length + deletedDirectChildren.length,
              collapsible:
                state !== "deleted" &&
                state !== "move_origin" &&
                positionedNode.side !== "center" &&
                directChildren.length + deletedDirectChildren.length > 0,
              collapseLabel: t("mindMapCollapseNode"),
              collapsed: collapsedIds.has(node.id),
              expandLabel: t("mindMapExpandNode"),
              height: positionedNode.height,
              hiddenCount,
              hiddenProposalCount: hiddenProposalCounts.get(node.id) ?? 0,
              label: node.label,
              onToggleCollapsed,
              ...(change?.previousLabel ? { previousLabel: change.previousLabel } : {}),
              proposalLabel: stateLabel,
              proposalState: state,
              root: node.id === visualRootId,
              side: positionedNode.side,
              width: positionedNode.width,
            },
            id: visualId,
            position: positionedNode.position,
            selected: state !== "deleted" && state !== "move_origin" && selectedId === node.id,
            style: { height: positionedNode.height, width: positionedNode.width },
            type: "mindMap" as const,
            zIndex:
              state === "deleted" || state === "move_origin" ? 0 : node.id === visualRootId ? 2 : 1,
          },
        ];
      }),
    [
      collapsedIds,
      content,
      baseContent,
      baseDescendantCounts,
      descendantCounts,
      hiddenProposalCounts,
      onToggleCollapsed,
      projectedNodes,
      proposalDiff,
      proposalLabel,
      selectedId,
      t,
      visualRootId,
    ],
  );
  const visible = useMemo(() => new Set(positioned.map((node) => node.id)), [positioned]);
  const baseVisible = useMemo(
    () => new Set(basePositioned.map((node) => node.id)),
    [basePositioned],
  );
  const basePositionedById = useMemo(
    () => new Map(basePositioned.map((node) => [node.id, node])),
    [basePositioned],
  );
  const edges = useMemo<Edge[]>(
    () => [
      ...content.nodes.flatMap<Edge>((node) => {
        if (!node.parentId || !visible.has(node.id) || !visible.has(node.parentId)) return [];
        const positionedNode = positionedById.get(node.id);
        if (!positionedNode) return [];
        const color = mindMapBranchColor(positionedNode.branchIndex);
        const left = positionedNode.side === "left";
        const state = proposalDiff?.changes.get(node.id)?.state ?? "unchanged";
        const proposalEdge = state === "added" || state === "moved";
        return [
          {
            focusable: false,
            id: `${node.parentId}:${node.id}`,
            source: node.parentId,
            sourceHandle: left ? "out-left" : "out-right",
            style: {
              stroke:
                state === "added"
                  ? "rgb(16 185 129)"
                  : state === "moved"
                    ? "var(--studio-emphasis)"
                    : color,
              opacity: 0.72,
              ...(proposalEdge ? { strokeDasharray: "6 5" } : {}),
              strokeLinecap: "round" as const,
              strokeLinejoin: "round" as const,
              strokeWidth: 1.8,
            },
            target: node.id,
            targetHandle: left ? "in-right" : "in-left",
            type: "mindMap" as const,
          },
        ];
      }),
      ...(baseContent && proposalDiff
        ? baseContent.nodes.flatMap<Edge>((node) => {
            if (
              !node.parentId ||
              !proposalDiff.deletedNodeIds.has(node.id) ||
              !baseVisible.has(node.id) ||
              !baseVisible.has(node.parentId)
            )
              return [];
            const positionedNode = basePositionedById.get(node.id);
            if (!positionedNode) return [];
            const left = positionedNode.side === "left";
            return [
              {
                focusable: false,
                id: `deleted:${node.parentId}:${node.id}`,
                source: node.parentId,
                sourceHandle: left ? "out-left" : "out-right",
                style: {
                  opacity: 0.45,
                  stroke: "var(--app-danger)",
                  strokeDasharray: "4 5",
                  strokeWidth: 1.8,
                },
                target: node.id,
                targetHandle: left ? "in-right" : "in-left",
                type: "mindMap" as const,
              },
            ];
          })
        : []),
    ],
    [
      baseContent,
      basePositionedById,
      baseVisible,
      content.nodes,
      positionedById,
      proposalDiff,
      visible,
    ],
  );
  const fitToView = useCallback(
    (duration: number) =>
      void instanceRef.current?.fitView({ duration, maxZoom: 1.15, padding: 0.16 }),
    [],
  );

  useEffect(() => {
    if (!instanceRef.current || !nodes.length || !initialFitDone.current) return;
    if (autoFitChanges) requestAnimationFrame(() => fitToView(280));
  }, [autoFitChanges, fitToView, nodes.length]);

  useEffect(() => {
    if (fitRequest > 0) fitToView(280);
  }, [fitRequest, fitToView]);

  useEffect(() => {
    if (!locateRequest || !instanceRef.current) return;
    const node = instanceRef.current.getNode(locateRequest.id);
    if (!node) return;
    instanceRef.current.setCenter(
      node.position.x + (node.measured?.width ?? node.data.width) / 2,
      node.position.y + (node.measured?.height ?? node.data.height) / 2,
      { duration: 320, zoom: 1.15 },
    );
  }, [locateRequest]);

  const selectedNode = content.nodes.find((node) => node.id === selectedId) ?? null;
  const selectedPath = selectedNode ? getMindMapPath(content, selectedNode.id) : [];
  const selectedChildren = selectedNode
    ? content.nodes.filter((node) => node.parentId === selectedNode.id).length
    : 0;

  return (
    <div
      data-testid="mind-map-canvas"
      className="relative h-[calc(100dvh-10rem)] min-h-[520px] max-h-[760px] w-full overflow-hidden bg-[var(--workspace-surface-elevated)]"
    >
      <ReactFlow<MindMapFlowNode, Edge>
        className="mind-map-flow !h-full !w-full"
        aria-label={t("mindMapCanvas")}
        ariaLabelConfig={{
          "controls.ariaLabel": t("mindMapControls"),
          "controls.fitView.ariaLabel": t("mindMapFitView"),
          "controls.zoomIn.ariaLabel": t("mindMapZoomIn"),
          "controls.zoomOut.ariaLabel": t("mindMapZoomOut"),
        }}
        edges={edges}
        edgeTypes={edgeTypes}
        edgesFocusable={false}
        elementsSelectable
        maxZoom={1.8}
        minZoom={0.18}
        nodes={nodes}
        nodesConnectable={false}
        nodesDraggable={false}
        nodesFocusable
        nodeTypes={nodeTypes}
        onInit={(instance) => {
          instanceRef.current = instance;
          if (!initialFitDone.current && nodes.length) {
            initialFitDone.current = true;
            requestAnimationFrame(() => fitToView(0));
          }
        }}
        onNodeClick={(_, node) => {
          if (!node.id.startsWith("move-origin:")) onSelect(node.id);
        }}
        onPaneClick={onCanvasClick}
        panOnDrag
        proOptions={{ hideAttribution: true }}
        zoomOnScroll
      >
        <Controls
          className="mind-map-controls !shadow-md"
          position="bottom-left"
          showInteractive={false}
        />
        <Background
          color="var(--workspace-border-strong)"
          gap={16}
          size={1}
          variant={BackgroundVariant.Dots}
        />
      </ReactFlow>
      {selectedNode ? (
        <aside
          data-testid="mind-map-node-inspector"
          className="absolute right-3 bottom-3 z-20 w-[min(320px,calc(100%-1.5rem))] rounded-2xl border border-[var(--workspace-border)] bg-[var(--workspace-surface-elevated)]/95 p-4 text-[var(--workspace-text-primary)] shadow-xl backdrop-blur"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold tracking-[0.12em] text-[var(--workspace-text-muted)] uppercase">
                {t("mindMapNodeInspector")}
              </p>
              <h3 className="mt-1 text-sm font-semibold leading-5">{selectedNode.label}</h3>
            </div>
            <button
              type="button"
              aria-label={t("mindMapCloseInspector")}
              onClick={onCanvasClick}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--workspace-text-muted)] hover:bg-[var(--workspace-surface-muted)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-[var(--workspace-text-muted)]">
            {selectedPath.map((node) => node.label).join(" / ")}
          </p>
          {selectedNode.note ? (
            <p className="mt-3 max-h-24 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-[var(--workspace-text-muted)]">
              {selectedNode.note}
            </p>
          ) : null}
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--workspace-border)] pt-3">
            <span className="text-[11px] text-[var(--workspace-text-muted)]">
              {t("mindMapChildCount", { count: selectedChildren })}
            </span>
            <div className="flex items-center gap-1">
              {selectedNode.id !== visualRootId ? (
                <button
                  type="button"
                  onClick={() => onRequestFocus(selectedNode.id)}
                  className="flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-medium text-[var(--studio-accent-text)] hover:bg-[var(--studio-surface-subtle)]"
                >
                  <Focus className="h-3 w-3" />
                  {t("mindMapFocusBranch")}
                </button>
              ) : null}
              {editing ? (
                <>
                  <button
                    type="button"
                    aria-label={t("mindMapRename")}
                    onClick={() => onRequestEdit(selectedNode.id)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-[var(--workspace-surface-muted)]"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    aria-label={t("mindMapAddChild")}
                    onClick={() => onRequestAddChild(selectedNode.id)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-[var(--workspace-surface-muted)]"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                  {selectedNode.id !== content.rootId ? (
                    <button
                      type="button"
                      aria-label={t("mindMapDelete")}
                      onClick={() => onRequestDelete(selectedNode.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-500/10"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        </aside>
      ) : null}
      {statusMessage ? (
        <div className="pointer-events-none absolute inset-x-4 bottom-4 z-20">
          <p
            role="alert"
            className="inline-flex rounded-full border border-rose-500/30 bg-[var(--workspace-surface-elevated)] px-3 py-1.5 text-xs text-rose-500 shadow-sm"
          >
            {statusMessage}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function MindMapOutline({
  baseContent,
  collapsedIds,
  content,
  editing,
  focusRootId,
  onLocate,
  onRequestAddChild,
  onRequestEdit,
  onSelect,
  onToggleCollapsed,
  proposalDiff,
  selectedId,
}: {
  baseContent: MindMapContent | null;
  collapsedIds: ReadonlySet<string>;
  content: MindMapContent;
  editing: boolean;
  focusRootId: string | null;
  onLocate: (id: string) => void;
  onRequestAddChild: (id: string) => void;
  onRequestEdit: (id: string) => void;
  onSelect: (id: string) => void;
  onToggleCollapsed: (id: string) => void;
  proposalDiff: MindMapProposalDiff | null;
  selectedId: string | null;
}) {
  const t = useTranslations("Workbench");
  const [query, setQuery] = useState("");
  const reviewContent = useMemo<MindMapContent>(
    () =>
      baseContent && proposalDiff
        ? {
            ...content,
            nodes: [
              ...content.nodes,
              ...baseContent.nodes.filter((node) => proposalDiff.deletedNodeIds.has(node.id)),
            ],
          }
        : content,
    [baseContent, content, proposalDiff],
  );
  const visualRootId =
    focusRootId && reviewContent.nodes.some((node) => node.id === focusRootId)
      ? focusRootId
      : reviewContent.rootId;
  const children = useMemo(() => {
    const index = new Map<string, MindMapContent["nodes"]>();
    for (const node of reviewContent.nodes) {
      if (!node.parentId) continue;
      const siblings = index.get(node.parentId) ?? [];
      siblings.push(node);
      index.set(node.parentId, siblings);
    }
    for (const siblings of index.values()) siblings.sort((left, right) => left.order - right.order);
    return index;
  }, [reviewContent.nodes]);
  const nodeById = useMemo(
    () => new Map(reviewContent.nodes.map((node) => [node.id, node])),
    [reviewContent.nodes],
  );
  const descendantCounts = useMemo(
    () => getMindMapDescendantCounts(reviewContent),
    [reviewContent],
  );
  const hiddenProposalCounts = useMemo(
    () =>
      getHiddenMindMapProposalCounts({
        baseContent,
        collapsedIds,
        content,
        proposalDiff,
      }),
    [baseContent, collapsedIds, content, proposalDiff],
  );
  const rows = useMemo(() => {
    const visible = new Set(
      getMindMapVisibleNodeIds({
        collapsedIds,
        content: reviewContent,
        focusRootId: visualRootId,
      }),
    );
    const result: Array<{ depth: number; node: MindMapContent["nodes"][number] }> = [];
    const visit = (id: string, depth: number) => {
      const node = nodeById.get(id);
      if (!node || !visible.has(id)) return;
      result.push({ depth, node });
      for (const child of children.get(id) ?? []) visit(child.id, depth + 1);
    };
    visit(visualRootId, 0);
    return result;
  }, [children, collapsedIds, nodeById, reviewContent, visualRootId]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const searchResults = normalizedQuery
    ? content.nodes.filter(
        (node) =>
          node.label.toLocaleLowerCase().includes(normalizedQuery) ||
          node.note?.toLocaleLowerCase().includes(normalizedQuery),
      )
    : [];
  const selectedNode = nodeById.get(selectedId ?? "") ?? null;

  return (
    <div
      data-testid="mind-map-outline"
      className="h-[calc(100dvh-10rem)] min-h-[520px] max-h-[760px] overflow-y-auto bg-[var(--workspace-surface-elevated)] p-5 text-[var(--workspace-text-primary)]"
    >
      <label className="relative block">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--workspace-text-muted)]" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("mindMapSearchPlaceholder")}
          className="h-10 w-full rounded-xl border border-[var(--workspace-border)] bg-[var(--workspace-surface-muted)] pr-3 pl-9 text-sm outline-none focus:border-[var(--studio-border-strong)] focus:ring-2 focus:ring-[var(--studio-ring)]"
        />
      </label>

      <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--workspace-border)]">
        {normalizedQuery ? (
          searchResults.length ? (
            searchResults.map((node) => (
              <button
                key={node.id}
                type="button"
                onClick={() => onLocate(node.id)}
                className="flex w-full items-center gap-3 border-b border-[var(--workspace-border)] px-4 py-3 text-left last:border-b-0 hover:bg-[var(--workspace-surface-muted)]"
              >
                <LocateFixed className="h-4 w-4 shrink-0 text-[var(--studio-accent-text)]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{node.label}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-[var(--workspace-text-muted)]">
                    {getMindMapPath(content, node.id)
                      .map((item) => item.label)
                      .join(" / ")}
                  </span>
                </span>
                <span className="text-[11px] text-[var(--studio-accent-text)]">
                  {t("mindMapLocateOnCanvas")}
                </span>
              </button>
            ))
          ) : (
            <p className="px-4 py-8 text-center text-sm text-[var(--workspace-text-muted)]">
              {t("mindMapSearchEmpty")}
            </p>
          )
        ) : (
          rows.map(({ depth, node }) => {
            const childCount = children.get(node.id)?.length ?? 0;
            const collapsed = collapsedIds.has(node.id);
            const selected = selectedId === node.id;
            const change = proposalDiff?.changes.get(node.id);
            const state = change?.state ?? "unchanged";
            const stateLabel =
              state === "added"
                ? t("mindMapProposalAdded")
                : state === "updated"
                  ? t("mindMapProposalUpdated")
                  : state === "deleted"
                    ? t("mindMapProposalDeleted")
                    : state === "moved"
                      ? t("mindMapProposalMoved")
                      : state === "scope"
                        ? t("mindMapProposalScope")
                        : null;
            return (
              <div
                key={node.id}
                className={`group flex min-h-11 items-center border-b border-[var(--workspace-border)] pr-3 last:border-b-0 ${
                  state === "deleted"
                    ? "bg-rose-500/5 opacity-60"
                    : state === "added"
                      ? "bg-emerald-500/5"
                      : state === "updated"
                        ? "bg-amber-500/5"
                        : state === "moved" || state === "scope"
                          ? "bg-violet-500/5"
                          : selected
                            ? "bg-[var(--studio-surface-subtle)]"
                            : "hover:bg-[var(--workspace-surface-muted)]"
                }`}
                style={{ paddingLeft: 12 + depth * 22 }}
              >
                {childCount ? (
                  <button
                    type="button"
                    aria-label={collapsed ? t("mindMapExpandNode") : t("mindMapCollapseNode")}
                    onClick={() => onToggleCollapsed(node.id)}
                    className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--workspace-text-muted)] hover:bg-[var(--workspace-surface-elevated)]"
                  >
                    {collapsed ? (
                      <ChevronRight className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                ) : (
                  <span className="mr-1 w-7 shrink-0" />
                )}
                <button
                  type="button"
                  disabled={state === "deleted"}
                  onClick={() => onSelect(node.id)}
                  className="min-w-0 flex-1 py-2 text-left disabled:cursor-default"
                >
                  {change?.previousLabel ? (
                    <span className="block truncate text-[10px] text-rose-500 line-through">
                      {change.previousLabel}
                    </span>
                  ) : null}
                  <span
                    className={`block truncate text-sm font-medium ${state === "deleted" ? "line-through" : ""}`}
                  >
                    {node.label}
                  </span>
                  {node.note ? (
                    <span className="mt-0.5 block truncate text-[11px] text-[var(--workspace-text-muted)]">
                      {node.note}
                    </span>
                  ) : null}
                </button>
                {stateLabel ? (
                  <span className="mr-2 shrink-0 rounded-full border border-current/25 px-1.5 py-0.5 text-[9px] font-bold text-[var(--studio-accent-text)]">
                    {stateLabel}
                  </span>
                ) : null}
                {collapsed ? (
                  <span className="mr-2 rounded-full bg-[var(--workspace-surface-elevated)] px-2 py-0.5 text-[10px] font-semibold text-[var(--workspace-text-muted)]">
                    +{descendantCounts.get(node.id) ?? 0}
                    {hiddenProposalCounts.get(node.id)
                      ? ` / Δ${hiddenProposalCounts.get(node.id)}`
                      : ""}
                  </span>
                ) : null}
                {editing && selected ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={t("mindMapRename")}
                      onClick={() => onRequestEdit(node.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-[var(--workspace-surface-elevated)]"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={t("mindMapAddChild")}
                      onClick={() => onRequestAddChild(node.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-[var(--workspace-surface-elevated)]"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {selectedNode && !normalizedQuery ? (
        <section className="mt-4 rounded-2xl border border-[var(--workspace-border)] bg-[var(--workspace-surface-muted)] p-4">
          <p className="text-xs font-semibold text-[var(--workspace-text-muted)]">
            {t("mindMapNodeInspector")}
          </p>
          <h3 className="mt-1 text-sm font-semibold">{selectedNode.label}</h3>
          {selectedNode.note ? (
            <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-[var(--workspace-text-muted)]">
              {selectedNode.note}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => onLocate(selectedNode.id)}
            className="mt-3 flex h-8 items-center gap-1.5 rounded-lg border border-[var(--studio-border)] px-3 text-xs font-medium text-[var(--studio-accent-text)]"
          >
            <LocateFixed className="h-3.5 w-3.5" />
            {t("mindMapLocateOnCanvas")}
          </button>
        </section>
      ) : null}
    </div>
  );
}
