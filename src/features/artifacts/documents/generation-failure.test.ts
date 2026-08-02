import { APICallError, NoOutputGeneratedError, RetryError } from "ai";
import { expect, test } from "vitest";
import { teachingDocumentGenerationFailureCode } from "./generation-failure";

test("classifies safe terminal document failure codes", () => {
  expect(
    teachingDocumentGenerationFailureCode(new Error("artifact_generation_budget_exhausted")),
  ).toBe("teaching_document_budget_exhausted");
  expect(
    teachingDocumentGenerationFailureCode(
      new APICallError({
        message: "rate limited",
        requestBodyValues: {},
        statusCode: 429,
        url: "https://provider.invalid",
      }),
    ),
  ).toBe("teaching_document_rate_limited");
  expect(teachingDocumentGenerationFailureCode(new NoOutputGeneratedError())).toBe(
    "teaching_document_invalid_output",
  );
  expect(teachingDocumentGenerationFailureCode(new Error("teaching_document_invalid_output"))).toBe(
    "teaching_document_invalid_output",
  );
  expect(teachingDocumentGenerationFailureCode(new Error("Request timed out"))).toBe(
    "teaching_document_generation_timeout",
  );
  expect(teachingDocumentGenerationFailureCode(new Error("connection reset"))).toBe(
    "teaching_document_provider_failed",
  );
  expect(
    teachingDocumentGenerationFailureCode(
      new RetryError({
        errors: [new Error("first"), new Error("Request timed out")],
        message: "retry exhausted",
        reason: "maxRetriesExceeded",
      }),
    ),
  ).toBe("teaching_document_generation_timeout");
});
