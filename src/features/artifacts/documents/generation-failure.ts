import { APICallError, NoOutputGeneratedError, RetryError } from "ai";

export type TeachingDocumentGenerationFailureCode =
  | "teaching_document_budget_exhausted"
  | "teaching_document_generation_timeout"
  | "teaching_document_invalid_output"
  | "teaching_document_provider_configuration"
  | "teaching_document_rate_limited"
  | "teaching_document_provider_failed";

export function teachingDocumentGenerationFailureCode(
  error: unknown,
): TeachingDocumentGenerationFailureCode {
  if (error instanceof Error && error.message === "artifact_generation_budget_exhausted") {
    return "teaching_document_budget_exhausted";
  }
  if (error instanceof Error && error.message === "teaching_document_invalid_output") {
    return "teaching_document_invalid_output";
  }
  if (RetryError.isInstance(error)) {
    return teachingDocumentGenerationFailureCode(error.lastError);
  }
  if (NoOutputGeneratedError.isInstance(error)) {
    return "teaching_document_invalid_output";
  }
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 429) return "teaching_document_rate_limited";
    if (error.statusCode === 401 || error.statusCode === 403) {
      return "teaching_document_provider_configuration";
    }
  }
  if (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && /\b(timeout|timed out)\b/i.test(error.message))
  ) {
    return "teaching_document_generation_timeout";
  }
  return "teaching_document_provider_failed";
}
