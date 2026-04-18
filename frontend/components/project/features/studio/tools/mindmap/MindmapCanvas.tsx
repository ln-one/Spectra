"use client";

import { useMemo } from "react";
import type { MindNode } from "./types";

interface MindmapCanvasProps {
  tree: MindNode;
  selectedId: string;
  onSelectNode: (id: string) => void;
  collapsedNodeIds?: string[];
}

type LayoutNode = {
  id: string;
  label: string;
  summary?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId?: string | null;
  childCount: number;
};

const NODE_WIDTH = 240;
const NODE_HEIGHT = 92;
const X_GAP = 300;
const Y_GAP = 126;

function shouldHideNode(
  node: MindNode,
  collapsedNodeIds: Set<string>,
  ancestors: string[]
): boolean {
  return ancestors.some((ancestorId) => collapsedNodeIds.has(ancestorId));
}

function layoutMindTree(
  root: MindNode,
  collapsedNodeIds: Set<string>
): LayoutNode[] {
  const nodes: LayoutNode[] = [];
  let rowCursor = 0;

  const walk = (
    node: MindNode,
    depth: number,
    parentId?: string | null,
    ancestors: string[] = []
  ) => {
    if (shouldHideNode(node, collapsedNodeIds, ancestors)) {
      return;
    }
    const currentRow = rowCursor;
    rowCursor += 1;
    nodes.push({
      id: node.id,
      label: node.label,
      summary: node.summary,
      x: depth * X_GAP,
      y: currentRow * Y_GAP,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      parentId: parentId ?? null,
      childCount: node.children?.length ?? 0,
    });
    (node.children ?? []).forEach((child) =>
      walk(child, depth + 1, node.id, [...ancestors, node.id])
    );
  };

  walk(root, 0, null);
  return nodes;
}

export function MindmapCanvas({
  tree,
  selectedId,
  onSelectNode,
  collapsedNodeIds = [],
}: MindmapCanvasProps) {
  const collapsedSet = useMemo(() => new Set(collapsedNodeIds), [collapsedNodeIds]);
  const layoutNodes = useMemo(
    () => layoutMindTree(tree, collapsedSet),
    [tree, collapsedSet]
  );
  const nodeMap = useMemo(
    () => new Map(layoutNodes.map((node) => [node.id, node])),
    [layoutNodes]
  );
  const canvasWidth =
    Math.max(...layoutNodes.map((node) => node.x + node.width), 0) + 80;
  const canvasHeight =
    Math.max(...layoutNodes.map((node) => node.y + node.height), 0) + 80;

  return (
    <div className="overflow-auto rounded-xl border border-zinc-200 bg-[radial-gradient(circle_at_1px_1px,_rgba(148,163,184,0.22)_1px,_transparent_0)] [background-size:16px_16px] p-4">
      <svg
        width={Math.max(canvasWidth, 720)}
        height={Math.max(canvasHeight, 420)}
        viewBox={`0 0 ${Math.max(canvasWidth, 720)} ${Math.max(canvasHeight, 420)}`}
        className="min-h-[420px] min-w-full"
      >
        {layoutNodes.map((node) => {
          if (!node.parentId) return null;
          const parent = nodeMap.get(node.parentId);
          if (!parent) return null;
          return (
            <path
              key={`${parent.id}-${node.id}`}
              d={`M ${parent.x + parent.width} ${parent.y + parent.height / 2} C ${
                parent.x + parent.width + 56
              } ${parent.y + parent.height / 2}, ${node.x - 56} ${
                node.y + node.height / 2
              }, ${node.x} ${node.y + node.height / 2}`}
              fill="none"
              stroke="#cbd5e1"
              strokeWidth="2"
            />
          );
        })}

        {layoutNodes.map((node) => {
          const isSelected = node.id === selectedId;
          return (
            <g
              key={node.id}
              transform={`translate(${node.x}, ${node.y})`}
              className="cursor-pointer"
              onClick={() => onSelectNode(node.id)}
            >
              <rect
                width={node.width}
                height={node.height}
                rx="18"
                fill={isSelected ? "#ecfdf5" : "#ffffff"}
                stroke={isSelected ? "#047857" : "#d4d4d8"}
                strokeWidth={isSelected ? "2.5" : "1.5"}
                filter="drop-shadow(0 2px 6px rgba(15,23,42,0.06))"
              />
              <text
                x="18"
                y="28"
                fontSize="14"
                fontWeight="600"
                fill={isSelected ? "#065f46" : "#18181b"}
              >
                {node.label}
              </text>
              {node.summary ? (
                <text
                  x="18"
                  y="50"
                  fontSize="11"
                  fill="#52525b"
                >
                  {node.summary.length > 36
                    ? `${node.summary.slice(0, 36)}...`
                    : node.summary}
                </text>
              ) : null}
              <text x="18" y="72" fontSize="11" fill="#71717a">
                子节点：{node.childCount}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
