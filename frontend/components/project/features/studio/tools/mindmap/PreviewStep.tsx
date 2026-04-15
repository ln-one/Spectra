import { useMemo, useState } from "react";
import { Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CapabilityNotice } from "../CapabilityNotice";
import type { ToolFlowContext } from "../types";
import { MindmapCanvas } from "./MindmapCanvas";
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

function toMindNode(raw: unknown): MindNode | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const id = normalizeLabel(obj.id, "node");
  const label = normalizeLabel(obj.title ?? obj.label, id);
  const childrenRaw = Array.isArray(obj.children) ? obj.children : [];
  const children = childrenRaw
    .map((item) => toMindNode(item))
    .filter((item): item is MindNode => Boolean(item));
  return { id, label, children };
}

function buildTreeFromFlatNodes(
  nodes: Array<Record<string, unknown>>
): MindNode | null {
  if (nodes.length === 0) return null;

  const nodeMap = new Map<string, MindNode>();
  const parentMap = new Map<string, string | null>();

  for (const node of nodes) {
    const id = normalizeLabel(
      node.id,
      `node-${Math.random().toString(36).slice(2, 9)}`
    );
    nodeMap.set(id, {
      id,
      label: normalizeLabel(node.title ?? node.label, id),
      children: [],
    });
    parentMap.set(
      id,
      typeof node.parent_id === "string" && node.parent_id.trim()
        ? node.parent_id
        : null
    );
  }

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

export function PreviewStep({
  selectedId,
  lastGeneratedAt,
  flowContext,
  onSelectNode,
}: PreviewStepProps) {
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [childTitle, setChildTitle] = useState("");
  const [childSummary, setChildSummary] = useState("");
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
  const artifactId = flowContext?.resolvedArtifact?.artifactId ?? null;
  const canAddChild = Boolean(
    activeTree &&
    artifactId &&
    typeof flowContext?.onStructuredRefineArtifact === "function"
  );
  const addChildDisabledReason = !activeTree
    ? "等待后端返回真实导图后才能编辑。"
    : !artifactId
      ? "当前未定位到可编辑的导图 artifact。"
      : !flowContext?.onStructuredRefineArtifact
        ? "当前导图未暴露结构化编辑能力。"
        : "";

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
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <CapabilityNotice status={capabilityStatus} reason={capabilityReason} />

        <div className="mt-4">
          <p className="text-sm font-semibold text-zinc-900">实时导图预览</p>
          <p className="mt-1 text-[11px] text-zinc-500">
            {lastGeneratedAt
              ? `最近一次生成：${new Date(lastGeneratedAt).toLocaleString()}`
              : "这里只展示后端返回的真实思维导图。"}
          </p>
        </div>

        {activeTree ? (
          <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
            <div className="mb-3 flex items-center gap-3 text-[11px] text-zinc-600">
              <span>节点总数：{countTreeNodes(activeTree)}</span>
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
                  <p className="text-[11px] text-zinc-500">
                    点击节点后可在该节点下新增一个手工子节点，并写回后端导图
                    artifact。
                  </p>
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
            <MindmapCanvas
              tree={activeTree}
              selectedId={selectedId || activeTree.id}
              onSelectNode={onSelectNode}
            />
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-12 text-center">
            <Network className="mx-auto h-8 w-8 text-zinc-400" />
            <p className="mt-3 text-sm font-medium text-zinc-700">
              暂未收到后端真实导图
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              当前不再渲染前端示意导图，等待后端 nodes 返回后会直接展示。
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
