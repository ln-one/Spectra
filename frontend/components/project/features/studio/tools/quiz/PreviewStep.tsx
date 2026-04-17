import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CapabilityNotice } from "../CapabilityNotice";
import type { ToolFlowContext } from "../types";
import type { QuizAttemptState, QuizQuestionItem } from "./types";

interface PreviewStepProps {
  lastGeneratedAt: string | null;
  flowContext?: ToolFlowContext;
  onAnswering?: () => void;
  onRefining?: () => void;
  onIdle?: () => void;
}

function normalizeOptionLabel(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";
  const row = value as Record<string, unknown>;
  if (typeof row.text === "string" && row.text.trim()) return row.text.trim();
  if (typeof row.label === "string" && row.label.trim()) return row.label.trim();
  if (typeof row.content === "string" && row.content.trim()) {
    return row.content.trim();
  }
  return "";
}

function parseBackendQuestions(flowContext?: ToolFlowContext): QuizQuestionItem[] {
  if (!flowContext?.resolvedArtifact) return [];
  if (flowContext.resolvedArtifact.contentKind !== "json") return [];
  if (
    !flowContext.resolvedArtifact.content ||
    typeof flowContext.resolvedArtifact.content !== "object"
  ) {
    return [];
  }

  const content = flowContext.resolvedArtifact.content as Record<string, unknown>;
  const rawQuestions = Array.isArray(content.questions) ? content.questions : [];
  const parsedQuestions: Array<QuizQuestionItem | null> = rawQuestions.map(
    (item, index) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const question =
        typeof row.question === "string" ? row.question.trim() : "";
      const optionsRaw = Array.isArray(row.options) ? row.options : [];
      const options = optionsRaw
        .map((option) => normalizeOptionLabel(option))
        .filter(Boolean);
      if (!question) return null;
      return {
        id: typeof row.id === "string" ? row.id : `backend-q-${index + 1}`,
        question,
        options,
        answer:
          typeof row.answer === "string" ||
          typeof row.answer === "number" ||
          Array.isArray(row.answer)
            ? (row.answer as QuizQuestionItem["answer"])
            : null,
        explanation:
          typeof row.explanation === "string" && row.explanation.trim()
            ? row.explanation.trim()
            : undefined,
      };
    }
  );
  return parsedQuestions.filter(
    (item): item is QuizQuestionItem => item !== null
  );
}

function resolveAcceptedAnswers(question: QuizQuestionItem): string[] {
  const { answer, options } = question;
  if (typeof answer === "string" && answer.trim()) {
    const normalized = answer.trim();
    const optionByIndex = /^[A-Z]$/i.test(normalized)
      ? options[normalized.toUpperCase().charCodeAt(0) - 65]
      : undefined;
    return [normalized, optionByIndex].filter(
      (value): value is string => Boolean(value && value.trim())
    );
  }
  if (typeof answer === "number") {
    const option = options[answer];
    return option ? [option] : [];
  }
  if (Array.isArray(answer)) {
    return answer
      .map((item) => {
        if (typeof item === "string") {
          const normalized = item.trim();
          if (/^[A-Z]$/i.test(normalized)) {
            return options[normalized.toUpperCase().charCodeAt(0) - 65] ?? normalized;
          }
          return normalized;
        }
        if (typeof item === "number") return options[item] ?? "";
        return "";
      })
      .filter(Boolean);
  }
  return [];
}

function isOptionCorrect(question: QuizQuestionItem, selectedOption: string): boolean | null {
  const acceptedAnswers = resolveAcceptedAnswers(question).map((item) => item.trim());
  if (acceptedAnswers.length === 0) return null;
  return acceptedAnswers.includes(selectedOption.trim());
}

export function PreviewStep({
  lastGeneratedAt,
  flowContext,
  onAnswering,
  onRefining,
  onIdle,
}: PreviewStepProps) {
  const capabilityStatus =
    flowContext?.capabilityStatus ?? "backend_placeholder";
  const capabilityReason =
    flowContext?.capabilityReason ?? "正在等待后端返回真实题目内容。";
  const backendQuestions = useMemo(
    () => parseBackendQuestions(flowContext),
    [flowContext]
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [attempts, setAttempts] = useState<Record<string, QuizAttemptState>>({});
  const currentQuestion = backendQuestions[currentIndex] ?? null;
  const currentAttempt = currentQuestion ? attempts[currentQuestion.id] : undefined;
  const currentArtifactId = flowContext?.resolvedArtifact?.artifactId ?? null;
  const canRefineCurrentQuestion =
    Boolean(currentQuestion && currentArtifactId && flowContext?.onStructuredRefineArtifact);

  useEffect(() => {
    setCurrentIndex(0);
    setAttempts({});
    onIdle?.();
  }, [currentArtifactId, onIdle]);

  useEffect(() => {
    if (backendQuestions.length === 0) {
      setCurrentIndex(0);
      onIdle?.();
      return;
    }
    setCurrentIndex((previous) =>
      Math.min(previous, Math.max(backendQuestions.length - 1, 0))
    );
  }, [backendQuestions.length, onIdle]);

  const answerFeedback = useMemo(() => {
    if (!currentQuestion || !currentAttempt?.submitted) return null;
    if (currentAttempt.isCorrect === null) {
      return {
        tone: "border-sky-200 bg-sky-50 text-sky-700",
        text: "当前题目尚未返回标准答案，可先继续微调题干或解析。",
      };
    }
    return currentAttempt.isCorrect
      ? {
          tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
          text: "回答正确，当前题目理解到位。",
        }
      : {
          tone: "border-amber-200 bg-amber-50 text-amber-700",
          text: "这题还可以再推敲一下，建议结合解析再看一遍。",
        };
  }, [currentAttempt?.isCorrect, currentAttempt?.submitted, currentQuestion]);

  const handleSelectOption = (option: string) => {
    if (!currentQuestion) return;
    onAnswering?.();
    setAttempts((previous) => ({
      ...previous,
      [currentQuestion.id]: {
        ...previous[currentQuestion.id],
        selectedOption: option,
        submitted: false,
        isCorrect: null,
      },
    }));
  };

  const handleSubmitAnswer = () => {
    if (!currentQuestion || !currentAttempt?.selectedOption) return;
    onAnswering?.();
    const selectedOption = currentAttempt.selectedOption;
    setAttempts((previous) => ({
      ...previous,
      [currentQuestion.id]: {
        ...previous[currentQuestion.id],
        submitted: true,
        isCorrect: isOptionCorrect(currentQuestion, selectedOption),
      },
    }));
  };

  const handleRefineCurrentQuestion = async () => {
    if (!currentQuestion || !currentArtifactId || !flowContext?.onStructuredRefineArtifact) {
      return;
    }
    onRefining?.();
    try {
      await flowContext.onStructuredRefineArtifact({
        artifactId: currentArtifactId,
        message: `请围绕当前题干优化这道题：${currentQuestion.question}`,
        refineMode: "structured_refine",
        selectionAnchor: {
          scope: "question",
          anchor_id: currentQuestion.id,
          artifact_id: currentArtifactId,
          label: `第 ${currentIndex + 1} 题`,
        },
        config: {
          current_question_id: currentQuestion.id,
          selection_anchor: {
            scope: "question",
            anchor_id: currentQuestion.id,
            artifact_id: currentArtifactId,
            label: `第 ${currentIndex + 1} 题`,
          },
        },
      });
    } finally {
      onIdle?.();
    }
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <CapabilityNotice status={capabilityStatus} reason={capabilityReason} />

        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-zinc-900">单题沉浸式预览</p>
            <p className="mt-1 text-[11px] text-zinc-500">
              {lastGeneratedAt
                ? `最近一次生成：${new Date(lastGeneratedAt).toLocaleString()}`
                : "这里只展示后端返回的真实小测内容。"}
            </p>
          </div>
          {currentQuestion ? (
            <div className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-[11px] font-medium text-zinc-600">
              第 {currentIndex + 1} 题 / 共 {backendQuestions.length} 题
            </div>
          ) : null}
        </div>

        {capabilityStatus === "backend_ready" && currentQuestion ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Current Question
                  </p>
                  <p className="mt-2 text-sm font-medium leading-6 text-zinc-900">
                    {currentQuestion.question}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={!canRefineCurrentQuestion}
                  onClick={() => void handleRefineCurrentQuestion()}
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  微调当前题
                </Button>
              </div>

              {currentQuestion.options.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {currentQuestion.options.map((option, optionIndex) => {
                    const isSelected = currentAttempt?.selectedOption === option;
                    return (
                      <button
                        key={`${currentQuestion.id}-${optionIndex}`}
                        type="button"
                        className={[
                          "flex w-full items-start rounded-xl border px-3 py-3 text-left text-sm transition-colors",
                          isSelected
                            ? "border-zinc-900 bg-zinc-900 text-white"
                            : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50",
                        ].join(" ")}
                        onClick={() => handleSelectOption(option)}
                      >
                        <span className="mr-3 text-xs font-semibold">
                          {String.fromCharCode(65 + optionIndex)}
                        </span>
                        <span className="leading-6">{option}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-6 text-xs text-zinc-500">
                  当前题目未返回选项，先通过微调继续完善题面。
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => {
                      setCurrentIndex((previous) => Math.max(previous - 1, 0));
                      onIdle?.();
                    }}
                    disabled={currentIndex === 0}
                  >
                    上一题
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => {
                      setCurrentIndex((previous) =>
                        Math.min(previous + 1, backendQuestions.length - 1)
                      );
                      onIdle?.();
                    }}
                    disabled={currentIndex >= backendQuestions.length - 1}
                  >
                    下一题
                  </Button>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={handleSubmitAnswer}
                  disabled={!currentAttempt?.selectedOption}
                >
                  提交答案
                </Button>
              </div>
            </div>

            {answerFeedback ? (
              <div
                className={`rounded-xl border px-3 py-2 text-xs ${answerFeedback.tone}`}
              >
                {answerFeedback.text}
              </div>
            ) : null}

            {currentAttempt?.submitted && currentQuestion.explanation ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Explanation
                </p>
                <p className="mt-2 text-sm leading-6 text-zinc-700">
                  {currentQuestion.explanation}
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-12 text-center">
            <ClipboardList className="mx-auto h-8 w-8 text-zinc-400" />
            <p className="mt-3 text-sm font-medium text-zinc-700">
              暂未收到后端真实题目
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              当前不再渲染前端示意题库，等待后端返回题目后会直接显示。
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
