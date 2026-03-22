import type { QuizCardItem, QuizDifficulty, QuizQuestionType } from "./types";

interface BuildQuestionParams {
  scope: string;
  difficulty: QuizDifficulty;
  questionType: QuizQuestionType;
  includeHumor: boolean;
}

function normalizeScope(scope: string): string {
  return scope.trim() || "本节知识点";
}

function resolveOptions(questionType: QuizQuestionType): string[] {
  if (questionType === "judge") {
    return ["正确", "错误"];
  }
  if (questionType === "multiple") {
    return [
      "只看结论，不看过程",
      "先定位关键条件",
      "对比易混概念",
      "回到题干逐句验证",
    ];
  }
  return ["直接套公式", "先判断题目考点", "把选项都试一遍", "先看答案再反推"];
}

function resolveAnswers(questionType: QuizQuestionType): number[] {
  if (questionType === "judge") return [0];
  if (questionType === "multiple") return [1, 2, 3];
  return [1];
}

function humorSuffix(includeHumor: boolean): string {
  return includeHumor ? "（友情提示：别被“看起来最顺眼”的选项骗了）" : "";
}

function difficultyHint(difficulty: QuizDifficulty): string {
  if (difficulty === "easy") return "偏基础";
  if (difficulty === "hard") return "偏易错辨析";
  return "课堂标准";
}

export function buildQuizCards(
  count: number,
  params: BuildQuestionParams
): QuizCardItem[] {
  const safeCount = Math.min(20, Math.max(1, count));
  const scope = normalizeScope(params.scope);
  const options = resolveOptions(params.questionType);
  const answers = resolveAnswers(params.questionType);

  return Array.from({ length: safeCount }).map((_, index) => {
    const no = index + 1;
    return {
      id: `q-${no}`,
      question: `【${difficultyHint(params.difficulty)}】关于“${scope}”的第 ${no} 题：哪种解题思路最稳妥？${humorSuffix(
        params.includeHumor
      )}`,
      options,
      answers,
      explainCorrect:
        "答对了。你先定位考点，再验证条件，说明你的思路是可复用的。",
      explainWrong:
        "这题主要错在跳过了条件核对。建议先圈出关键词，再逐项判断选项。",
    };
  });
}

export function isAnswerCorrect(
  answers: number[],
  selected: number[]
): boolean {
  if (answers.length !== selected.length) return false;
  const sortNum = (a: number, b: number) => a - b;
  const left = [...answers].sort(sortNum);
  const right = [...selected].sort(sortNum);
  return left.every((value, idx) => value === right[idx]);
}
