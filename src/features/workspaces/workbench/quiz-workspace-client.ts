import { z } from "zod";
import {
  type QuizAnswer,
  type QuizRevisionContent,
  quizAnswerSchema,
  quizAttemptDetailSchema,
  quizAttemptHistorySchema,
} from "@/features/artifacts/quizzes/contract";
import { type QuizArtifact, quizArtifactSchema } from "@/features/artifacts/quizzes/types";

const attemptResponseSchema = z.object({ attempt: quizAttemptDetailSchema }).strict();
const attemptsResponseSchema = z.object({ attempts: z.array(quizAttemptHistorySchema) }).strict();
const artifactResponseSchema = z.object({ artifact: quizArtifactSchema }).strict();
const proposalResponseSchema = z
  .object({
    acceptedRevisionId: z.string().uuid(),
    artifact: quizArtifactSchema,
    attempt: quizAttemptDetailSchema.nullable(),
  })
  .strict();
const answerResponseSchema = z
  .object({ answer: quizAttemptDetailSchema.shape.answers.element })
  .strict();
const idsResponseSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(16) }).strict();
const feedbackResponseSchema = z
  .object({
    feedback: z
      .object({
        correct: z.boolean(),
        correctAnswer: quizAnswerSchema,
        earnedPoints: z.number().int().min(0),
        explanationMarkdown: z.string(),
        questionId: z.string().uuid(),
      })
      .strict(),
  })
  .strict();

export type QuizFeedback = z.infer<typeof feedbackResponseSchema>["feedback"];

async function responseJson(response: Response) {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`quiz_request_failed:${response.status}`);
  return body;
}

function quizUrl(artifactId: string, suffix: string, workspaceId: string) {
  return `/api/artifacts/quiz/${artifactId}${suffix}?workspaceId=${encodeURIComponent(workspaceId)}`;
}

export async function fetchQuizAttempts(artifactId: string, workspaceId: string) {
  return attemptsResponseSchema.parse(
    await responseJson(
      await fetch(quizUrl(artifactId, "/attempts", workspaceId), { cache: "no-store" }),
    ),
  ).attempts;
}

export async function fetchQuizAttempt(artifactId: string, attemptId: string, workspaceId: string) {
  return attemptResponseSchema.parse(
    await responseJson(
      await fetch(quizUrl(artifactId, `/attempts/${attemptId}`, workspaceId), {
        cache: "no-store",
      }),
    ),
  ).attempt;
}

export async function startQuizAttempt(artifactId: string, workspaceId: string) {
  return attemptResponseSchema.parse(
    await responseJson(
      await fetch(quizUrl(artifactId, "/attempts", workspaceId), { method: "POST" }),
    ),
  ).attempt;
}

export async function saveQuizAnswer(input: {
  answer: QuizAnswer;
  artifactId: string;
  attemptId: string;
  expectedVersion: number;
  flagged: boolean;
  questionId: string;
  workspaceId: string;
}) {
  return answerResponseSchema.parse(
    await responseJson(
      await fetch(
        quizUrl(
          input.artifactId,
          `/attempts/${input.attemptId}/answers/${input.questionId}`,
          input.workspaceId,
        ),
        {
          body: JSON.stringify({
            answer: input.answer,
            expectedVersion: input.expectedVersion,
            flagged: input.flagged,
          }),
          headers: { "Content-Type": "application/json" },
          method: "PUT",
        },
      ),
    ),
  ).answer;
}

export async function checkQuizAnswer(
  artifactId: string,
  attemptId: string,
  questionId: string,
  workspaceId: string,
) {
  return feedbackResponseSchema.parse(
    await responseJson(
      await fetch(quizUrl(artifactId, `/attempts/${attemptId}/check`, workspaceId), {
        body: JSON.stringify({ questionId }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    ),
  ).feedback;
}

export async function submitQuizAttempt(
  artifactId: string,
  attemptId: string,
  workspaceId: string,
) {
  return attemptResponseSchema.parse(
    await responseJson(
      await fetch(quizUrl(artifactId, `/attempts/${attemptId}/submit`, workspaceId), {
        method: "POST",
      }),
    ),
  ).attempt;
}

export async function acceptQuizProposal(input: {
  artifactId: string;
  attemptId: string | null;
  conversationId: string;
  expectedRevisionId: string;
  runId: string;
  workspaceId: string;
}) {
  const query = new URLSearchParams({
    conversationId: input.conversationId,
    workspaceId: input.workspaceId,
  });
  const response = await fetch(
    `/api/artifacts/quiz/${input.artifactId}/proposals/${input.runId}?${query}`,
    {
      body: JSON.stringify({
        attemptId: input.attemptId,
        expectedRevisionId: input.expectedRevisionId,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );
  if (!response.ok) throw new Error("quiz_proposal_accept_failed");
  return proposalResponseSchema.parse(await response.json());
}

export async function issueQuizIds(count: number, workspaceId: string) {
  return idsResponseSchema.parse(
    await responseJson(
      await fetch("/api/artifacts/quiz/identities", {
        body: JSON.stringify({ count, workspaceId }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    ),
  ).ids;
}

export async function saveQuizRevision(input: {
  artifact: QuizArtifact;
  content: QuizRevisionContent;
  conversationId: string;
  workspaceId: string;
}) {
  return artifactResponseSchema.parse(
    await responseJson(
      await fetch(
        `/api/artifacts/quiz/${input.artifact.id}?conversationId=${encodeURIComponent(input.conversationId)}&workspaceId=${encodeURIComponent(input.workspaceId)}`,
        {
          body: JSON.stringify({
            content: input.content,
            expectedRevisionId: input.artifact.currentRevision.id,
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      ),
    ),
  ).artifact;
}
