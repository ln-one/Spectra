"use client";

import dagre from "@dagrejs/dagre";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import ReactFlow, {
  Background,
  BaseEdge,
  Controls,
  Handle,
  NodeToolbar,
  Position,
  getBezierPath,
  useUpdateNodeInternals,
} from "reactflow";
import type {
  Edge,
  EdgeProps,
  EdgeTypes,
  Node,
  NodeProps,
  ReactFlowInstance,
} from "reactflow";
import { Pencil, Plus, Trash2 } from "lucide-react";
import "reactflow/dist/style.css";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MindNode } from "./types";

type MindmapCanvasMode = "preview" | "edit";

interface MindmapCanvasProps {
  tree: MindNode;
  mode: MindmapCanvasMode;
  selectedId: string;
  onSelectNode: (id: string) => void;
  onCanvasClick: () => void;
  canStructuredEdit: boolean;
  isSubmitting: boolean;
  onRequestRename: (nodeId: string) => void;
  onRequestAddChild: (nodeId: string) => void;
  onRequestDelete: (nodeId: string) => void;
  collapsedNodeIds?: string[];
}

type FlowNodeData = {
  nodeId: string;
  rawLabel: string;
  summary?: string;
  childCount: number;
  isRoot: boolean;
  hasIncoming: boolean;
  hasOutgoing: boolean;
  canStructuredEdit: boolean;
  isSubmitting: boolean;
  mode: MindmapCanvasMode;
  onRequestRename: (nodeId: string) => void;
  onRequestAddChild: (nodeId: string) => void;
  onRequestDelete: (nodeId: string) => void;
};

const NODE_WIDTH = 300;
const NODE_HEIGHT = 120;
const RANK_GAP = 220;
const NODE_GAP = 56;
const EDGE_GAP = 24;
const HANDLE_SIZE = 10;
const HANDLE_OVERHANG = 5;
const EDGE_CURVATURE = 0.3;
const EDGE_COLOR = "#94a3b8";
const EDGE_STROKE_WIDTH = 2.2;
const EDGE_DOT_RADIUS = 4.5;
const INCOMING_HANDLE_ID = "incoming";
const OUTGOING_HANDLE_ID = "outgoing";

const HANDLE_BASE_STYLE = {
  width: HANDLE_SIZE,
  height: HANDLE_SIZE,
  border: "none",
  borderRadius: "9999px",
  background: "transparent",
  opacity: 0,
  pointerEvents: "none" as const,
  zIndex: 2,
};

function shouldHideNode(
  _node: MindNode,
  collapsedNodeIds: Set<string>,
  ancestors: string[]
): boolean {
  return ancestors.some((ancestorId) => collapsedNodeIds.has(ancestorId));
}

function buildFlow(
  root: MindNode,
  collapsedNodeIds: Set<string>,
  handlers: Pick<
    FlowNodeData,
    | "canStructuredEdit"
    | "isSubmitting"
    | "mode"
    | "onRequestRename"
    | "onRequestAddChild"
    | "onRequestDelete"
  >
): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
  const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: "LR",
    nodesep: NODE_GAP,
    ranksep: RANK_GAP,
    edgesep: EDGE_GAP,
    marginx: 40,
    marginy: 40,
  });

  const visibleNodes: MindNode[] = [];
  const edges: Edge[] = [];
  const incomingNodeIds = new Set<string>();
  const outgoingNodeIds = new Set<string>();
  const visit = (node: MindNode, ancestors: string[]) => {
    if (shouldHideNode(node, collapsedNodeIds, ancestors)) return;

    visibleNodes.push(node);
    graph.setNode(node.id, {
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    });

    if (collapsedNodeIds.has(node.id)) return;

    for (const child of node.children ?? []) {
      if (shouldHideNode(child, collapsedNodeIds, [...ancestors, node.id])) continue;

      graph.setEdge(node.id, child.id);
      edges.push({
        id: `${node.id}-${child.id}`,
        source: node.id,
        sourceHandle: OUTGOING_HANDLE_ID,
        target: child.id,
        targetHandle: INCOMING_HANDLE_ID,
        type: "mindmapEdge",
        style: {
          stroke: EDGE_COLOR,
          strokeWidth: EDGE_STROKE_WIDTH,
          strokeLinecap: "round" as const,
          strokeLinejoin: "round" as const,
        },
      });
      outgoingNodeIds.add(node.id);
      incomingNodeIds.add(child.id);
      visit(child, [...ancestors, node.id]);
    }
  };

  visit(root, []);
  dagre.layout(graph);

  const nodes = visibleNodes.map((node) => {
    const layoutNode = graph.node(node.id);
    return {
      id: node.id,
      type: "mindNode",
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      position: {
        x: layoutNode.x - NODE_WIDTH / 2,
        y: layoutNode.y - NODE_HEIGHT / 2,
      },
      draggable: false,
      selectable: true,
      data: {
        nodeId: node.id,
        rawLabel: node.label,
        summary: node.summary,
        childCount: node.children?.length ?? 0,
        isRoot: !node.parentId || node.parentId === node.id,
        hasIncoming: incomingNodeIds.has(node.id),
        hasOutgoing: outgoingNodeIds.has(node.id),
        canStructuredEdit: handlers.canStructuredEdit,
        isSubmitting: handlers.isSubmitting,
        mode: handlers.mode,
        onRequestRename: handlers.onRequestRename,
        onRequestAddChild: handlers.onRequestAddChild,
        onRequestDelete: handlers.onRequestDelete,
      },
    } satisfies Node<FlowNodeData>;
  });

  return { nodes, edges };
}

const MindmapNode = memo(function MindmapNode({
  data,
  selected,
}: NodeProps<FlowNodeData>) {
  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      updateNodeInternals(data.nodeId);
    });
    return () => cancelAnimationFrame(frame);
  }, [data.hasIncoming, data.hasOutgoing, data.nodeId, updateNodeInternals]);

  const summaryText = data.summary
    ? data.summary.length > 80
      ? `${data.summary.slice(0, 80)}...`
      : data.summary
    : null;
  const disableActions = !data.canStructuredEdit || data.isSubmitting;
  const showToolbar = selected && data.mode === "edit";
  const leftHandleStyle = {
    ...HANDLE_BASE_STYLE,
    left: -HANDLE_OVERHANG,
    top: "50%",
    transform: "translate(0, -50%)",
  };
  const rightHandleStyle = {
    ...HANDLE_BASE_STYLE,
    right: -HANDLE_OVERHANG,
    top: "50%",
    transform: "translate(0, -50%)",
  };

  return (
    <>
      {data.hasIncoming ? (
        <Handle
          id={INCOMING_HANDLE_ID}
          type="target"
          position={Position.Left}
          isConnectable={false}
          style={leftHandleStyle}
        />
      ) : null}
      <NodeToolbar
        isVisible={showToolbar}
        position={Position.Top}
        offset={12}
        className="nodrag nopan nowheel"
      >
        <div className="flex items-center gap-1 rounded-full border border-zinc-200 bg-white/96 px-1.5 py-1 shadow-lg backdrop-blur">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="nodrag nopan h-8 w-8 rounded-full"
            disabled={disableActions}
            onClick={() => data.onRequestRename(data.nodeId)}
            aria-label="重命名"
            title="重命名"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="nodrag nopan h-8 w-8 rounded-full"
            disabled={disableActions}
            onClick={() => data.onRequestAddChild(data.nodeId)}
            aria-label="新增子节点"
            title="新增子节点"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="nodrag nopan h-8 w-8 rounded-full text-rose-600 hover:text-rose-700"
            disabled={disableActions || data.isRoot}
            onClick={() => data.onRequestDelete(data.nodeId)}
            aria-label="删除节点"
            title={data.isRoot ? "根节点不可删除" : "删除节点"}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </NodeToolbar>

      <div
        className={cn(
          "rounded-2xl border bg-white p-3 shadow-sm transition-colors",
          selected
            ? "border-emerald-600 bg-emerald-50/80"
            : "border-zinc-300 hover:border-zinc-400"
        )}
        style={{ width: NODE_WIDTH, height: NODE_HEIGHT }}
      >
        <p
          className={cn(
            "text-sm font-semibold",
            selected ? "text-emerald-900" : "text-zinc-900"
          )}
        >
          {data.rawLabel}
        </p>
        {summaryText ? (
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-600">{summaryText}</p>
        ) : null}
        <p className="mt-1 text-xs text-zinc-500">子节点：{data.childCount}</p>
      </div>
      {data.hasOutgoing ? (
        <Handle
          id={OUTGOING_HANDLE_ID}
          type="source"
          position={Position.Right}
          isConnectable={false}
          style={rightHandleStyle}
        />
      ) : null}
    </>
  );
});

const MindmapEdge = memo(function MindmapEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  sourceHandleId,
  targetHandleId,
  markerEnd,
  style,
  id,
}: EdgeProps) {
  const sourceXAdjusted =
    sourceHandleId === OUTGOING_HANDLE_ID ? sourceX + 1 : sourceX;
  const targetXAdjusted =
    targetHandleId === INCOMING_HANDLE_ID ? targetX - 1 : targetX;

  const [edgePath] = getBezierPath({
    sourceX: sourceXAdjusted,
    sourceY,
    targetX: targetXAdjusted,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: EDGE_CURVATURE,
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      <circle
        cx={sourceXAdjusted}
        cy={sourceY}
        r={EDGE_DOT_RADIUS}
        fill={EDGE_COLOR}
      />
      <circle
        cx={targetXAdjusted}
        cy={targetY}
        r={EDGE_DOT_RADIUS}
        fill={EDGE_COLOR}
      />
    </>
  );
});

export function MindmapCanvas({
  tree,
  mode,
  selectedId,
  onSelectNode,
  onCanvasClick,
  canStructuredEdit,
  isSubmitting,
  onRequestRename,
  onRequestAddChild,
  onRequestDelete,
  collapsedNodeIds = [],
}: MindmapCanvasProps) {
  const reactFlowRef = useRef<ReactFlowInstance | null>(null);
  const collapsedSet = useMemo(() => new Set(collapsedNodeIds), [collapsedNodeIds]);
  const flow = useMemo(
    () =>
      buildFlow(tree, collapsedSet, {
        canStructuredEdit,
        isSubmitting,
        mode,
        onRequestRename,
        onRequestAddChild,
        onRequestDelete,
      }),
    [
      tree,
      collapsedSet,
      canStructuredEdit,
      isSubmitting,
      mode,
      onRequestRename,
      onRequestAddChild,
      onRequestDelete,
    ]
  );
  const nodes = useMemo(
    () =>
      flow.nodes.map((node) => ({
        ...node,
        selected: node.id === selectedId,
      })),
    [flow.nodes, selectedId]
  );
  const defaultEdgeOptions = useMemo(
    () => ({
      type: "mindmapEdge",
      style: {
        stroke: EDGE_COLOR,
        strokeWidth: EDGE_STROKE_WIDTH,
        strokeLinecap: "round" as const,
        strokeLinejoin: "round" as const,
      },
    }),
    []
  );
  const nodeTypes = useMemo(() => ({ mindNode: MindmapNode }), []);
  const edgeTypes = useMemo<EdgeTypes>(() => ({ mindmapEdge: MindmapEdge }), []);
  const layoutSignature = useMemo(
    () =>
      [
        flow.nodes
          .map(
            (node) =>
              `${node.id}:${Math.round(node.position.x)}:${Math.round(node.position.y)}`
          )
          .join("|"),
        flow.edges.map((edge) => edge.id).join("|"),
      ].join("::"),
    [flow.edges, flow.nodes]
  );

  const fitToView = useCallback(() => {
    reactFlowRef.current?.fitView({
      padding: 0.16,
      maxZoom: 1.15,
      duration: 280,
    });
  }, []);

  useEffect(() => {
    fitToView();
  }, [fitToView, layoutSignature]);

  return (
    <div className="h-full min-h-0 w-full overflow-hidden rounded-none border-0 bg-white">
      <ReactFlow
        nodes={nodes}
        edges={flow.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.16, duration: 280, maxZoom: 1.15 }}
        onInit={(instance) => {
          reactFlowRef.current = instance;
        }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        panOnDrag
        zoomOnScroll
        minZoom={0.3}
        maxZoom={1.8}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => onSelectNode(node.id)}
        onPaneClick={onCanvasClick}
      >
        <Controls className="!shadow-md" position="bottom-left" />
        <Background color="#e2e8f0" gap={16} size={1} />
      </ReactFlow>
    </div>
  );
}
