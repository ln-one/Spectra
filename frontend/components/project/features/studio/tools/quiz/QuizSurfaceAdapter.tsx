import { Button } from "@/components/ui/button";
import type { QuizAttemptState, QuizQuestionItem, QuizSurfaceMode } from "./types";

interface QuizSurfaceAdapterProps {
  questions: QuizQuestionItem[];
  currentIndex: number;
  attempts: Record<string, QuizAttemptState>;
  surfaceMode?: QuizSurfaceMode;
  onSelectOption: (option: string) => void;
  onSubmitAnswer: () => void;
  onPreviousQuestion: () => void;
  onNextQuestion: () => void;
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
  surfaceMode = "browse",
  onSelectOption,
  onSubmitAnswer,
  onPreviousQuestion,
  onNextQuestion,
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
            text: "当前题目尚未返回标准答案。",
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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-violet-100 bg-white">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
          <div className="mx-auto max-w-3xl">
            <div className="rounded-3xl border border-zinc-200 bg-zinc-50/40 px-5 py-5">
              <p className="text-lg font-semibold leading-8 text-zinc-950">
                {currentQuestion.question}
              </p>

              {currentQuestion.options.length > 0 ? (
                <div className="mt-5 space-y-3">
                  {currentQuestion.options.map((option, optionIndex) => {
                    const isSelected = currentAttempt?.selectedOption === option;
                    return (
                      <button
                        key={`${currentQuestion.id}-${optionIndex}`}
                        type="button"
                        className={[
                          "flex w-full items-start rounded-2xl border px-4 py-4 text-left text-sm transition-colors",
                          isSelected
                            ? "border-violet-600 bg-violet-600 text-white shadow-[0_10px_25px_rgba(139,92,246,0.18)]"
                            : "border-zinc-200 bg-white text-zinc-800 hover:border-violet-200 hover:bg-violet-50/40",
                        ].join(" ")}
                        onClick={() => onSelectOption(option)}
                      >
                        <span
                          className={[
                            "mr-3 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                            isSelected
                              ? "bg-white/20 text-white"
                              : "bg-violet-50 text-violet-700",
                          ].join(" ")}
                        >
                          {String.fromCharCode(65 + optionIndex)}
                        </span>
                        <span className="leading-6">{option}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-dashed border-zinc-300 bg-white px-4 py-6 text-sm text-zinc-500">
                  当前题目未返回选项。
                </div>
              )}

              {!answerFeedback && currentAttempt?.selectedOption ? (
                <div className="mt-5 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600">
                  已选择：{currentAttempt.selectedOption}
                </div>
              ) : null}

              {answerFeedback ? (
                <div
                  className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${answerFeedback.tone}`}
                >
                  <p className="font-medium">{answerFeedback.text}</p>
                  {currentAttempt?.selectedOption ? (
                    <p className="mt-1 text-xs opacity-80">
                      已选择：{currentAttempt.selectedOption}
                    </p>
                  ) : null}
                  {currentQuestion.explanation ? (
                    <p className="mt-3 text-sm leading-6">
                      {currentQuestion.explanation}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="border-t border-violet-100 bg-zinc-50/70 px-4 py-3">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 border-zinc-200 px-3 text-xs"
                onClick={onPreviousQuestion}
                disabled={currentIndex === 0}
              >
                上一题
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 border-zinc-200 px-3 text-xs"
                onClick={onNextQuestion}
                disabled={currentIndex >= questions.length - 1}
              >
                下一题
              </Button>
            </div>
            <Button
              type="button"
              size="sm"
              className="h-9 bg-violet-600 px-4 text-xs text-white hover:bg-violet-700"
              onClick={onSubmitAnswer}
              disabled={!currentAttempt?.selectedOption}
            >
              提交答案
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
