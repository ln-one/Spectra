import { expect, test } from "vitest";
import { teachingDocumentGenerationJobSchema } from "./generation-queue";

const validJob = {
  artifactId: "00000000-0000-4000-8000-000000000701",
  conversationId: "00000000-0000-4000-8000-000000000702",
  generationAttemptId: "00000000-0000-4000-8000-000000000704",
  locale: "en-US",
  prompt: "Create a teaching document",
  workspaceId: "00000000-0000-4000-8000-000000000703",
} as const;

test("accepts the complete durable generation request", () => {
  expect(teachingDocumentGenerationJobSchema.parse(validJob)).toEqual(validJob);
});

test("rejects unsupported locales and hidden execution fields", () => {
  expect(
    teachingDocumentGenerationJobSchema.safeParse({ ...validJob, locale: "fr-FR" }).success,
  ).toBe(false);
  expect(
    teachingDocumentGenerationJobSchema.safeParse({ ...validJob, queue: "override" }).success,
  ).toBe(false);
});
