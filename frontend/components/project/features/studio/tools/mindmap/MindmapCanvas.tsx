import { useMemo, useState } from "react";
import { Minus, Plus, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MindNode } from "./types";

interface MindmapCanvasProps {
  tree: MindNode;
  selectedId: string;
  onSelectNode: (id: string) => void;
}

interface PositionedNode {
  id: string;
  label: string;
  x: number;
  y: number;
}

interface Link {
  from: { x: number; y: number };
  to: { x: number; y: number };
}

interface MindmapLayout {
  nodes: PositionedNode[];
  links: Link[];
  width: number;
  height: number;
}

const MIN_SCALE = 0.55;
const MAX_SCALE = 1.75;
const LEVEL_GAP = 220;
const ROW_GAP = 72;

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

function nodeWidth(label: string): number {
  return Math.min(220, Math.max(90, label.length * 12 + 26));
}

function buildLayout(root: MindNode): MindmapLayout {
  let rowCursor = 0;
  let maxDepth = 0;
  const nodes: PositionedNode[] = [];
  const links: Link[] = [];

  const walk = (
    node: MindNode,
    depth: number,
    parent: { x: number; y: number } | null
  ): { x: number; y: number } => {
    maxDepth = Math.max(maxDepth, depth);
    const x = depth * LEVEL_GAP;
    const children = node.children ?? [];

    if (children.length === 0) {
      const y = rowCursor * ROW_GAP;
      rowCursor += 1;
      const current = { x, y };
      nodes.push({ id: node.id, label: node.label, ...current });
      if (parent) {
        links.push({ from: parent, to: current });
      }
      return current;
    }

    const childCenters = children.map((child) => walk(child, depth + 1, null));
    const y =
      childCenters.reduce((sum, item) => sum + item.y, 0) / childCenters.length;
    const current = { x, y };
    nodes.push({ id: node.id, label: node.label, ...current });
    if (parent) {
      links.push({ from: parent, to: current });
    }
    childCenters.forEach((childCenter) => {
      links.push({ from: current, to: childCenter });
    });
    return current;
  };

  walk(root, 0, null);

  return {
    nodes,
    links,
    width: Math.max((maxDepth + 1) * LEVEL_GAP + 180, 560),
    height: Math.max(rowCursor * ROW_GAP + 100, 260),
  };
}

export function MindmapCanvas({
  tree,
  selectedId,
  onSelectNode,
}: MindmapCanvasProps) {
  const layout = useMemo(() => buildLayout(tree), [tree]);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 60, y: 42 });
  const [dragState, setDragState] = useState<{
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);

  const handleZoom = (next: number) => {
    setScale(clampScale(next));
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-2">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <p className="text-[11px] text-zinc-500">
          拖拽平移，滚轮缩放，点击节点后可在 Chat 里继续扩展
        </p>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => handleZoom(scale - 0.12)}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => handleZoom(scale + 0.12)}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => {
              setScale(1);
              setOffset({ x: 60, y: 42 });
            }}
          >
            <ScanLine className="mr-1 h-3.5 w-3.5" />
            重置
          </Button>
        </div>
      </div>
      <svg
        className="h-[340px] w-full cursor-grab rounded-lg border border-zinc-200 bg-zinc-50/70 active:cursor-grabbing"
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        onWheel={(event) => {
          event.preventDefault();
          const svg = event.currentTarget;
          const rect = svg.getBoundingClientRect();
          const px = event.clientX - rect.left;
          const py = event.clientY - rect.top;
          const nextScale = clampScale(
            scale * (event.deltaY < 0 ? 1.08 : 1 / 1.08)
          );
          const worldX = (px - offset.x) / scale;
          const worldY = (py - offset.y) / scale;
          setScale(nextScale);
          setOffset({
            x: px - worldX * nextScale,
            y: py - worldY * nextScale,
          });
        }}
        onPointerDown={(event) => {
          if (event.target !== event.currentTarget) {
            return;
          }
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragState({
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
          });
        }}
        onPointerMove={(event) => {
          if (!dragState || dragState.pointerId !== event.pointerId) {
            return;
          }
          const dx = event.clientX - dragState.x;
          const dy = event.clientY - dragState.y;
          setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
          setDragState({
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
          });
        }}
        onPointerUp={(event) => {
          if (dragState?.pointerId === event.pointerId) {
            setDragState(null);
          }
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
      >
        <g transform={`translate(${offset.x} ${offset.y}) scale(${scale})`}>
          {layout.links.map((link, index) => {
            const controlOffset = Math.abs(link.to.x - link.from.x) * 0.44;
            const path = `M ${link.from.x} ${link.from.y} C ${link.from.x + controlOffset} ${link.from.y}, ${link.to.x - controlOffset} ${link.to.y}, ${link.to.x} ${link.to.y}`;
            return (
              <path
                key={`${index}-${link.from.x}-${link.to.x}`}
                d={path}
                fill="none"
                stroke="rgba(20, 184, 166, 0.45)"
                strokeWidth={2}
              />
            );
          })}

          {layout.nodes.map((node) => {
            const isSelected = node.id === selectedId;
            const width = nodeWidth(node.label);
            return (
              <g
                key={node.id}
                transform={`translate(${node.x} ${node.y})`}
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectNode(node.id);
                }}
                className="cursor-pointer"
              >
                {isSelected ? (
                  <rect
                    x={-width / 2 - 8}
                    y={-26}
                    width={width + 16}
                    height={52}
                    rx={16}
                    fill="rgba(20, 184, 166, 0.12)"
                    stroke="rgba(13, 148, 136, 0.38)"
                    strokeWidth={1.4}
                  />
                ) : null}
                <rect
                  x={-width / 2}
                  y={-18}
                  width={width}
                  height={36}
                  rx={10}
                  fill={isSelected ? "rgba(20, 184, 166, 0.24)" : "white"}
                  stroke={isSelected ? "#0f766e" : "rgba(82, 82, 91, 0.35)"}
                  strokeWidth={isSelected ? 2.8 : 1.2}
                />
                {isSelected ? (
                  <circle cx={0} cy={-24} r={4.5} fill="#0f766e" />
                ) : null}
                <text
                  x={0}
                  y={4}
                  textAnchor="middle"
                  fontSize={isSelected ? 12.5 : 12}
                  fontWeight={isSelected ? 700 : 500}
                  fill={isSelected ? "#115e59" : "#334155"}
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
