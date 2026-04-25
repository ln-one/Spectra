"use client";

import { MindmapCanvas } from "./MindmapCanvas";
import type { MindNode } from "./types";

interface GraphSurfaceAdapterProps {
  tree: MindNode;
  mode: "preview" | "edit";
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

export function GraphSurfaceAdapter({
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
}: GraphSurfaceAdapterProps) {
  return (
    <div className="h-full min-h-0">
      <MindmapCanvas
        tree={tree}
        mode={mode}
        selectedId={selectedId}
        onSelectNode={onSelectNode}
        onCanvasClick={onCanvasClick}
        canStructuredEdit={canStructuredEdit}
        isSubmitting={isSubmitting}
        onRequestRename={onRequestRename}
        onRequestAddChild={onRequestAddChild}
        onRequestDelete={onRequestDelete}
        collapsedNodeIds={collapsedNodeIds}
      />
    </div>
  );
}
