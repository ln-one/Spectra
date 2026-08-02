import type { QuizAnswer, QuizQuestionDelivery } from "./contract";

export type SurveyQuizJson = {
  pages: Array<{
    elements: Array<{
      choices: Array<{ text: string; value: boolean | string }>;
      name: string;
      titleLocation: "hidden";
      type: "checkbox" | "radiogroup";
    }>;
    name: string;
  }>;
  showCompleteButton: boolean;
  showNavigationButtons: boolean;
  showProgressBar: "off";
};

export type SurveyQuizLabels = { false: string; true: string };

export function quizDeliveryToSurveyJson(
  snapshot: QuizQuestionDelivery,
  labels: SurveyQuizLabels,
): SurveyQuizJson {
  return {
    pages: snapshot.questions.map((question) => ({
      elements: [
        {
          choices:
            question.type === "true_false"
              ? [
                  { text: labels.true, value: true },
                  { text: labels.false, value: false },
                ]
              : question.options.map((option) => ({ text: option.text, value: option.optionId })),
          name: question.questionId,
          titleLocation: "hidden",
          type: question.type === "multiple_choice" ? "checkbox" : "radiogroup",
        },
      ],
      name: `question-${question.questionId}`,
    })),
    showCompleteButton: false,
    showNavigationButtons: false,
    showProgressBar: "off",
  };
}

export function surveyValueToQuizAnswer(
  snapshot: QuizQuestionDelivery,
  questionId: string,
  value: unknown,
): QuizAnswer {
  const question = snapshot.questions.find((candidate) => candidate.questionId === questionId);
  if (!question) throw new Error("quiz_question_not_found");
  if (question.type === "single_choice") {
    return { optionId: typeof value === "string" ? value : null, type: question.type };
  }
  if (question.type === "multiple_choice") {
    return {
      optionIds: Array.isArray(value)
        ? value.filter((candidate): candidate is string => typeof candidate === "string")
        : [],
      type: question.type,
    };
  }
  return { type: question.type, value: typeof value === "boolean" ? value : null };
}

export function quizAnswerToSurveyValue(answer: QuizAnswer) {
  if (answer.type === "single_choice") return answer.optionId;
  if (answer.type === "multiple_choice") return answer.optionIds;
  return answer.value;
}

export function quizAnswersEqual(left: QuizAnswer | undefined, right: QuizAnswer) {
  if (!left || left.type !== right.type) return false;
  if (left.type === "single_choice" && right.type === "single_choice") {
    return left.optionId === right.optionId;
  }
  if (left.type === "true_false" && right.type === "true_false") {
    return left.value === right.value;
  }
  if (left.type !== "multiple_choice" || right.type !== "multiple_choice") return false;
  if (left.optionIds.length !== right.optionIds.length) return false;
  const selected = new Set(left.optionIds);
  return right.optionIds.every((optionId) => selected.has(optionId));
}
