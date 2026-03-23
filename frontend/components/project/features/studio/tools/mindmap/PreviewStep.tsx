import { Network } from "lucide-react";
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
  if (nested && nested.children.length > 0) {
    return nested;
  }
  return buildTreeFromFlatNodes(nodes as Array<Record<string, unknown>>);
}

function countTreeNodes(node: MindNode): number {
  return (
    1 + node.children.reduce((sum, child) => sum + countTreeNodes(child), 0)
  );
}

export function PreviewStep({
  selectedId,
  lastGeneratedAt,
  flowContext,
  onSelectNode,
}: PreviewStepProps) {
  const capabilityStatus =
    flowContext?.capabilityStatus ?? "backend_placeholder";
  const capabilityReason =
    flowContext?.capabilityReason ?? "正在等待后端返回真实导图结构。";
  const backendTree =
    capabilityStatus === "backend_ready"
      ? extractBackendTree(flowContext)
      : null;
  const activeTree = backendTree;

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
