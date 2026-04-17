"use client";

import { useMemo } from "react";
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  MiniMap,
} from "reactflow";
import "reactflow/dist/style.css";
import type { Edge, Node } from "reactflow";
import type { MindNode } from "./types";

interface MindmapCanvasProps {
  tree: MindNode;
  selectedId: string;
  onSelectNode: (id: string) => void;
}

function buildFlow(root: MindNode) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  let rowCursor = 0;

  const walk = (node: MindNode, depth: number, parentId?: string) => {
    const currentY = rowCursor * 120;
    rowCursor += 1;
    nodes.push({
      id: node.id,
      position: { x: depth * 260, y: currentY },
      data: { label: node.label },
      type: "default",
      draggable: false,
      selectable: true,
    });
    if (parentId) {
      edges.push({
        id: `${parentId}-${node.id}`,
        source: parentId,
        target: node.id,
        markerEnd: { type: MarkerType.ArrowClosed },
      });
    }
    (node.children ?? []).forEach((child) => walk(child, depth + 1, node.id));
  };

  walk(root, 0);
  return { nodes, edges };
}

export function MindmapCanvas({
  tree,
  selectedId,
  onSelectNode,
}: MindmapCanvasProps) {
  const flow = useMemo(() => buildFlow(tree), [tree]);
  const nodes = useMemo(
    () =>
      flow.nodes.map((node) => ({
        ...node,
        selected: node.id === selectedId,
        style:
        node.id === selectedId
          ? {
              border: "2px solid #0f766e",
              background: "#ecfdf5",
              borderRadius: 16,
              padding: 8,
            }
          : {
              border: "1px solid rgba(82,82,91,0.35)",
              background: "#fff",
              borderRadius: 16,
              padding: 8,
            },
      })),
    [flow.nodes, selectedId]
  );
  const edges = flow.edges;

  return (
    <div className="h-[420px] rounded-xl border border-zinc-200 bg-white">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        nodesDraggable={false}
        elementsSelectable
        onNodeClick={(_, node) => onSelectNode(node.id)}
      >
        <MiniMap pannable zoomable />
        <Controls showInteractive={false} />
        <Background />
      </ReactFlow>
    </div>
  );
}
