import "server-only";

import { IdentityError } from "@/features/identity/errors";
import { QuizError } from "./errors";

export function quizHttpError(error: unknown) {
  if (error instanceof IdentityError) {
    return Response.json(
      { detail: { code: error.code } },
      { status: error.code === "authentication_required" ? 401 : 403 },
    );
  }
  if (error instanceof QuizError) {
    const status =
      error.code === "quiz_attempt_conflict" || error.code === "quiz_conflict"
        ? 409
        : error.code === "quiz_attempt_submitted" || error.code === "quiz_feedback_unavailable"
          ? 422
          : 404;
    return Response.json({ detail: { code: error.code } }, { status });
  }
  return Response.json({ detail: { code: "quiz_unavailable" } }, { status: 503 });
}
