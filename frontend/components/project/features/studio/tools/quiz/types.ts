export type QuizStep = "config" | "generate" | "preview";

export type QuizDifficulty = "easy" | "medium" | "hard";

export type QuizQuestionType = "single" | "multiple" | "judge";

export interface QuizCardItem {
  id: string;
  question: string;
  options: string[];
  answers: number[];
  explainCorrect: string;
  explainWrong: string;
}
