import { APICallError, NoOutputGeneratedError, RetryError } from "ai";

export type MindMapGenerationFailureCode =
  | "mind_map_budget_exhausted"
  | "mind_map_generation_timeout"
  | "mind_map_invalid_output"
  | "mind_map_provider_configuration"
  | "mind_map_rate_limited"
  | "mind_map_provider_failed";

export function mindMapGenerationFailureCode(error: unknown): MindMapGenerationFailureCode {
  if (error instanceof Error && error.message === "artifact_generation_budget_exhausted") {
    return "mind_map_budget_exhausted";
  }
  if (error instanceof Error && error.message === "mind_map_invalid_output") {
    return "mind_map_invalid_output";
  }
  if (RetryError.isInstance(error)) return mindMapGenerationFailureCode(error.lastError);
  if (NoOutputGeneratedError.isInstance(error)) {
    return "mind_map_invalid_output";
  }
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 429) return "mind_map_rate_limited";
    if (error.statusCode === 401 || error.statusCode === 403) {
      return "mind_map_provider_configuration";
    }
  }
  if (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && /\b(timeout|timed out)\b/i.test(error.message))
  ) {
    return "mind_map_generation_timeout";
  }
  return "mind_map_provider_failed";
}
