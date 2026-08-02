export type QuizErrorCode =
  | "quiz_not_found"
  | "quiz_conflict"
  | "quiz_attempt_not_found"
  | "quiz_attempt_conflict"
  | "quiz_attempt_submitted"
  | "quiz_feedback_unavailable"
  | "quiz_proposal_invalid"
  | "quiz_proposal_stale";

export class QuizError extends Error {
  constructor(readonly code: QuizErrorCode) {
    super(code);
    this.name = "QuizError";
  }
}
