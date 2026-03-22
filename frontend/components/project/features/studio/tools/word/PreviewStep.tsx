import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BookText, CircleCheck, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ToolFlowContext } from "../types";

interface PreviewStepProps {
  markdown: string;
  isGenerating: boolean;
  lastGeneratedAt: string | null;
  flowContext?: ToolFlowContext;
  onRegenerate: () => void;
}

export function PreviewStep({
  markdown,
  isGenerating,
  lastGeneratedAt,
  flowContext,
  onRegenerate,
}: PreviewStepProps) {
  const hasProcessingArtifact = (flowContext?.latestArtifacts ?? []).some(
    (item) => item.status === "processing" || item.status === "pending"
  );

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <CircleCheck className="h-4 w-4 text-emerald-600" />
            <div>
              <p className="text-xs font-semibold text-zinc-800">
                文档预览（面板内）
              </p>
              <p className="mt-1 text-[11px] text-zinc-500">
                {lastGeneratedAt
                  ? `最近一次生成：${new Date(lastGeneratedAt).toLocaleString()}`
                  : "当前展示的是根据配置生成的文档草稿。"}
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

        {isGenerating || hasProcessingArtifact ? (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-700">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            文档正在生成中，完成后可下载最终文件。
          </div>
        ) : null}

        <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-4">
          <article className="prose prose-zinc max-w-none text-sm leading-6 prose-headings:mb-2 prose-headings:mt-4 prose-p:my-1">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {markdown}
            </ReactMarkdown>
          </article>
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
            在 Chat 中继续微调
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
              还没有历史成果。文档生成后会自动出现在这里，方便你随时下载。
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
