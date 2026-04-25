export type QuizDifficulty = "easy" | "medium" | "hard";

export type QuizQuestionType = "single" | "multiple" | "judge";

export type QuizSurfaceMode = "browse" | "edit";

export interface QuizQuestionItem {
  id: string;
  question: string;
  options: string[];
  answer?: string | number | string[] | number[] | null;
  explanation?: string;
}

export interface QuizAttemptState {
  selectedOption?: string | null;
  submitted?: boolean;
  isCorrect?: boolean | null;
}

export interface QuizCardItem {
  id: string;
  question: string;
  options: string[];
  answers: number[];
  explainCorrect: string;
  explainWrong: string;
}
