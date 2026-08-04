"use client";

import { RotateCcw, Scan } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type GraphViewData,
  type GraphViewEdge,
  GraphViewEngine,
  type GraphViewNodeInput,
} from "@/features/graph-view";
import {
  type GraphViewCanvasData,
  PixiGraphViewCanvas,
  type PixiGraphViewCanvasHandle,
} from "@/features/graph-view/PixiGraphViewCanvas";
import { SOURCE_ICON_PALETTE } from "@/features/sources/ui/source-icon-palette";
import {
  KnowledgeNetworkNodeInspector,
  type KnowledgeNetworkSelectedNode,
} from "./KnowledgeNetworkNodeInspector";
import styles from "./knowledge-network-graph-view.module.css";
import { prepareKnowledgeNetworkGraphPlan } from "./knowledge-network-plan";
import type {
  KnowledgeNetworkGraphPlan,
  KnowledgeNetworkNodeSelectionLabels,
  KnowledgeNetworkSource,
  KnowledgeNetworkTrace,
  KnowledgeNetworkWorkspaceNavigationTarget,
} from "./model";
import { workspaceNavigationTarget, ZH_KNOWLEDGE_NETWORK_NODE_SELECTION_LABELS } from "./model";
import { visibleCitationPath } from "./node-metrics";

type KnowledgeNetworkCanvasNodeData = GraphViewCanvasData & {
  label: string;
  detail: string;
  family?: KnowledgeNetworkSource["family"];
};

type KnowledgeNetworkGraphData = GraphViewData<KnowledgeNetworkCanvasNodeData>;

export type KnowledgeNetworkGraphViewProps = {
  trace: KnowledgeNetworkTrace;
  plan?: KnowledgeNetworkGraphPlan;
  reducedMotion?: boolean;
  theme?: "light" | "dark";
  height?: number;
  embedded?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  focusRequest?: KnowledgeNetworkGraphFocusRequest | null;
  citationFocus?: KnowledgeNetworkGraphCitationFocus | null;
  selectionLabels?: KnowledgeNetworkNodeSelectionLabels;
  onEnterWorkspace?: (target: KnowledgeNetworkWorkspaceNavigationTarget) => void;
  showSelectionCard?: boolean;
};

export type KnowledgeNetworkGraphFocusRequest = {
  sourceId: string;
  requestId: number;
};

export type KnowledgeNetworkGraphCitationFocus = KnowledgeNetworkGraphFocusRequest;

const CAMERA_DURATION = 680;

function selectedSourceId(trace: KnowledgeNetworkTrace, selectedId: string | null): string | null {
  if (!selectedId) return null;
  const chunk = trace.chunks.find((candidate) => candidate.id === selectedId);
  if (chunk) return chunk.sourceId;
  if (trace.sources.some((source) => source.id === selectedId)) return selectedId;
  if (trace.workspaces.some((workspace) => workspace.id === selectedId)) return selectedId;
  return null;
}

function selectedGraphId(trace: KnowledgeNetworkTrace, selectedId: string | null): string | null {
  return selectedSourceId(trace, selectedId);
}

type KnowledgeNetworkCitationPath = {
  nodeIds: ReadonlySet<string>;
  edgeIds: ReadonlySet<string>;
};

export function knowledgeNetworkSelectedNodeDetails(
  trace: KnowledgeNetworkTrace,
  plan: KnowledgeNetworkGraphPlan,
  selectedId: string | null,
  labels: KnowledgeNetworkNodeSelectionLabels,
): KnowledgeNetworkSelectedNode | null {
  const graphId = selectedGraphId(trace, selectedId);
  if (!graphId) return null;

  const metric = plan.nodeMetrics[graphId];
  if (!metric) return null;

  const workspace = trace.workspaces.find((candidate) => candidate.id === graphId);
  if (workspace) {
    const navigationTarget = workspaceNavigationTarget(trace, workspace.id);
    const relatedSources = trace.sources
      .filter((source) => source.workspaceId === workspace.id)
      .map(({ id, name, detail, family, chunkCount }) => ({
        id,
        name,
        detail,
        family,
        chunkCount,
      }));
    return {
      id: workspace.id,
      name: workspace.name,
      detail:
        workspace.relation === "current" ? labels.currentWorkspace : labels.referencedWorkspace,
      typeLabel: labels.workspace,
      family: "workspace",
      meta: [labels.connections(metric.weight), labels.sources(relatedSources.length)],
      relatedSources,
      ...(navigationTarget && navigationTarget.workspaceId !== trace.currentWorkspaceId
        ? {
            navigationTarget,
            navigationLabel: labels.enterWorkspace,
          }
        : {}),
    };
  }

  const source = trace.sources.find((candidate) => candidate.id === graphId);
  if (!source) return null;
  const owner = trace.workspaces.find((candidate) => candidate.id === source.workspaceId);
  const selectedChunk = trace.chunks.find(
    (chunk) => chunk.id === selectedId && chunk.sourceId === source.id,
  );
  const navigationTarget = workspaceNavigationTarget(trace, source.id);

  return {
    id: source.id,
    name: source.name,
    detail: source.detail,
    typeLabel: labels.source,
    family: source.family,
    meta: [
      ...(owner ? [`${labels.owner}: ${owner.name}`] : []),
      labels.connections(metric.weight),
      labels.chunks(source.chunkCount),
    ],
    ...(selectedChunk
      ? {
          evidence: {
            label: selectedChunk.label,
            locator: selectedChunk.locator,
          },
        }
      : {}),
    ...(navigationTarget && navigationTarget.workspaceId !== trace.currentWorkspaceId
      ? {
          navigationTarget,
          navigationLabel: labels.enterOwnerWorkspace,
        }
      : {}),
  };
}

function buildCitationPath(
  trace: KnowledgeNetworkTrace,
  plan: KnowledgeNetworkGraphPlan,
  sourceId: string,
): KnowledgeNetworkCitationPath | null {
  const path = visibleCitationPath(trace, sourceId);
  if (!path || path.length < 2) return null;

  const visibleNodeIds = new Set(plan.visibleNodeIds);
  if (path.some((id) => !visibleNodeIds.has(id))) return null;

  const edgeIds = new Set<string>();
  for (let index = 1; index < path.length; index += 1) {
    const fromId = path[index - 1];
    const toId = path[index];
    const edge = plan.visibleEdges.find(
      (candidate) => candidate.fromId === fromId && candidate.toId === toId,
    );
    if (!edge) return null;
    // GraphViewEngine normalizes visible relationships to their endpoint key
    // (`source→target`) so duplicate transport records cannot create duplicate
    // visual links. Keep the temporary path keyed to that renderer identity.
    edgeIds.add(`${edge.fromId}→${edge.toId}`);
  }

  return { edgeIds, nodeIds: new Set(path) };
}

function nodePalette(
  kind: "workspace" | KnowledgeNetworkSource["family"],
  theme: "light" | "dark",
): { foreground: string } {
  return SOURCE_ICON_PALETTE[kind][theme];
}

function buildKnowledgeNetworkGraphData(
  trace: KnowledgeNetworkTrace,
  plan: KnowledgeNetworkGraphPlan,
  selectedId: string | null,
  theme: "light" | "dark",
  citationPath: KnowledgeNetworkCitationPath | null,
): KnowledgeNetworkGraphData {
  const visibleIds = new Set(plan.visibleNodeIds);
  const workspaceById = new Map(trace.workspaces.map((workspace) => [workspace.id, workspace]));
  const sourceById = new Map(trace.sources.map((source) => [source.id, source]));
  const selectedNodeId = selectedGraphId(trace, selectedId);

  const nodes: GraphViewNodeInput<KnowledgeNetworkCanvasNodeData>[] = [];
  for (const id of plan.visibleNodeIds) {
    if (!visibleIds.has(id)) continue;
    const workspace = workspaceById.get(id);
    const source = sourceById.get(id);
    const item = workspace ?? source;
    const metric = plan.nodeMetrics[id];
    const position = plan.layout[id];
    if (!item || !metric || !position) continue;

    const isWorkspace = workspace !== undefined;
    const palette = nodePalette(isWorkspace ? "workspace" : (source?.family ?? "document"), theme);
    nodes.push({
      id,
      x: position.x,
      y: position.y,
      weight: metric.weight,
      radius: metric.radius,
      data: {
        label: item.name,
        detail: item.detail,
        color: palette.foreground,
        root: isWorkspace && id === trace.currentWorkspaceId,
        selected: selectedNodeId === id,
        pathState: citationPath?.nodeIds.has(id) ? "citation" : "neutral",
        ...(isWorkspace && id === trace.currentWorkspaceId ? { type: "focused" as const } : {}),
        ...(isWorkspace || !source ? {} : { family: source.family }),
      },
    });
  }

  const links: KnowledgeNetworkGraphData["links"] = plan.visibleEdges
    .filter((edge) => visibleIds.has(edge.fromId) && visibleIds.has(edge.toId))
    .map((edge) => ({ id: edge.id, source: edge.fromId, target: edge.toId }));

  return { nodes, links };
}

export function KnowledgeNetworkGraphView({
  trace,
  plan: providedPlan,
  reducedMotion = false,
  theme = "light",
  height = 620,
  embedded = false,
  selectedId: controlledSelectedId,
  onSelect,
  focusRequest,
  citationFocus,
  selectionLabels = ZH_KNOWLEDGE_NETWORK_NODE_SELECTION_LABELS,
  onEnterWorkspace,
  showSelectionCard = true,
}: KnowledgeNetworkGraphViewProps) {
  const canvasHandleRef = useRef<PixiGraphViewCanvasHandle | null>(null);
  const invalidateCanvasRef = useRef<(() => void) | null>(null);
  const [engine, setEngine] = useState<GraphViewEngine<KnowledgeNetworkCanvasNodeData> | null>(
    null,
  );
  const [canvasReady, setCanvasReady] = useState(false);
  const [layoutUpdateVersion, setLayoutUpdateVersion] = useState(0);
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const lastFocusRequestIdRef = useRef<number | null>(null);
  const lastFittedTraceIdRef = useRef<string | null>(null);
  const firstLayoutUpdateRef = useRef(false);
  const selectedId = controlledSelectedId === undefined ? internalSelectedId : controlledSelectedId;
  const traceId = trace.id;
  const plan = useMemo(
    () => providedPlan ?? prepareKnowledgeNetworkGraphPlan(trace),
    [providedPlan, trace],
  );
  const citationPath = useMemo(
    () => (citationFocus ? buildCitationPath(trace, plan, citationFocus.sourceId) : null),
    [citationFocus, plan, trace],
  );
  const graphData = useMemo(
    () => buildKnowledgeNetworkGraphData(trace, plan, selectedId, theme, citationPath),
    [citationPath, plan, selectedId, theme, trace],
  );
  const selectedNode = useMemo(
    () => knowledgeNetworkSelectedNodeDetails(trace, plan, selectedId, selectionLabels),
    [plan, selectedId, selectionLabels, trace],
  );

  useEffect(() => {
    if (!traceId) return;
    const nextEngine = new GraphViewEngine<KnowledgeNetworkCanvasNodeData>({
      onUpdate: () => {
        invalidateCanvasRef.current?.();
        if (firstLayoutUpdateRef.current) return;
        firstLayoutUpdateRef.current = true;
        setLayoutUpdateVersion((version) => version + 1);
      },
    });
    lastFittedTraceIdRef.current = null;
    lastFocusRequestIdRef.current = null;
    firstLayoutUpdateRef.current = false;
    setLayoutUpdateVersion(0);
    setEngine(nextEngine);
    return () => {
      invalidateCanvasRef.current = null;
      nextEngine.dispose();
      setEngine((current) => (current === nextEngine ? null : current));
    };
  }, [traceId]);

  useEffect(() => {
    if (!engine) return;
    engine.setData(graphData);
  }, [engine, graphData]);

  const selectNode = useCallback(
    (id: string | null) => {
      if (id === null) {
        if (controlledSelectedId === undefined) setInternalSelectedId(null);
        onSelect?.(null);
        return;
      }
      if (controlledSelectedId === undefined) setInternalSelectedId(id);
      onSelect?.(id);
    },
    [controlledSelectedId, onSelect],
  );

  useEffect(() => {
    if (
      layoutUpdateVersion === 0 ||
      !canvasReady ||
      !engine ||
      engine.getGraphData().nodes.length === 0 ||
      graphData.nodes.length === 0 ||
      !canvasHandleRef.current
    ) {
      return;
    }
    if (lastFittedTraceIdRef.current === traceId) return;
    // A citation request owns the first camera move: focusNodes fits the
    // complete temporary path. Otherwise fit once on the first worker frame;
    // do not refit again when the force simulation later settles.
    if (focusRequest && selectedGraphId(trace, focusRequest.sourceId)) return;
    lastFittedTraceIdRef.current = traceId;
    canvasHandleRef.current.fitGraph(reducedMotion ? 0 : CAMERA_DURATION);
  }, [
    canvasReady,
    engine,
    focusRequest,
    graphData.nodes.length,
    layoutUpdateVersion,
    reducedMotion,
    trace,
    traceId,
  ]);

  useEffect(() => {
    if (
      layoutUpdateVersion === 0 ||
      !canvasReady ||
      !engine ||
      engine.getGraphData().nodes.length === 0
    ) {
      return;
    }
    const focusId = selectedGraphId(trace, focusRequest?.sourceId ?? null);
    if (!focusRequest || !focusId || !canvasHandleRef.current) {
      return;
    }
    const isNewRequest = focusRequest.requestId !== lastFocusRequestIdRef.current;
    if (!isNewRequest) return;
    lastFocusRequestIdRef.current = focusRequest.requestId;
    canvasHandleRef.current.focusNodes(
      citationPath ? [...citationPath.nodeIds] : [focusId],
      reducedMotion ? 0 : CAMERA_DURATION,
    );
  }, [canvasReady, citationPath, engine, focusRequest, layoutUpdateVersion, reducedMotion, trace]);

  const resetLayout = useCallback(() => {
    engine?.resetLayout();
  }, [engine]);

  const reheat = useCallback(() => {
    engine?.reheat(0.3);
  }, [engine]);

  const fitGraph = useCallback(() => {
    canvasHandleRef.current?.fitGraph(reducedMotion ? 0 : CAMERA_DURATION);
  }, [reducedMotion]);

  const getLinkPathState = useCallback(
    (link: GraphViewEdge) =>
      citationPath?.edgeIds.has(link.id) ? ("citation" as const) : ("neutral" as const),
    [citationPath],
  );

  return (
    <section
      className={`${styles.shell} ${embedded ? styles.embeddedShell : ""}`}
      style={embedded ? undefined : { minHeight: height }}
      aria-label="知识网络"
      data-citation-focus-source-id={citationFocus?.sourceId}
      data-citation-path-edge-count={citationPath?.edgeIds.size}
      data-citation-path-state={citationPath ? "active" : "idle"}
    >
      {!embedded ? (
        <div className={styles.toolbar}>
          <div>
            <strong>知识网络</strong>
            <span>自由图视图</span>
          </div>
          <div className={styles.toolbarActions}>
            <button type="button" onClick={resetLayout} title="重新布局" aria-label="重新布局">
              <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
              <span>重新布局</span>
            </button>
            <button type="button" onClick={fitGraph} title="适配网络" aria-label="适配网络">
              <Scan aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={reheat} title="重新加热力学" aria-label="重新加热力学">
              <span>重热</span>
            </button>
          </div>
        </div>
      ) : null}
      {showSelectionCard && selectedNode ? (
        <div className={styles.selectionDock}>
          <div className={styles.selectionDockInner}>
            <KnowledgeNetworkNodeInspector
              node={selectedNode}
              labels={selectionLabels}
              onClose={() => selectNode(null)}
              onEnterWorkspace={onEnterWorkspace}
            />
          </div>
        </div>
      ) : null}
      <div
        className={`${styles.canvas} ${embedded ? styles.embeddedCanvas : ""}`}
        style={embedded ? undefined : { height }}
      >
        {embedded ? (
          <button
            type="button"
            className={styles.fitButton}
            onClick={fitGraph}
            title="适配网络"
            aria-label="适配网络"
          >
            <Scan aria-hidden="true" className="h-4 w-4" />
          </button>
        ) : null}
        <PixiGraphViewCanvas
          engine={engine}
          selectedId={selectedId}
          onSelect={selectNode}
          getLinkPathState={getLinkPathState}
          onHover={() => undefined}
          onReady={(handle) => {
            canvasHandleRef.current = handle;
            invalidateCanvasRef.current = handle?.invalidate ?? null;
            setCanvasReady(handle !== null);
          }}
          reducedMotion={reducedMotion}
          nodeSizeMultiplier={1}
          lineSizeMultiplier={1}
          textFadeMultiplier={0}
          showArrow={false}
        />
      </div>
    </section>
  );
}
