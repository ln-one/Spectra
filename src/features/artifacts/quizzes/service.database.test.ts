import { createMigratedTestDatabase } from "@tests/database";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { workspacePermissionGrants } from "@/database/schema";
import { publishArtifactSource } from "@/features/artifacts/artifact-source-membership.server";
import { ensurePrincipalForAuthUser } from "@/features/identity/service";
import type { Actor } from "@/features/identity/types";
import { createWorkspace } from "@/features/workspaces/service";
import type { QuizRevisionContent } from "./contract";
import { QuizError } from "./errors";
import {
  checkQuizAttemptAnswer,
  claimQuizGeneration,
  completeQuizGeneration,
  finalizeQuizGeneration,
  getQuizAttempt,
  listQuizAttempts,
  moveQuizAttemptToRevision,
  saveQuizAttemptAnswer,
  saveQuizRevision,
  startQuizAttempt,
  startQuizGeneration,
  submitQuizAttempt,
} from "./service";

let testDatabase: Awaited<ReturnType<typeof createMigratedTestDatabase>>;
let alice: Actor;
let bob: Actor;
let workspaceId: string;
const conversationId = "00000000-0000-4000-8000-000000000101";
const questionId = "00000000-0000-4000-8000-000000000102";
const correctOptionId = "00000000-0000-4000-8000-000000000103";
const distractorId = "00000000-0000-4000-8000-000000000104";

function content(title: string): QuizRevisionContent {
  return {
    descriptionMarkdown: "Attempt service fixture",
    questions: [
      {
        correctOptionId,
        difficulty: "easy",
        explanationMarkdown: "The first option is correct.",
        options: [
          { optionId: correctOptionId, text: "Correct" },
          { optionId: distractorId, text: "Distractor" },
        ],
        points: 2,
        promptMarkdown: "Choose the correct option.",
        questionId,
        type: "single_choice",
      },
    ],
    schemaVersion: 1,
    settings: { feedbackMode: "immediate", navigationMode: "free" },
    title,
  };
}

async function createReadyQuiz() {
  const started = await startQuizGeneration(
    alice,
    {
      conversationId,
      locale: "en-US",
      prompt: "Create a Quiz",
      sourceUserMessageId: `test:${crypto.randomUUID()}`,
      workspaceId,
    },
    { async enqueue() {} },
    testDatabase.db,
  );
  const generationAttemptId = started.generationAttemptId;
  if (!generationAttemptId) throw new Error("Generation attempt missing");
  await claimQuizGeneration(started.id, generationAttemptId, testDatabase.db);
  await finalizeQuizGeneration(started.id, generationAttemptId, testDatabase.db);
  return completeQuizGeneration(
    started.id,
    generationAttemptId,
    alice.principalId,
    content("Quiz V1"),
    testDatabase.db,
  );
}

beforeAll(async () => {
  testDatabase = await createMigratedTestDatabase();
});

beforeEach(async () => {
  await testDatabase.pool.query(
    "TRUNCATE TABLE public.quiz_attempt_answers, public.quiz_attempts, public.artifact_revisions, public.artifacts, public.workspaces, public.principals CASCADE",
  );
  alice = await ensurePrincipalForAuthUser("quiz-alice", "quiz-alice", testDatabase.db);
  bob = await ensurePrincipalForAuthUser("quiz-bob", "quiz-bob", testDatabase.db);
  workspaceId = (await createWorkspace(alice, { name: "Quiz course" }, testDatabase.db)).id;
});

afterAll(async () => {
  if (testDatabase) await testDatabase.destroy();
});

test("start is idempotent, saves use CAS, and submit freezes deterministic grading", async () => {
  const artifact = await createReadyQuiz();
  const first = await startQuizAttempt(
    alice,
    { artifactId: artifact.id, workspaceId },
    testDatabase.db,
  );
  const replay = await startQuizAttempt(
    alice,
    { artifactId: artifact.id, workspaceId },
    testDatabase.db,
  );
  expect(replay.id).toBe(first.id);

  const saved = await saveQuizAttemptAnswer(
    alice,
    {
      answer: { optionId: correctOptionId, type: "single_choice" },
      artifactId: artifact.id,
      attemptId: first.id,
      expectedVersion: 0,
      flagged: true,
      questionId,
      workspaceId,
    },
    testDatabase.db,
  );
  expect(saved).toEqual({
    answer: { optionId: correctOptionId, type: "single_choice" },
    correct: null,
    earnedPoints: null,
    flagged: true,
    questionId,
    version: 1,
  });
  await expect(
    saveQuizAttemptAnswer(
      alice,
      {
        answer: { optionId: distractorId, type: "single_choice" },
        artifactId: artifact.id,
        attemptId: first.id,
        expectedVersion: 0,
        flagged: false,
        questionId,
        workspaceId,
      },
      testDatabase.db,
    ),
  ).rejects.toEqual(new QuizError("quiz_attempt_conflict"));

  const feedback = await checkQuizAttemptAnswer(
    alice,
    { artifactId: artifact.id, attemptId: first.id, questionId, workspaceId },
    testDatabase.db,
  );
  expect(feedback).toMatchObject({ correct: true, earnedPoints: 2 });

  const submitted = await submitQuizAttempt(
    alice,
    { artifactId: artifact.id, attemptId: first.id, workspaceId },
    testDatabase.db,
  );
  expect(submitted).toMatchObject({ result: { score: 2, totalPoints: 2 }, state: "submitted" });
  await expect(
    submitQuizAttempt(
      alice,
      { artifactId: artifact.id, attemptId: first.id, workspaceId },
      testDatabase.db,
    ),
  ).resolves.toMatchObject({ result: { score: 2 }, state: "submitted" });
  await expect(
    saveQuizAttemptAnswer(
      alice,
      {
        answer: { optionId: distractorId, type: "single_choice" },
        artifactId: artifact.id,
        attemptId: first.id,
        expectedVersion: 1,
        flagged: false,
        questionId,
        workspaceId,
      },
      testDatabase.db,
    ),
  ).rejects.toEqual(new QuizError("quiz_attempt_submitted"));
});

test("the database rejects an Attempt revision owned by another Artifact", async () => {
  const firstArtifact = await createReadyQuiz();
  const secondArtifact = await createReadyQuiz();
  const attempt = await startQuizAttempt(
    alice,
    { artifactId: firstArtifact.id, workspaceId },
    testDatabase.db,
  );

  await expect(
    testDatabase.pool.query(
      "UPDATE public.quiz_attempts SET artifact_revision_id = $1 WHERE id = $2",
      [secondArtifact.currentRevision.id, attempt.id],
    ),
  ).rejects.toMatchObject({ code: "23503" });
});

test("continuing an active Attempt moves it to the current Quiz revision", async () => {
  const artifact = await createReadyQuiz();
  const oldAttempt = await startQuizAttempt(
    alice,
    { artifactId: artifact.id, workspaceId },
    testDatabase.db,
  );
  const revised = await saveQuizRevision(
    alice,
    {
      artifactId: artifact.id,
      content: content("Quiz V2"),
      conversationId,
      expectedRevisionId: artifact.currentRevision.id,
      workspaceId,
    },
    testDatabase.db,
  );
  const replay = await startQuizAttempt(
    alice,
    { artifactId: artifact.id, workspaceId },
    testDatabase.db,
  );
  expect(replay.id).toBe(oldAttempt.id);
  expect(replay.delivery.revisionId).toBe(revised.currentRevision.id);
});

test("moves an active Attempt to an accepted revision and preserves compatible answers", async () => {
  const artifact = await createReadyQuiz();
  const attempt = await startQuizAttempt(
    alice,
    { artifactId: artifact.id, workspaceId },
    testDatabase.db,
  );
  await saveQuizAttemptAnswer(
    alice,
    {
      answer: { optionId: correctOptionId, type: "single_choice" },
      artifactId: artifact.id,
      attemptId: attempt.id,
      expectedVersion: 0,
      flagged: true,
      questionId,
      workspaceId,
    },
    testDatabase.db,
  );
  await checkQuizAttemptAnswer(
    alice,
    { artifactId: artifact.id, attemptId: attempt.id, questionId, workspaceId },
    testDatabase.db,
  );
  const revisedContent = content("Quiz V2");
  const revisedQuestion = revisedContent.questions[0];
  if (!revisedQuestion) throw new Error("Quiz fixture question is missing");
  revisedContent.questions[0] = {
    ...revisedQuestion,
    promptMarkdown: "Choose the updated correct option.",
  };
  const revised = await saveQuizRevision(
    alice,
    {
      artifactId: artifact.id,
      content: revisedContent,
      conversationId,
      expectedRevisionId: artifact.currentRevision.id,
      workspaceId,
    },
    testDatabase.db,
  );

  const moved = await moveQuizAttemptToRevision(
    alice,
    {
      artifactId: artifact.id,
      attemptId: attempt.id,
      expectedRevisionId: artifact.currentRevision.id,
      targetRevisionId: revised.currentRevision.id,
      workspaceId,
    },
    testDatabase.db,
  );

  expect(moved.delivery).toMatchObject({
    revisionId: revised.currentRevision.id,
    questions: [{ promptMarkdown: "Choose the updated correct option." }],
  });
  expect(moved.answers).toEqual([
    expect.objectContaining({
      answer: { optionId: correctOptionId, type: "single_choice" },
      correct: null,
      earnedPoints: null,
      flagged: true,
    }),
  ]);
});

test("drops answers that are incompatible with an accepted Quiz revision", async () => {
  const artifact = await createReadyQuiz();
  const attempt = await startQuizAttempt(
    alice,
    { artifactId: artifact.id, workspaceId },
    testDatabase.db,
  );
  await saveQuizAttemptAnswer(
    alice,
    {
      answer: { optionId: correctOptionId, type: "single_choice" },
      artifactId: artifact.id,
      attemptId: attempt.id,
      expectedVersion: 0,
      flagged: false,
      questionId,
      workspaceId,
    },
    testDatabase.db,
  );
  const replacementOptionId = "00000000-0000-4000-8000-000000000105";
  const revisedContent = content("Quiz V2");
  const revisedQuestion = revisedContent.questions[0];
  if (revisedQuestion?.type !== "single_choice") {
    throw new Error("Quiz fixture single-choice question is missing");
  }
  revisedContent.questions[0] = {
    ...revisedQuestion,
    correctOptionId: distractorId,
    options: [
      { optionId: distractorId, text: "New correct answer" },
      { optionId: replacementOptionId, text: "New distractor" },
    ],
  };
  const revised = await saveQuizRevision(
    alice,
    {
      artifactId: artifact.id,
      content: revisedContent,
      conversationId,
      expectedRevisionId: artifact.currentRevision.id,
      workspaceId,
    },
    testDatabase.db,
  );

  const moved = await moveQuizAttemptToRevision(
    alice,
    {
      artifactId: artifact.id,
      attemptId: attempt.id,
      expectedRevisionId: artifact.currentRevision.id,
      targetRevisionId: revised.currentRevision.id,
      workspaceId,
    },
    testDatabase.db,
  );

  expect(moved.delivery.revisionId).toBe(revised.currentRevision.id);
  expect(moved.answers).toEqual([]);
});

test("Attempt reads and writes remain scoped to the authorized Actor", async () => {
  const artifact = await createReadyQuiz();
  const attempt = await startQuizAttempt(
    alice,
    { artifactId: artifact.id, workspaceId },
    testDatabase.db,
  );
  await expect(
    getQuizAttempt(
      bob,
      { artifactId: artifact.id, attemptId: attempt.id, workspaceId },
      testDatabase.db,
    ),
  ).rejects.toEqual(new QuizError("quiz_attempt_not_found"));
  await expect(
    saveQuizAttemptAnswer(
      bob,
      {
        answer: { optionId: correctOptionId, type: "single_choice" },
        artifactId: artifact.id,
        attemptId: attempt.id,
        expectedVersion: 0,
        flagged: false,
        questionId,
        workspaceId,
      },
      testDatabase.db,
    ),
  ).rejects.toEqual(new QuizError("quiz_attempt_not_found"));
});

test("shared readers can attempt a published Quiz but only access their own Attempt", async () => {
  const artifact = await createReadyQuiz();
  await testDatabase.db.insert(workspacePermissionGrants).values({
    grantedByPrincipalId: alice.principalId,
    permission: "workspace.read",
    principalId: bob.principalId,
    workspaceId,
  });

  await expect(
    startQuizAttempt(bob, { artifactId: artifact.id, workspaceId }, testDatabase.db),
  ).rejects.toEqual(new QuizError("quiz_not_found"));

  await publishArtifactSource(
    alice,
    { artifactId: artifact.id, conversationId, workspaceId },
    {
      db: testDatabase.db,
      enqueueKnowledgeIndex: async () => undefined,
    },
  );
  const bobAttempt = await startQuizAttempt(
    bob,
    { artifactId: artifact.id, workspaceId },
    testDatabase.db,
  );

  await expect(
    getQuizAttempt(
      alice,
      { artifactId: artifact.id, attemptId: bobAttempt.id, workspaceId },
      testDatabase.db,
    ),
  ).rejects.toEqual(new QuizError("quiz_attempt_not_found"));
  await expect(
    listQuizAttempts(bob, { artifactId: artifact.id, workspaceId }, testDatabase.db),
  ).resolves.toEqual([expect.objectContaining({ id: bobAttempt.id })]);
  await expect(
    listQuizAttempts(alice, { artifactId: artifact.id, workspaceId }, testDatabase.db),
  ).resolves.toEqual([]);
});
