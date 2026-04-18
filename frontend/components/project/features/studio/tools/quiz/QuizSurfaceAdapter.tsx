import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { QuizAttemptState, QuizQuestionItem } from "./types";

interface QuizSurfaceAdapterProps {
  questions: QuizQuestionItem[];
  currentIndex: number;
  attempts: Record<string, QuizAttemptState>;
  onSelectOption: (option: string) => void;
  onSubmitAnswer: () => void;
  onPreviousQuestion: () => void;
  onNextQuestion: () => void;
  onRefineCurrentQuestion: () => Promise<void> | void;
  canRefineCurrentQuestion: boolean;
}

export function normalizeOptionLabel(value: unknown): string {
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

export function parseBackendQuestions(content: unknown): QuizQuestionItem[] {
  if (!content || typeof content !== "object") return [];
  const row = content as Record<string, unknown>;
  const rawQuestions = Array.isArray(row.questions) ? row.questions : [];
  const parsedQuestions: Array<QuizQuestionItem | null> = rawQuestions.map(
    (item, index) => {
      if (!item || typeof item !== "object") return null;
      const questionRow = item as Record<string, unknown>;
      const question =
        typeof questionRow.question === "string" ? questionRow.question.trim() : "";
      const optionsRaw = Array.isArray(questionRow.options) ? questionRow.options : [];
      const options = optionsRaw
        .map((option) => normalizeOptionLabel(option))
        .filter(Boolean);
      if (!question) return null;
      return {
        id:
          typeof questionRow.id === "string"
            ? questionRow.id
            : `backend-q-${index + 1}`,
        question,
        options,
        answer:
          typeof questionRow.answer === "string" ||
          typeof questionRow.answer === "number" ||
          Array.isArray(questionRow.answer)
            ? (questionRow.answer as QuizQuestionItem["answer"])
            : null,
        explanation:
          typeof questionRow.explanation === "string" &&
          questionRow.explanation.trim()
            ? questionRow.explanation.trim()
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

export function isOptionCorrect(
  question: QuizQuestionItem,
  selectedOption: string
): boolean | null {
  const acceptedAnswers = resolveAcceptedAnswers(question).map((item) => item.trim());
  if (acceptedAnswers.length === 0) return null;
  return acceptedAnswers.includes(selectedOption.trim());
}

export function QuizSurfaceAdapter({
  questions,
  currentIndex,
  attempts,
  onSelectOption,
  onSubmitAnswer,
  onPreviousQuestion,
  onNextQuestion,
  onRefineCurrentQuestion,
  canRefineCurrentQuestion,
}: QuizSurfaceAdapterProps) {
  const currentQuestion = questions[currentIndex] ?? null;
  const currentAttempt = currentQuestion ? attempts[currentQuestion.id] : undefined;

  if (!currentQuestion) return null;

  const answerFeedback =
    !currentAttempt?.submitted
      ? null
      : currentAttempt.isCorrect === null
        ? {
            tone: "border-sky-200 bg-sky-50 text-sky-700",
            text: "当前题目尚未返回标准答案，可先继续微调题干或解析。",
          }
        : currentAttempt.isCorrect
          ? {
              tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
              text: "回答正确，当前题目理解到位。",
            }
          : {
              tone: "border-amber-200 bg-amber-50 text-amber-700",
              text: "这题还可以再推敲一下，建议结合解析再看一遍。",
            };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-zinc-900">单题工作面</div>
          <p className="text-[11px] text-zinc-500">
            当前焦点：{currentQuestion.id}
          </p>
        </div>
        <div className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-[11px] font-medium text-zinc-600">
          第 {currentIndex + 1} 题 / 共 {questions.length} 题
        </div>
      </div>
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.12em] text-zinc-500">
              当前题目
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
            onClick={() => void onRefineCurrentQuestion()}
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
                  onClick={() => onSelectOption(option)}
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
              onClick={onPreviousQuestion}
              disabled={currentIndex === 0}
            >
              上一题
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={onNextQuestion}
              disabled={currentIndex >= questions.length - 1}
            >
              下一题
            </Button>
          </div>
          <Button
            type="button"
            size="sm"
            className="h-8 text-xs"
            onClick={onSubmitAnswer}
            disabled={!currentAttempt?.selectedOption}
          >
            提交答案
          </Button>
        </div>
      </div>

      {answerFeedback ? (
        <div className={`rounded-xl border px-3 py-2 text-xs ${answerFeedback.tone}`}>
          {answerFeedback.text}
        </div>
      ) : null}

      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
          当前作答状态
        </p>
        <p className="mt-2 text-sm leading-6 text-zinc-700">
          {currentAttempt?.selectedOption
            ? `已选择：${currentAttempt.selectedOption}`
            : "尚未选择答案，可先阅读题干后再提交。"}
        </p>
      </div>

      {currentAttempt?.submitted && currentQuestion.explanation ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
            题目解析
          </p>
          <p className="mt-2 text-sm leading-6 text-zinc-700">
            {currentQuestion.explanation}
          </p>
        </div>
      ) : null}
    </div>
  );
}
