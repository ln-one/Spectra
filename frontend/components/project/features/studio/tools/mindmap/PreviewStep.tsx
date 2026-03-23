import { BookText, CircleCheck, Download, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CapabilityNotice, FallbackPreviewHint } from "../CapabilityNotice";
import type { ToolFlowContext } from "../types";
import { MindmapCanvas } from "./MindmapCanvas";
import type { MindNode } from "./types";

interface PreviewStepProps {
  tree: MindNode;
  selectedId: string;
  selectedNodeLabel: string;
  totalNodeCount: number;
  lastGeneratedAt: string | null;
  flowContext?: ToolFlowContext;
  onSelectNode: (id: string) => void;
  onRegenerate: () => void;
  onInjectChildren: () => void;
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

function extractBackendTree(content: unknown): MindNode | null {
  if (!content || typeof content !== "object") return null;
  const obj = content as Record<string, unknown>;
  const nodes = obj.nodes;
  if (!Array.isArray(nodes) || nodes.length === 0) return null;

  const nested = toMindNode(nodes[0]);
  if (nested && nested.children && nested.children.length > 0) {
    return nested;
  }
  return buildTreeFromFlatNodes(nodes as Array<Record<string, unknown>>);
}

function countTreeNodes(node: MindNode): number {
  return (
    1 +
    (node.children ?? []).reduce((acc, child) => acc + countTreeNodes(child), 0)
  );
}

export function PreviewStep({
  tree,
  selectedId,
  selectedNodeLabel,
  totalNodeCount,
  lastGeneratedAt,
  flowContext,
  onSelectNode,
  onRegenerate,
  onInjectChildren,
}: PreviewStepProps) {
  const capabilityStatus =
    flowContext?.capabilityStatus ?? "backend_placeholder";
  const capabilityReason =
    flowContext?.capabilityReason ??
    "未获取到后端导图内容，已回退前端示意内容。";

  let backendTree: MindNode | null = null;
  if (
    capabilityStatus === "backend_ready" &&
    flowContext?.resolvedArtifact?.contentKind === "json"
  ) {
    backendTree = extractBackendTree(flowContext.resolvedArtifact.content);
  }

  const shouldShowFallback = capabilityStatus !== "backend_ready";
  const activeTree = backendTree ?? tree;
  const activeSelectedId = backendTree ? backendTree.id : selectedId;
  const activeSelectedLabel = backendTree
    ? backendTree.label
    : selectedNodeLabel;
  const activeNodeCount = backendTree
    ? countTreeNodes(backendTree)
    : totalNodeCount;

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-3">
        <CapabilityNotice status={capabilityStatus} reason={capabilityReason} />
        {shouldShowFallback ? (
          <div className="mt-3">
            <FallbackPreviewHint />
          </div>
        ) : null}

        <div className="mt-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <CircleCheck className="h-4 w-4 text-emerald-600" />
            <div>
              <p className="text-xs font-semibold text-zinc-800">
                导图预览（面板内）
              </p>
              <p className="mt-1 text-[11px] text-zinc-500">
                {lastGeneratedAt
                  ? `最近一次生成：${new Date(lastGeneratedAt).toLocaleString()}`
                  : "当前展示的是生成后的导图结构。"}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={onRegenerate}
          >
            重新生成
          </Button>
        </div>

        <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[11px] text-zinc-600">
              <GitBranch className="h-3.5 w-3.5" />
              <span>节点总数：{activeNodeCount}</span>
              <span>当前选中：{activeSelectedLabel}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={onInjectChildren}
              disabled={!shouldShowFallback}
            >
              为当前节点补充分支
            </Button>
          </div>
          <MindmapCanvas
            tree={activeTree}
            selectedId={activeSelectedId}
            onSelectNode={onSelectNode}
          />
          <p className="mt-3 text-[11px] text-zinc-500">
            提示：选中节点后，可在右上角 Chat 输入“把这个点再展开两层”继续细化。
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <BookText className="h-4 w-4 text-zinc-600" />
            <p className="text-xs font-semibold text-zinc-800">最近生成成果</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-zinc-600"
            onClick={() => void flowContext?.onRefine?.()}
            disabled={!flowContext?.canRefine}
          >
            继续润色
          </Button>
        </div>
        <div className="mt-2 space-y-2">
          {flowContext?.latestArtifacts &&
          flowContext.latestArtifacts.length > 0 ? (
            flowContext.latestArtifacts.slice(0, 4).map((item) => (
              <div
                key={item.artifactId}
                className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-zinc-800">
                    {item.title}
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    {new Date(item.createdAt).toLocaleString()} · {item.status}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 text-xs"
                  onClick={() =>
                    void flowContext.onExportArtifact?.(item.artifactId)
                  }
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  下载
                </Button>
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-3 text-[11px] text-zinc-500">
              还没有历史成果。生成完成后会自动出现在这里，方便你随时下载。
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
