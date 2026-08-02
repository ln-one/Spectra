import { APICallError, NoObjectGeneratedError, NoOutputGeneratedError, RetryError } from "ai";

export type GameGenerationFailureCode =
  | "game_budget_exhausted"
  | "game_generation_timeout"
  | "game_invalid_output"
  | "game_provider_configuration"
  | "game_rate_limited"
  | "game_provider_failed";

export function gameGenerationFailureCode(error: unknown): GameGenerationFailureCode {
  if (error instanceof Error) {
    if (error.message === "artifact_generation_budget_exhausted") {
      return "game_budget_exhausted";
    }
    if (isGameGenerationFailureCode(error.message)) return error.message;
  }
  if (RetryError.isInstance(error)) return gameGenerationFailureCode(error.lastError);
  if (NoObjectGeneratedError.isInstance(error) || NoOutputGeneratedError.isInstance(error)) {
    return "game_invalid_output";
  }
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 429) return "game_rate_limited";
    if (error.statusCode === 401 || error.statusCode === 403) {
      return "game_provider_configuration";
    }
  }
  if (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && /\b(timeout|timed out)\b/i.test(error.message))
  ) {
    return "game_generation_timeout";
  }
  return "game_provider_failed";
}

function isGameGenerationFailureCode(value: string): value is GameGenerationFailureCode {
  return (
    value === "game_budget_exhausted" ||
    value === "game_generation_timeout" ||
    value === "game_invalid_output" ||
    value === "game_provider_configuration" ||
    value === "game_rate_limited" ||
    value === "game_provider_failed"
  );
}
