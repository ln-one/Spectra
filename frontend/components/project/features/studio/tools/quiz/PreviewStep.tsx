import { useMemo } from "react";
import { BookText, CircleCheck, Download, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CapabilityNotice, FallbackPreviewHint } from "../CapabilityNotice";
import type { ToolFlowContext } from "../types";
import type { QuizCardItem, QuizQuestionType } from "./types";

interface PreviewStepProps {
  question: QuizCardItem;
  questionIndex: number;
  totalQuestions: number;
  questionType: QuizQuestionType;
  selectedAnswers: number[];
  isSubmitted: boolean;
  isCorrect: boolean;
  lastGeneratedAt: string | null;
  flowContext?: ToolFlowContext;
  onRegenerate: () => void;
  onToggleOption: (index: number) => void;
  onSubmitAnswer: () => void;
  onNextQuestion: () => void;
  onResetCurrent: () => void;
}

interface BackendQuestionItem {
  id: string;
  question: string;
  options: string[];
  answers: number[];
}

function normalizeOptionLabel(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const row = value as Record<string, unknown>;
  if (typeof row.text === "string" && row.text.trim()) return row.text.trim();
  if (typeof row.label === "string" && row.label.trim()) return row.label.trim();
  if (typeof row.content === "string" && row.content.trim()) {
    return row.content.trim();
  }
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
      const question = typeof row.question === "string" ? row.question : "";
      const optionsRaw = Array.isArray(row.options) ? row.options : [];
      const options = optionsRaw
        .map((option) => normalizeOptionLabel(option))
        .filter((option) => option.length > 0);
      const answersRaw = Array.isArray(row.answers)
        ? row.answers
        : Array.isArray(row.answer_indexes)
          ? row.answer_indexes
          : Array.isArray(row.correct_indexes)
            ? row.correct_indexes
          : [];
      const answers = answersRaw
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value));
      if (!question || options.length === 0) return null;
      return {
        id: typeof row.id === "string" ? row.id : `backend-q-${index + 1}`,
        question,
        options,
        answers,
      };
    })
    .filter((item): item is BackendQuestionItem => Boolean(item));
}

export function PreviewStep({
  question,
  questionIndex,
  totalQuestions,
  questionType,
  selectedAnswers,
  isSubmitted,
  isCorrect,
  lastGeneratedAt,
  flowContext,
  onRegenerate,
  onToggleOption,
  onSubmitAnswer,
  onNextQuestion,
  onResetCurrent,
}: PreviewStepProps) {
  const capabilityStatus = flowContext?.capabilityStatus ?? "backend_placeholder";
  const capabilityReason =
    flowContext?.capabilityReason ?? "未获取到后端题目内容，已回退前端示意内容。";
  const isMultiple = questionType === "multiple";
  const backendQuestions = useMemo(() => parseBackendQuestions(flowContext), [flowContext]);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-3">
        <CapabilityNotice status={capabilityStatus} reason={capabilityReason} />

        <div className="mt-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <CircleCheck className="h-4 w-4 text-emerald-600" />
            <div>
              <p className="text-xs font-semibold text-zinc-800">随堂小测预览（面板内）</p>
              <p className="mt-1 text-[11px] text-zinc-500">
                {lastGeneratedAt
                  ? `最近一次生成：${new Date(lastGeneratedAt).toLocaleString()}`
                  : "当前展示的是生成后的题目内容。"}
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

        {capabilityStatus === "backend_ready" && backendQuestions.length > 0 ? (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
            <p className="text-xs font-semibold text-emerald-700">
              后端题目内容（共 {backendQuestions.length} 题）
            </p>
            <div className="mt-2 space-y-2">
              {backendQuestions.slice(0, 3).map((item, idx) => (
                <div key={item.id} className="rounded-lg border border-emerald-200 bg-white px-3 py-2">
                  <p className="text-xs font-medium text-zinc-800">
                    {idx + 1}. {item.question}
                  </p>
                  <ul className="mt-2 list-disc pl-4 text-[11px] text-zinc-600">
                    {item.options.map((option, optionIndex) => (
                      <li key={`${item.id}-option-${optionIndex}`}>{option}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="mt-3">
              <FallbackPreviewHint />
            </div>
            <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3">
              <div className="rounded-xl border border-zinc-200 bg-white p-3">
                <p className="text-[11px] text-zinc-500">
                  第 {questionIndex + 1}/{Math.max(1, totalQuestions)} 题
                </p>
                <p className="mt-1 text-sm font-medium text-zinc-800">{question.question}</p>
                <p className="mt-2 text-[11px] text-zinc-500">
                  {isMultiple
                    ? "提示：这是一道多选题，可选择多个选项。"
                    : "提示：请选择一个最合适的答案。"}
                </p>
              </div>

              <div className="mt-3 space-y-2">
                {question.options.map((option, index) => {
                  const selected = selectedAnswers.includes(index);
                  const correct = question.answers.includes(index);
                  const shouldHighlight = isSubmitted && correct;
                  return (
                    <button
                      key={`${question.id}-${index}`}
                      type="button"
                      onClick={() => onToggleOption(index)}
                      disabled={isSubmitted}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                        selected
                          ? "border-zinc-900 bg-zinc-900 text-white"
                          : shouldHighlight
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                            : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                      } ${isSubmitted ? "cursor-default" : ""}`}
                    >
                      {String.fromCharCode(65 + index)}. {option}
                    </button>
                  );
                })}
              </div>

              {isSubmitted ? (
                <div
                  className={`mt-3 rounded-lg border p-3 text-xs ${
                    isCorrect
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                      : "border-amber-300 bg-amber-50 text-amber-700"
                  }`}
                >
                  {isCorrect ? question.explainCorrect : question.explainWrong}
                </div>
              ) : null}

              <div className="mt-3 flex items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={onResetCurrent}
                >
                  <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
                  重置本题
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={onSubmitAnswer}
                    disabled={selectedAnswers.length === 0 || isSubmitted}
                  >
                    提交答案
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 rounded-lg bg-blue-600 text-xs hover:bg-blue-500"
                    onClick={onNextQuestion}
                  >
                    下一题 →
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
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
                  <p className="truncate text-xs font-medium text-zinc-800">{item.title}</p>
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
