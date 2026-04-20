import { useCallback, useMemo, useState } from "react";
import { Network } from "lucide-react";
import type { ToolFlowContext } from "../types";
import { GraphSurfaceAdapter } from "./GraphSurfaceAdapter";
import type { MindNode } from "./types";

interface PreviewStepProps {
  selectedId: string;
  lastGeneratedAt: string | null;
  flowContext?: ToolFlowContext;
  onSelectNode: (id: string) => void;
}

function normalizeLabel(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return fallback;
}

function toMindNode(raw: unknown, parentId: string | null = null): MindNode | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const id = normalizeLabel(obj.id, "node");
  const label = normalizeLabel(obj.title ?? obj.label, id);
  const childrenRaw = Array.isArray(obj.children) ? obj.children : [];
  const children = childrenRaw
    .map((item) => toMindNode(item, id))
    .filter((item): item is MindNode => Boolean(item));
  return {
    id,
    label,
    parentId:
      typeof obj.parent_id === "string" && obj.parent_id.trim()
        ? obj.parent_id.trim()
        : parentId,
    summary:
      typeof obj.summary === "string" && obj.summary.trim()
        ? obj.summary.trim()
        : undefined,
    children,
  };
}

function buildTreeFromFlatNodes(nodes: Array<Record<string, unknown>>): MindNode | null {
  if (nodes.length === 0) return null;

  const nodeMap = new Map<string, MindNode>();
  const parentMap = new Map<string, string | null>();

  nodes.forEach((node, index) => {
    const id = normalizeLabel(node.id, `node-${index + 1}`);
    nodeMap.set(id, {
      id,
      label: normalizeLabel(node.title ?? node.label, id),
      parentId:
        typeof node.parent_id === "string" && node.parent_id.trim()
          ? node.parent_id.trim()
          : null,
      summary:
        typeof node.summary === "string" && node.summary.trim()
          ? node.summary.trim()
          : undefined,
      children: [],
    });
    parentMap.set(
      id,
      typeof node.parent_id === "string" && node.parent_id.trim()
        ? node.parent_id
        : null
    );
  });

  let root: MindNode | null = null;
  for (const [id, currentNode] of nodeMap.entries()) {
    const parentId = parentMap.get(id);
    if (!parentId || !nodeMap.has(parentId)) {
      root = root ?? currentNode;
      continue;
    }
    nodeMap.get(parentId)?.children?.push(currentNode);
  }

  return root;
}

function extractBackendTree(flowContext?: ToolFlowContext): MindNode | null {
  if (!flowContext?.resolvedArtifact) return null;
  if (flowContext.resolvedArtifact.contentKind !== "json") return null;
  const content = flowContext.resolvedArtifact.content;
  if (!content || typeof content !== "object") return null;
  const row = content as Record<string, unknown>;
  const nodes = row.nodes;
  if (!Array.isArray(nodes) || nodes.length === 0) return null;
  const nested = toMindNode(nodes[0]);
  if (nested && (nested.children?.length ?? 0) > 0) {
    return nested;
  }
  return buildTreeFromFlatNodes(nodes as Array<Record<string, unknown>>);
}

function findNodeById(node: MindNode, id: string): MindNode | null {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const matched = findNodeById(child, id);
    if (matched) return matched;
  }
  return null;
}

export function PreviewStep({
  selectedId,
  lastGeneratedAt: _lastGeneratedAt,
  flowContext,
  onSelectNode,
}: PreviewStepProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const activeTree = useMemo(() => extractBackendTree(flowContext), [flowContext]);
  const selectedNode = useMemo(() => {
    if (!activeTree) return null;
    return findNodeById(activeTree, selectedId || activeTree.id) ?? activeTree;
  }, [activeTree, selectedId]);

  const artifactId = flowContext?.resolvedArtifact?.artifactId ?? null;
  const canStructuredEdit = Boolean(
    activeTree &&
      artifactId &&
      typeof flowContext?.onStructuredRefineArtifact === "function"
  );

  const submitStructuredRefine = useCallback(
    async (payload: {
      targetNode: MindNode;
      message: string;
      config: Record<string, unknown>;
    }) => {
      if (!artifactId || !flowContext?.onStructuredRefineArtifact) {
        setSubmitError("当前导图不可编辑，请刷新后重试。");
        return { ok: false, insertedNodeId: null as string | null };
      }

      setSubmitError("");
      setIsSubmitting(true);
      try {
        const result = await flowContext.onStructuredRefineArtifact({
          artifactId,
          message: payload.message,
          refineMode: "structured_refine",
          selectionAnchor: {
            scope: "node",
            anchor_id: payload.targetNode.id,
            artifact_id: artifactId,
            label: payload.targetNode.label,
          },
          config: {
            selected_node_path: payload.targetNode.id,
            ...payload.config,
          },
        });
        if (!result.ok) {
          setSubmitError("节点操作失败，请根据错误提示重试。");
          return { ok: false, insertedNodeId: null as string | null };
        }
        return {
          ok: true,
          insertedNodeId: result.insertedNodeId ?? null,
        };
      } finally {
        setIsSubmitting(false);
      }
    },
    [artifactId, flowContext]
  );

  const onRenameNode = useCallback(
    async (nodeId: string, nextLabel: string) => {
      if (!activeTree) return false;
      const normalized = nextLabel.trim();
      if (!normalized) {
        setSubmitError("请输入新的节点名称。");
        return false;
      }
      const targetNode = findNodeById(activeTree, nodeId);
      if (!targetNode) {
        setSubmitError("未定位到目标节点，请重新选择后再试。");
        return false;
      }

      const result = await submitStructuredRefine({
        targetNode,
        message: normalized,
        config: {
          node_operation: "rename",
        },
      });
      if (!result.ok) return false;
      onSelectNode(targetNode.id);
      return true;
    },
    [activeTree, onSelectNode, submitStructuredRefine]
  );

  const onAddChildNode = useCallback(
    async (nodeId: string, childTitle: string, childSummary: string) => {
      if (!activeTree) return false;
      const normalizedTitle = childTitle.trim();
      if (!normalizedTitle) {
        setSubmitError("请输入子节点名称。");
        return false;
      }
      if (normalizedTitle.length > 60) {
        setSubmitError("子节点名称不能超过 60 个字符。");
        return false;
      }
      const targetNode = findNodeById(activeTree, nodeId);
      if (!targetNode) {
        setSubmitError("未定位到目标节点，请重新选择后再试。");
        return false;
      }

      const result = await submitStructuredRefine({
        targetNode,
        message: normalizedTitle,
        config: {
          manual_child_summary: childSummary.trim() || undefined,
        },
      });
      if (!result.ok) return false;
      onSelectNode(result.insertedNodeId || targetNode.id);
      return true;
    },
    [activeTree, onSelectNode, submitStructuredRefine]
  );

  const onDeleteNode = useCallback(
    async (nodeId: string) => {
      if (!activeTree) return false;
      const targetNode = findNodeById(activeTree, nodeId);
      if (!targetNode) {
        setSubmitError("未定位到目标节点，请重新选择后再试。");
        return false;
      }
      if (!targetNode.parentId || targetNode.parentId === targetNode.id) {
        setSubmitError("根节点不可删除。");
        return false;
      }

      const result = await submitStructuredRefine({
        targetNode,
        message: targetNode.label,
        config: {
          node_operation: "delete",
        },
      });
      if (!result.ok) return false;
      onSelectNode(targetNode.parentId || activeTree.id);
      return true;
    },
    [activeTree, onSelectNode, submitStructuredRefine]
  );

  if (!activeTree) {
    return (
      <div className="h-full min-h-0 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-12 text-center">
        <Network className="mx-auto h-8 w-8 text-zinc-400" />
        <p className="mt-3 text-sm font-medium text-zinc-700">暂未收到后端真实导图</p>
        <p className="mt-1 text-[11px] text-zinc-500">
          {flowContext?.capabilityReason || "等待后端返回 nodes 后会自动加载到工作面。"}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <GraphSurfaceAdapter
          tree={activeTree}
          selectedId={selectedNode?.id || activeTree.id}
          onSelectNode={onSelectNode}
          canStructuredEdit={canStructuredEdit}
          isSubmitting={isSubmitting}
          onRenameNode={onRenameNode}
          onAddChildNode={onAddChildNode}
          onDeleteNode={onDeleteNode}
        />
      </div>
      {submitError ? (
        <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {submitError}
        </p>
      ) : null}
    </div>
  );
}
