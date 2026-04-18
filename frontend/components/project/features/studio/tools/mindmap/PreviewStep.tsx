import { useMemo, useState } from "react";
import { Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArtifactWorkbenchShell } from "../ArtifactWorkbenchShell";
import type { ToolFlowContext } from "../types";
import { buildArtifactWorkbenchViewModel } from "../workbenchViewModel";
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

function buildTreeFromFlatNodes(
  nodes: Array<Record<string, unknown>>
): MindNode | null {
  if (nodes.length === 0) return null;

  const nodeMap = new Map<string, MindNode>();
  const parentMap = new Map<string, string | null>();

  nodes.forEach((node, index) => {
    const id = normalizeLabel(
      node.id,
      `node-${index + 1}`
    );
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

function countTreeNodes(node: MindNode): number {
  return (
    1 +
    (node.children ?? []).reduce((sum, child) => sum + countTreeNodes(child), 0)
  );
}

function findNodeById(node: MindNode, id: string): MindNode | null {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const matched = findNodeById(child, id);
    if (matched) return matched;
  }
  return null;
}

function flattenTree(node: MindNode): MindNode[] {
  return [node, ...(node.children ?? []).flatMap((child) => flattenTree(child))];
}

function countChildren(node: MindNode | null): number {
  return node?.children?.length ?? 0;
}

export function PreviewStep({
  selectedId,
  lastGeneratedAt,
  flowContext,
  onSelectNode,
}: PreviewStepProps) {
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [childTitle, setChildTitle] = useState("");
  const [childSummary, setChildSummary] = useState("");
  const [renameTitle, setRenameTitle] = useState("");
  const [reparentTargetId, setReparentTargetId] = useState("");
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const capabilityStatus =
    flowContext?.capabilityStatus ?? "backend_placeholder";
  const capabilityReason =
    flowContext?.capabilityReason ?? "正在等待后端返回真实导图结构。";
  const backendTree =
    capabilityStatus === "backend_ready"
      ? extractBackendTree(flowContext)
      : null;
  const activeTree = backendTree;
  const selectedNode = useMemo(() => {
    if (!activeTree) return null;
    return findNodeById(activeTree, selectedId || activeTree.id) ?? activeTree;
  }, [activeTree, selectedId]);
  const allNodes = useMemo(() => (activeTree ? flattenTree(activeTree) : []), [activeTree]);
  const artifactId = flowContext?.resolvedArtifact?.artifactId ?? null;
  const canAddChild = Boolean(
    activeTree &&
    artifactId &&
    typeof flowContext?.onStructuredRefineArtifact === "function"
  );
  const addChildDisabledReason = !activeTree
    ? "等待后端返回真实导图后才能编辑。"
    : !artifactId
      ? "当前未定位到可编辑的导图成果。"
      : !flowContext?.onStructuredRefineArtifact
        ? "当前导图未暴露结构化编辑能力。"
        : "";
  const viewModel = buildArtifactWorkbenchViewModel(
    flowContext,
    lastGeneratedAt,
    activeTree ? `已加载 ${countTreeNodes(activeTree)} 个节点的真实导图。` : "等待后端返回真实导图。"
  );

  const candidateParents = allNodes.filter(
    (node) => node.id !== (selectedNode?.id ?? "") && node.parentId !== selectedNode?.id
  );
  const isCollapsed = selectedNode ? collapsedNodeIds.includes(selectedNode.id) : false;

  const submitNodeOperation = async (
    operation: "rename" | "delete" | "reparent",
    message: string,
    extraConfig: Record<string, unknown> = {}
  ) => {
    if (!artifactId || !flowContext?.onStructuredRefineArtifact || !selectedNode) {
      setSubmitError("当前导图不可编辑，请刷新后重试。");
      return;
    }
    setSubmitError("");
    setIsSubmitting(true);
    try {
      const result = await flowContext.onStructuredRefineArtifact({
        artifactId,
        message,
        refineMode: "structured_refine",
        selectionAnchor: {
          scope: "node",
          anchor_id: selectedNode.id,
          artifact_id: artifactId,
          label: selectedNode.label,
        },
        config: {
          selected_node_path: selectedNode.id,
          node_operation: operation,
          ...extraConfig,
        },
      });
      if (!result.ok) {
        setSubmitError("节点操作失败，请根据错误提示重试。");
        return;
      }
      if (operation === "delete") {
        onSelectNode(selectedNode.parentId || activeTree?.id || selectedNode.id);
      } else {
        onSelectNode(selectedNode.id);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitAddChild = async () => {
    const title = childTitle.trim();
    const summary = childSummary.trim();

    if (!selectedNode) {
      setSubmitError("未定位到当前选中节点，请重新选择后再试。");
      return;
    }
    if (!title) {
      setSubmitError("请输入子节点名称。");
      return;
    }
    if (title.length > 60) {
      setSubmitError("子节点名称不能超过 60 个字符。");
      return;
    }
    if (!artifactId || !flowContext?.onStructuredRefineArtifact) {
      setSubmitError("当前导图不可编辑，请刷新后重试。");
      return;
    }

    setSubmitError("");
    setIsSubmitting(true);
    try {
      const result = await flowContext.onStructuredRefineArtifact({
        artifactId,
        message: title,
        refineMode: "structured_refine",
        selectionAnchor: {
          scope: "node",
          anchor_id: selectedNode.id,
          artifact_id: artifactId,
          label: selectedNode.label,
        },
        config: {
          selected_node_path: selectedNode.id,
          manual_child_summary: summary || undefined,
        },
      });
      if (!result.ok) {
        setSubmitError("子节点新增失败，请根据错误提示重试。");
        return;
      }
      if (result.insertedNodeId) {
        onSelectNode(result.insertedNodeId);
      }
      setChildTitle("");
      setChildSummary("");
      setIsAddFormOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ArtifactWorkbenchShell
      flowContext={{
        ...flowContext,
        capabilityStatus,
        capabilityReason,
      }}
      viewModel={viewModel}
      emptyState={
        <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-12 text-center">
          <Network className="mx-auto h-8 w-8 text-zinc-400" />
          <p className="mt-3 text-sm font-medium text-zinc-700">
            暂未收到后端真实导图
          </p>
          <p className="mt-1 text-[11px] text-zinc-500">
            当前不再渲染前端示意导图，等待后端 nodes 返回后会直接展示。
          </p>
        </div>
      }
    >
      {activeTree ? (
        <>
            <div className="mb-3 flex items-center gap-3 text-[11px] text-zinc-600">
              <span>当前根节点：{activeTree.label}</span>
            </div>
            <div className="mb-4 rounded-xl border border-zinc-200 bg-white/90 p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-zinc-900">
                    当前选中节点
                  </p>
                  <p className="text-sm text-zinc-700">
                    {selectedNode?.label ?? "未选中节点"}
                  </p>
                  {selectedNode?.summary ? (
                    <p className="text-xs leading-5 text-zinc-600">{selectedNode.summary}</p>
                  ) : null}
                  <p className="text-[11px] text-zinc-500">
                    点击节点后可新增、重命名、删除或调整其父节点，所有操作都只回写 tree truth。
                  </p>
                  {selectedNode ? (
                    <p className="text-[11px] text-zinc-500">
                      当前子节点数：{countChildren(selectedNode)} ·{" "}
                      {isCollapsed ? "当前已折叠" : "当前已展开"}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canAddChild || isSubmitting}
                  onClick={() => {
                    setSubmitError("");
                    setIsAddFormOpen((prev) => !prev);
                  }}
                  title={addChildDisabledReason || undefined}
                >
                  添加子节点
                </Button>
              </div>

              {isAddFormOpen ? (
                <div className="mt-3 space-y-3 border-t border-zinc-200 pt-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-zinc-700">
                      子节点名称
                    </label>
                    <Input
                      value={childTitle}
                      maxLength={60}
                      disabled={isSubmitting}
                      placeholder="例如：进程切换开销"
                      onChange={(event) => setChildTitle(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-zinc-700">
                      节点说明（可选）
                    </label>
                    <Textarea
                      value={childSummary}
                      disabled={isSubmitting}
                      placeholder="补充一句说明，后端会写入新节点摘要。"
                      onChange={(event) => setChildSummary(event.target.value)}
                    />
                  </div>
                  {submitError ? (
                    <p className="text-xs text-red-600">{submitError}</p>
                  ) : null}
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      disabled={!canAddChild || isSubmitting}
                      onClick={() => void handleSubmitAddChild()}
                    >
                      {isSubmitting ? "提交中..." : "确认新增"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        if (isSubmitting) return;
                        setIsAddFormOpen(false);
                        setSubmitError("");
                      }}
                    >
                      取消
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
            {selectedNode ? (
              <div className="mb-4 rounded-xl border border-zinc-200 bg-white/90 p-3">
                <div className="grid gap-3 lg:grid-cols-3">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-zinc-900">重命名节点</p>
                    <Input
                      value={renameTitle}
                      placeholder={selectedNode.label}
                      disabled={isSubmitting}
                      onChange={(event) => setRenameTitle(event.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSubmitting || !renameTitle.trim()}
                      onClick={() => void submitNodeOperation("rename", renameTitle.trim())}
                    >
                      保存名称
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-zinc-900">调整父节点</p>
                    <Select
                      value={reparentTargetId}
                      onValueChange={setReparentTargetId}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="选择新的父节点" />
                      </SelectTrigger>
                      <SelectContent>
                        {candidateParents.map((node) => (
                          <SelectItem key={node.id} value={node.id}>
                            {node.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSubmitting || !reparentTargetId}
                      onClick={() =>
                        void submitNodeOperation("reparent", selectedNode.label, {
                          new_parent_id: reparentTargetId,
                        })
                      }
                    >
                      调整父节点
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-zinc-900">删除节点</p>
                    <p className="text-[11px] text-zinc-500">
                      根节点不可删除，删除时会一并移除其子树。
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSubmitting || !selectedNode.parentId}
                      onClick={() => void submitNodeOperation("delete", selectedNode.label)}
                    >
                      删除当前节点
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={!selectedNode}
                      onClick={() =>
                        setCollapsedNodeIds((previous) =>
                          !selectedNode
                            ? previous
                            : previous.includes(selectedNode.id)
                              ? previous.filter((id) => id !== selectedNode.id)
                              : [...previous, selectedNode.id]
                        )
                      }
                    >
                      {isCollapsed ? "展开当前节点" : "折叠当前节点"}
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
            <GraphSurfaceAdapter
              tree={activeTree}
              selectedId={selectedId || activeTree.id}
              onSelectNode={onSelectNode}
              collapsedNodeIds={collapsedNodeIds}
            />
        </>
      ) : null}
    </ArtifactWorkbenchShell>
  );
}
