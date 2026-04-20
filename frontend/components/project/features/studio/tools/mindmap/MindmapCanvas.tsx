"use client";

import dagre from "@dagrejs/dagre";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  NodeToolbar,
  Position,
} from "reactflow";
import type { Edge, Node, NodeProps, ReactFlowInstance } from "reactflow";
import "reactflow/dist/style.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { MindNode } from "./types";

interface MindmapCanvasProps {
  tree: MindNode;
  selectedId: string;
  onSelectNode: (id: string) => void;
  canStructuredEdit: boolean;
  isSubmitting: boolean;
  onRenameNode: (nodeId: string, nextLabel: string) => Promise<boolean>;
  onAddChildNode: (
    nodeId: string,
    childTitle: string,
    childSummary: string
  ) => Promise<boolean>;
  onDeleteNode: (nodeId: string) => Promise<boolean>;
  collapsedNodeIds?: string[];
}

type FlowNodeData = {
  nodeId: string;
  rawLabel: string;
  summary?: string;
  childCount: number;
  isRoot: boolean;
  canStructuredEdit: boolean;
  isSubmitting: boolean;
  onRenameNode: (nodeId: string, nextLabel: string) => Promise<boolean>;
  onAddChildNode: (
    nodeId: string,
    childTitle: string,
    childSummary: string
  ) => Promise<boolean>;
  onDeleteNode: (nodeId: string) => Promise<boolean>;
};

const NODE_WIDTH = 300;
const NODE_HEIGHT = 120;
const DAGRE_LAYOUT_OPTIONS = {
  rankdir: "LR",
  align: "UL",
  nodesep: 72,
  ranksep: 188,
  edgesep: 36,
  ranker: "tight-tree",
} as const;

function shouldHideNode(
  _node: MindNode,
  collapsedNodeIds: Set<string>,
  ancestors: string[]
): boolean {
  return ancestors.some((ancestorId) => collapsedNodeIds.has(ancestorId));
}

function toVisibleTree(root: MindNode, collapsedNodeIds: Set<string>) {
  const visibleNodes: MindNode[] = [];
  const treeEdges: Array<{ parentId: string; nodeId: string }> = [];

  const walk = (
    node: MindNode,
    parentId: string | null = null,
    ancestors: string[] = []
  ) => {
    if (shouldHideNode(node, collapsedNodeIds, ancestors)) return;
    visibleNodes.push(node);
    if (parentId) {
      treeEdges.push({ parentId, nodeId: node.id });
    }
    (node.children ?? []).forEach((child) =>
      walk(child, node.id, [...ancestors, node.id])
    );
  };

  walk(root);
  return { visibleNodes, treeEdges };
}

function buildFlow(
  root: MindNode,
  collapsedNodeIds: Set<string>,
  handlers: Pick<
    FlowNodeData,
    "canStructuredEdit" | "isSubmitting" | "onRenameNode" | "onAddChildNode" | "onDeleteNode"
  >
): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
  const { visibleNodes, treeEdges } = toVisibleTree(root, collapsedNodeIds);
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph(DAGRE_LAYOUT_OPTIONS);

  visibleNodes.forEach((node) => {
    graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  treeEdges.forEach(({ parentId, nodeId }) => {
    graph.setEdge(parentId, nodeId);
  });

  dagre.layout(graph);

  const nodes: Node<FlowNodeData>[] = visibleNodes.map((node) => {
    const point = graph.node(node.id) ?? { x: 0, y: 0 };
    return {
      id: node.id,
      type: "mindNode",
      position: {
        x: point.x - NODE_WIDTH / 2,
        y: point.y - NODE_HEIGHT / 2,
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      draggable: false,
      selectable: true,
      data: {
        nodeId: node.id,
        rawLabel: node.label,
        summary: node.summary,
        childCount: node.children?.length ?? 0,
        isRoot: !node.parentId || node.parentId === node.id,
        canStructuredEdit: handlers.canStructuredEdit,
        isSubmitting: handlers.isSubmitting,
        onRenameNode: handlers.onRenameNode,
        onAddChildNode: handlers.onAddChildNode,
        onDeleteNode: handlers.onDeleteNode,
      },
    };
  });

  const edges: Edge[] = [];

  treeEdges.forEach(({ parentId, nodeId }) => {
    edges.push({
      id: `${parentId}-${nodeId}`,
      source: parentId,
      target: nodeId,
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" },
      style: { stroke: "#cbd5e1", strokeWidth: 1.8 },
    });
  });

  return { nodes, edges };
}

const MindmapNode = memo(function MindmapNode({
  data,
  selected,
}: NodeProps<FlowNodeData>) {
  const [renameTitle, setRenameTitle] = useState(data.rawLabel);
  const [childTitle, setChildTitle] = useState("");
  const [childSummary, setChildSummary] = useState("");

  useEffect(() => {
    setRenameTitle(data.rawLabel);
  }, [data.rawLabel]);

  useEffect(() => {
    if (selected) return;
    setChildTitle("");
    setChildSummary("");
  }, [selected]);

  const summaryText = data.summary
    ? data.summary.length > 80
      ? `${data.summary.slice(0, 80)}...`
      : data.summary
    : null;
  const disableActions = !data.canStructuredEdit || data.isSubmitting;
  const canRename = !disableActions && renameTitle.trim().length > 0;
  const canAddChild = !disableActions && childTitle.trim().length > 0;

  return (
    <>
      <NodeToolbar
        isVisible={selected}
        position={Position.Top}
        offset={14}
        className="nodrag nopan nowheel"
      >
        <div className="w-[360px] rounded-xl border border-zinc-200 bg-white/95 p-2 shadow-lg backdrop-blur">
          <div className="flex items-center gap-2">
            <Input
              value={renameTitle}
              disabled={disableActions}
              className="nodrag nopan h-8 text-xs"
              placeholder="节点名称"
              onChange={(event) => setRenameTitle(event.target.value)}
            />
            <Button
              type="button"
              size="sm"
              className="nodrag nopan h-8 text-xs"
              disabled={!canRename}
              onClick={() => void data.onRenameNode(data.nodeId, renameTitle.trim())}
            >
              重命名
            </Button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Input
              value={childTitle}
              disabled={disableActions}
              className="nodrag nopan h-8 text-xs"
              placeholder="子节点名称"
              maxLength={60}
              onChange={(event) => setChildTitle(event.target.value)}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="nodrag nopan h-8 text-xs"
              disabled={!canAddChild}
              onClick={async () => {
                const ok = await data.onAddChildNode(
                  data.nodeId,
                  childTitle.trim(),
                  childSummary.trim()
                );
                if (!ok) return;
                setChildTitle("");
                setChildSummary("");
              }}
            >
              新增子节点
            </Button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Input
              value={childSummary}
              disabled={disableActions}
              className="nodrag nopan h-8 text-xs"
              placeholder="子节点说明（可选）"
              onChange={(event) => setChildSummary(event.target.value)}
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="nodrag nopan h-8 text-xs"
              disabled={disableActions || data.isRoot}
              onClick={() => void data.onDeleteNode(data.nodeId)}
            >
              删除节点
            </Button>
          </div>
        </div>
      </NodeToolbar>

      <div
        className={cn(
          "rounded-2xl border bg-white p-3 shadow-sm transition-colors",
          selected
            ? "border-emerald-600 bg-emerald-50/80"
            : "border-zinc-300 hover:border-zinc-400"
        )}
        style={{ width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
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
    </>
  );
});

export function MindmapCanvas({
  tree,
  selectedId,
  onSelectNode,
  canStructuredEdit,
  isSubmitting,
  onRenameNode,
  onAddChildNode,
  onDeleteNode,
  collapsedNodeIds = [],
}: MindmapCanvasProps) {
  const reactFlowRef = useRef<ReactFlowInstance | null>(null);
  const collapsedSet = useMemo(() => new Set(collapsedNodeIds), [collapsedNodeIds]);
  const flow = useMemo(
    () =>
      buildFlow(tree, collapsedSet, {
        canStructuredEdit,
        isSubmitting,
        onRenameNode,
        onAddChildNode,
        onDeleteNode,
      }),
    [
      tree,
      collapsedSet,
      canStructuredEdit,
      isSubmitting,
      onRenameNode,
      onAddChildNode,
      onDeleteNode,
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
      type: "smoothstep",
      style: { stroke: "#cbd5e1", strokeWidth: 1.8 },
      markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" },
    }),
    []
  );
  const nodeTypes = useMemo(() => ({ mindNode: MindmapNode }), []);

  const fitToView = useCallback(() => {
    reactFlowRef.current?.fitView({
      padding: 0.16,
      maxZoom: 1.15,
      duration: 280,
    });
  }, []);

  useEffect(() => {
    fitToView();
  }, [fitToView, nodes, flow.edges]);

  return (
    <div className="h-full min-h-0 w-full overflow-hidden rounded-none border-0 bg-white">
      <ReactFlow
        nodes={nodes}
        edges={flow.edges}
        nodeTypes={nodeTypes}
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
      >
        <Controls className="!shadow-md" position="bottom-left" />
        <Background color="#e2e8f0" gap={16} size={1} />
      </ReactFlow>
    </div>
  );
}
