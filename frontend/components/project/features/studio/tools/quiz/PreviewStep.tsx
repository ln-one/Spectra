import { ClipboardList } from "lucide-react";
import { CapabilityNotice } from "../CapabilityNotice";
import type { ToolFlowContext } from "../types";

interface PreviewStepProps {
  lastGeneratedAt: string | null;
  flowContext?: ToolFlowContext;
}

interface BackendQuestionItem {
  id: string;
  question: string;
  options: string[];
}

function normalizeOptionLabel(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const row = value as Record<string, unknown>;
  if (typeof row.text === "string" && row.text.trim()) return row.text.trim();
  if (typeof row.label === "string" && row.label.trim()) return row.label.trim();
  if (typeof row.content === "string" && row.content.trim()) return row.content.trim();
  return "";
}

function parseBackendQuestions(flowContext?: ToolFlowContext): BackendQuestionItem[] {
  if (!flowContext?.resolvedArtifact) return [];
  if (flowContext.resolvedArtifact.contentKind !== "json") return [];
  if (!flowContext.resolvedArtifact.content || typeof flowContext.resolvedArtifact.content !== "object") {
    return [];
  }

  const content = flowContext.resolvedArtifact.content as Record<string, unknown>;
  const rawQuestions = Array.isArray(content.questions) ? content.questions : [];
  return rawQuestions
    .map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const question = typeof row.question === "string" ? row.question.trim() : "";
      const optionsRaw = Array.isArray(row.options) ? row.options : [];
      const options = optionsRaw.map((option) => normalizeOptionLabel(option)).filter(Boolean);
      if (!question) return null;
      return {
        id: typeof row.id === "string" ? row.id : `backend-q-${index + 1}`,
        question,
        options,
      };
    })
    .filter((item): item is BackendQuestionItem => Boolean(item));
}

export function PreviewStep({ lastGeneratedAt, flowContext }: PreviewStepProps) {
  const capabilityStatus = flowContext?.capabilityStatus ?? "backend_placeholder";
  const capabilityReason =
    flowContext?.capabilityReason ?? "正在等待后端返回真实题目内容。";
  const backendQuestions = parseBackendQuestions(flowContext);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <CapabilityNotice status={capabilityStatus} reason={capabilityReason} />

        <div className="mt-4">
          <p className="text-sm font-semibold text-zinc-900">实时题目预览</p>
          <p className="mt-1 text-[11px] text-zinc-500">
            {lastGeneratedAt
              ? `最近一次生成：${new Date(lastGeneratedAt).toLocaleString()}`
              : "这里只展示后端返回的真实小测内容。"}
          </p>
        </div>

        {capabilityStatus === "backend_ready" && backendQuestions.length > 0 ? (
          <div className="mt-4 space-y-3">
            {backendQuestions.map((item, index) => (
              <div key={item.id} className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
                <p className="text-sm font-medium text-zinc-900">
                  {index + 1}. {item.question}
                </p>
                {item.options.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {item.options.map((option, optionIndex) => (
                      <div
                        key={`${item.id}-${optionIndex}`}
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700"
                      >
                        {String.fromCharCode(65 + optionIndex)}. {option}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-12 text-center">
            <ClipboardList className="mx-auto h-8 w-8 text-zinc-400" />
            <p className="mt-3 text-sm font-medium text-zinc-700">暂未收到后端真实题目</p>
            <p className="mt-1 text-[11px] text-zinc-500">
              当前不再渲染前端示意题库，等待后端返回题目后会直接显示。
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
