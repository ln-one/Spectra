"use client";

import { MindmapCanvas } from "./MindmapCanvas";
import type { MindNode } from "./types";

interface GraphSurfaceAdapterProps {
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

export function GraphSurfaceAdapter({
  tree,
  selectedId,
  onSelectNode,
  canStructuredEdit,
  isSubmitting,
  onRenameNode,
  onAddChildNode,
  onDeleteNode,
  collapsedNodeIds = [],
}: GraphSurfaceAdapterProps) {
  return (
    <div className="h-full min-h-0">
      <MindmapCanvas
        tree={tree}
        selectedId={selectedId}
        onSelectNode={onSelectNode}
        canStructuredEdit={canStructuredEdit}
        isSubmitting={isSubmitting}
        onRenameNode={onRenameNode}
        onAddChildNode={onAddChildNode}
        onDeleteNode={onDeleteNode}
        collapsedNodeIds={collapsedNodeIds}
      />
    </div>
  );
}
