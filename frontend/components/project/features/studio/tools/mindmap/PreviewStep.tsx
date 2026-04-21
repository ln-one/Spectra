import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Network, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { ToolFlowContext } from "../types";
import { GraphSurfaceAdapter } from "./GraphSurfaceAdapter";
import type { MindNode } from "./types";

interface PreviewStepProps {
  mode: "preview" | "edit";
  selectedId: string;
  lastGeneratedAt: string | null;
  flowContext?: ToolFlowContext;
  onSelectNode: (id: string) => void;
}

type ActionDialog =
  | { type: "edit"; nodeId: string }
  | { type: "add-child"; nodeId: string }
  | null;

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
  if (nested && (nested.children?.length ?? 0) > 0) return nested;
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
  mode,
  selectedId,
  lastGeneratedAt: _lastGeneratedAt,
  flowContext,
  onSelectNode,
}: PreviewStepProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [actionDialog, setActionDialog] = useState<ActionDialog>(null);
  const [pendingDeleteNodeId, setPendingDeleteNodeId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [childTitle, setChildTitle] = useState("");
  const [childSummary, setChildSummary] = useState("");

  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const childTitleInputRef = useRef<HTMLInputElement | null>(null);

  const activeTree = useMemo(() => extractBackendTree(flowContext), [flowContext]);
  const selectedNode = useMemo(() => {
    if (!activeTree) return null;
    return findNodeById(activeTree, selectedId || activeTree.id) ?? activeTree;
  }, [activeTree, selectedId]);

  const activeDialogNode = useMemo(() => {
    if (!activeTree || !actionDialog) return null;
    return findNodeById(activeTree, actionDialog.nodeId);
  }, [actionDialog, activeTree]);

  const pendingDeleteNode = useMemo(() => {
    if (!activeTree || !pendingDeleteNodeId) return null;
    return findNodeById(activeTree, pendingDeleteNodeId);
  }, [activeTree, pendingDeleteNodeId]);

  useEffect(() => {
    if (actionDialog?.type === "edit" && activeDialogNode) {
      setEditTitle(activeDialogNode.label);
      setEditSummary(activeDialogNode.summary ?? "");
    }
  }, [actionDialog, activeDialogNode]);

  useEffect(() => {
    if (!actionDialog || actionDialog.type !== "add-child") return;
    setChildTitle("");
    setChildSummary("");
  }, [actionDialog]);

  useEffect(() => {
    if (!actionDialog) return;
    const frame = requestAnimationFrame(() => {
      if (actionDialog.type === "edit") {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      } else {
        childTitleInputRef.current?.focus();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [actionDialog]);

  const artifactId = flowContext?.resolvedArtifact?.artifactId ?? null;
  const canStructuredEdit = Boolean(
    activeTree &&
      artifactId &&
      typeof flowContext?.onStructuredRefineArtifact === "function"
  );
  const closeTransientUi = useCallback(() => {
    setActionDialog(null);
    setPendingDeleteNodeId(null);
  }, []);

  useEffect(() => {
    setSubmitError("");
    if (mode === "preview") {
      closeTransientUi();
    }
  }, [closeTransientUi, mode]);

  const handleCanvasClick = useCallback(() => {
    if (activeTree) {
      onSelectNode(activeTree.id);
    }
    closeTransientUi();
    setSubmitError("");
  }, [activeTree, closeTransientUi, onSelectNode]);

  const openEditDialog = useCallback(
    (nodeId: string) => {
      if (!activeTree || mode !== "edit") return;
      const node = findNodeById(activeTree, nodeId);
      if (!node) return;
      onSelectNode(node.id);
      setEditTitle(node.label);
      setEditSummary(node.summary ?? "");
      setActionDialog({ type: "edit", nodeId: node.id });
      setSubmitError("");
    },
    [activeTree, mode, onSelectNode]
  );

  const openAddChildDialog = useCallback(
    (nodeId: string) => {
      if (!activeTree || mode !== "edit") return;
      const node = findNodeById(activeTree, nodeId);
      if (!node) return;
      onSelectNode(node.id);
      setChildTitle("");
      setChildSummary("");
      setActionDialog({ type: "add-child", nodeId: node.id });
      setSubmitError("");
    },
    [activeTree, mode, onSelectNode]
  );

  const openDeleteDialog = useCallback(
    (nodeId: string) => {
      if (!activeTree || mode !== "edit") return;
      const node = findNodeById(activeTree, nodeId);
      if (!node) return;
      onSelectNode(node.id);
      setPendingDeleteNodeId(node.id);
      setSubmitError("");
    },
    [activeTree, mode, onSelectNode]
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
        closeTransientUi();
        return {
          ok: true,
          insertedNodeId: result.insertedNodeId ?? null,
        };
      } finally {
        setIsSubmitting(false);
      }
    },
    [artifactId, closeTransientUi, flowContext]
  );

  const handleEditSubmit = useCallback(async () => {
    if (!activeDialogNode) return false;
    const normalized = editTitle.trim();
    if (!normalized) {
      setSubmitError("请输入新的节点名称。");
      return false;
    }
    const result = await submitStructuredRefine({
      targetNode: activeDialogNode,
      message: normalized,
      config: {
        node_operation: "edit",
        manual_node_summary: editSummary.trim() || undefined,
      },
    });
    if (!result.ok) return false;
    onSelectNode(activeDialogNode.id);
    return true;
  }, [activeDialogNode, editSummary, editTitle, onSelectNode, submitStructuredRefine]);

  const handleAddChildSubmit = useCallback(async () => {
    if (!activeDialogNode) return false;
    const normalizedTitle = childTitle.trim();
    if (!normalizedTitle) {
      setSubmitError("请输入子节点名称。");
      return false;
    }
    if (normalizedTitle.length > 60) {
      setSubmitError("子节点名称不能超过 60 个字符。");
      return false;
    }

    const result = await submitStructuredRefine({
      targetNode: activeDialogNode,
      message: normalizedTitle,
      config: {
        manual_child_summary: childSummary.trim() || undefined,
      },
    });
    if (!result.ok) return false;
    onSelectNode(result.insertedNodeId || activeDialogNode.id);
    return true;
  }, [activeDialogNode, childSummary, childTitle, onSelectNode, submitStructuredRefine]);

  const handleDeleteSubmit = useCallback(async () => {
    if (!pendingDeleteNode) return false;
    if (!pendingDeleteNode.parentId || pendingDeleteNode.parentId === pendingDeleteNode.id) {
      setSubmitError("根节点不可删除。");
      return false;
    }

    const result = await submitStructuredRefine({
      targetNode: pendingDeleteNode,
      message: pendingDeleteNode.label,
      config: {
        node_operation: "delete",
      },
    });
    if (!result.ok) return false;
    onSelectNode(pendingDeleteNode.parentId || activeTree?.id || pendingDeleteNode.id);
    return true;
  }, [activeTree?.id, onSelectNode, pendingDeleteNode, submitStructuredRefine]);

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
    <>
      <div className="flex h-full min-h-0 flex-col">
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <GraphSurfaceAdapter
            tree={activeTree}
            mode={mode}
            selectedId={selectedNode?.id || activeTree.id}
            onSelectNode={onSelectNode}
            onCanvasClick={handleCanvasClick}
            canStructuredEdit={canStructuredEdit}
            isSubmitting={isSubmitting}
            onRequestRename={openEditDialog}
            onRequestAddChild={openAddChildDialog}
            onRequestDelete={openDeleteDialog}
          />

          {submitError ? (
            <div className="pointer-events-none absolute inset-x-4 bottom-4 z-20">
              <p className="inline-flex rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs text-rose-700 shadow-sm">
                {submitError}
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <Dialog
        open={Boolean(actionDialog)}
        onOpenChange={(open) => {
          if (!open) setActionDialog(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          {actionDialog?.type === "edit" && activeDialogNode ? (
            <>
              <DialogHeader>
                <DialogTitle>编辑当前节点</DialogTitle>
                <DialogDescription>
                  当前节点：{activeDialogNode.label}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <Input
                  ref={renameInputRef}
                  value={editTitle}
                  disabled={!canStructuredEdit || isSubmitting}
                  placeholder="输入新的节点名称"
                  onChange={(event) => setEditTitle(event.target.value)}
                />
                <Textarea
                  value={editSummary}
                  disabled={!canStructuredEdit || isSubmitting}
                  className="min-h-[120px] resize-y"
                  placeholder="节点说明（可选）"
                  onChange={(event) => setEditSummary(event.target.value)}
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActionDialog(null)}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  disabled={!canStructuredEdit || isSubmitting || editTitle.trim().length === 0}
                  onClick={() => void handleEditSubmit()}
                >
                  {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  保存修改
                </Button>
              </DialogFooter>
            </>
          ) : null}

          {actionDialog?.type === "add-child" && activeDialogNode ? (
            <>
              <DialogHeader>
                <DialogTitle>新增子节点</DialogTitle>
                <DialogDescription>
                  将在“{activeDialogNode.label}”下添加新分支。
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <Input
                  ref={childTitleInputRef}
                  value={childTitle}
                  disabled={!canStructuredEdit || isSubmitting}
                  maxLength={60}
                  placeholder="子节点名称"
                  onChange={(event) => setChildTitle(event.target.value)}
                />
                <Textarea
                  value={childSummary}
                  disabled={!canStructuredEdit || isSubmitting}
                  className="min-h-[120px] resize-y"
                  placeholder="子节点说明（可选）"
                  onChange={(event) => setChildSummary(event.target.value)}
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActionDialog(null)}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  disabled={!canStructuredEdit || isSubmitting || childTitle.trim().length === 0}
                  onClick={() => void handleAddChildSubmit()}
                >
                  {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  确认新增
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(pendingDeleteNodeId)}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteNodeId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除当前节点？</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteNode
                ? `删除“${pendingDeleteNode.label}”后，它下面的所有子分支也会一起移除。`
                : "删除后当前节点及其子分支都会被移除。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={
                !canStructuredEdit ||
                isSubmitting ||
                !pendingDeleteNode ||
                !pendingDeleteNode.parentId ||
                pendingDeleteNode.parentId === pendingDeleteNode.id
              }
              onClick={(event) => {
                event.preventDefault();
                void handleDeleteSubmit();
              }}
            >
              {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
