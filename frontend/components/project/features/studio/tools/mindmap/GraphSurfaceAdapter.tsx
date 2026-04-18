"use client";

import { Network } from "lucide-react";
import { MindmapCanvas } from "./MindmapCanvas";
import type { MindNode } from "./types";

interface GraphSurfaceAdapterProps {
  tree: MindNode;
  selectedId: string;
  onSelectNode: (id: string) => void;
  collapsedNodeIds?: string[];
}

function countNodes(node: MindNode): number {
  return 1 + (node.children ?? []).reduce((sum, child) => sum + countNodes(child), 0);
}

export function GraphSurfaceAdapter({
  tree,
  selectedId,
  onSelectNode,
  collapsedNodeIds = [],
}: GraphSurfaceAdapterProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-900">导图工作面</p>
          <p className="mt-1 text-[11px] text-zinc-500">
            当前使用正式受控 graph surface，稳定展示真实节点树并支持节点选择。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-600">
            Stable graph surface
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
            <Network className="h-3.5 w-3.5" />
            {countNodes(tree)} nodes
          </span>
        </div>
      </div>
      <MindmapCanvas
        tree={tree}
        selectedId={selectedId}
        onSelectNode={onSelectNode}
        collapsedNodeIds={collapsedNodeIds}
      />
    </div>
  );
}
