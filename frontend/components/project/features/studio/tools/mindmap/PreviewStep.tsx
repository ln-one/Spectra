import { BookText, CircleCheck, Download, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ToolFlowContext } from "../types";
import { MindmapTreeList } from "./MindmapTreeList";
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
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-3">
        <div className="flex items-start justify-between gap-2">
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
              <span>节点总数：{totalNodeCount}</span>
              <span>当前选中：{selectedNodeLabel}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={onInjectChildren}
            >
              为当前节点补充子分支
            </Button>
          </div>
          <div className="space-y-1.5">
            <MindmapTreeList
              node={tree}
              selectedId={selectedId}
              onSelect={onSelectNode}
            />
          </div>
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
          {flowContext?.latestArtifacts && flowContext.latestArtifacts.length > 0 ? (
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
                  onClick={() => void flowContext.onExportArtifact?.(item.artifactId)}
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
