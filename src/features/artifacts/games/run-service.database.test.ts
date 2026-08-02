import { createMigratedTestDatabase } from "@tests/database";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { ensurePrincipalForAuthUser } from "@/features/identity/service";
import type { Actor } from "@/features/identity/types";
import { createWorkspace } from "@/features/workspaces/service";
import type { FlapRevivalGameRevisionContent } from "./contract";
import {
  createGameRevivalRound,
  getGameRun,
  reportGameDeath,
  startGameRun,
  submitGameRevivalRound,
} from "./run-service";
import {
  claimGameGeneration,
  completeGameGeneration,
  finalizeGameGeneration,
  startGameGeneration,
} from "./service";

let testDatabase: Awaited<ReturnType<typeof createMigratedTestDatabase>>;
let actor: Actor;
let workspaceId: string;
const conversationId = "20000000-0000-4000-8000-000000000001";
const questionId = (index: number) =>
  `20000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`;
const optionId = (index: number) =>
  `30000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`;

function gameContent(): FlapRevivalGameRevisionContent {
  return {
    descriptionMarkdown: "Run service fixture",
    questions: Array.from({ length: 6 }, (_, index) => ({
      correctOptionId: optionId(index * 2),
      difficulty: "easy" as const,
      explanationMarkdown: "The first option is correct.",
      options: [
        { optionId: optionId(index * 2), text: "Correct" },
        { optionId: optionId(index * 2 + 1), text: "Distractor" },
      ],
      points: 1,
      promptMarkdown: `Question ${index + 1}`,
      questionId: questionId(index),
      type: "single_choice" as const,
    })),
    revival: { questionCount: 3, requiredCorrect: 2 },
    schemaVersion: 1,
    skin: "skyline_day",
    template: "flap_revival",
    title: "Fixture game",
  };
}

async function createReadyGame() {
  const started = await startGameGeneration(
    actor,
    {
      conversationId,
      locale: "en-US",
      prompt: "Create a game",
      sourceUserMessageId: `test:${crypto.randomUUID()}`,
      workspaceId,
    },
    { async enqueue() {} },
    testDatabase.db,
  );
  const attemptId = started.generationAttemptId;
  if (!attemptId) throw new Error("Generation attempt missing");
  await claimGameGeneration(started.id, attemptId, testDatabase.db);
  await finalizeGameGeneration(started.id, attemptId, testDatabase.db);
  return completeGameGeneration(
    started.id,
    attemptId,
    actor.principalId,
    gameContent(),
    testDatabase.db,
  );
}

beforeAll(async () => {
  testDatabase = await createMigratedTestDatabase();
});

beforeEach(async () => {
  await testDatabase.pool.query(
    "TRUNCATE TABLE public.game_revival_rounds, public.game_run_deaths, public.game_runs, public.artifact_revisions, public.artifacts, public.workspaces, public.principals CASCADE",
  );
  actor = await ensurePrincipalForAuthUser("game-alice", "game-alice", testDatabase.db);
  workspaceId = (await createWorkspace(actor, { name: "Game course" }, testDatabase.db)).id;
});

afterAll(async () => {
  if (testDatabase) await testDatabase.destroy();
});

test("pins a run, redacts delivery, revives transactionally, and finishes after a failed round", async () => {
  const artifact = await createReadyGame();
  const started = await startGameRun(
    actor,
    {
      artifactId: artifact.id,
      idempotencyKey: "start-1",
      surfaceKey: "browser-1",
      workspaceId,
    },
    testDatabase.db,
  );
  const replay = await startGameRun(
    actor,
    {
      artifactId: artifact.id,
      idempotencyKey: "start-1",
      surfaceKey: "browser-1",
      workspaceId,
    },
    testDatabase.db,
  );
  expect(replay.run.id).toBe(started.run.id);

  const firstDeath = await reportGameDeath(
    actor,
    {
      artifactId: artifact.id,
      elapsedMs: 5_000,
      flapCount: 8,
      idempotencyKey: "death-1",
      runId: started.run.id,
      score: 2,
      workspaceId,
    },
    testDatabase.db,
  );
  expect(firstDeath.revivalAvailable).toBe(true);
  const firstRound = await createGameRevivalRound(
    actor,
    { artifactId: artifact.id, deathId: firstDeath.death.id, runId: started.run.id, workspaceId },
    testDatabase.db,
  );
  expect(firstRound.available).toBe(true);
  if (!firstRound.available) throw new Error("fixture_round_unavailable");
  const deliveryJson = JSON.stringify(firstRound.delivery);
  expect(deliveryJson).not.toContain("correctOptionId");
  expect(deliveryJson).not.toContain("explanationMarkdown");

  const content = gameContent();
  const correct = new Map(
    content.questions.map((question) => [
      question.questionId,
      question.type === "single_choice" ? question.correctOptionId : null,
    ]),
  );
  const passed = await submitGameRevivalRound(
    actor,
    {
      artifactId: artifact.id,
      roundId: firstRound.delivery.roundId,
      runId: started.run.id,
      submission: {
        answers: firstRound.delivery.questions.map((question) => ({
          answer: {
            optionId: correct.get(question.questionId) ?? null,
            type: "single_choice" as const,
          },
          questionId: question.questionId,
        })),
        idempotencyKey: "submit-1",
      },
      workspaceId,
    },
    testDatabase.db,
  );
  expect(passed).toMatchObject({ correctCount: 3, revived: true, state: "in_progress" });

  const secondDeath = await reportGameDeath(
    actor,
    {
      artifactId: artifact.id,
      elapsedMs: 9_000,
      flapCount: 14,
      idempotencyKey: "death-2",
      runId: started.run.id,
      score: 4,
      workspaceId,
    },
    testDatabase.db,
  );
  expect(secondDeath.revivalAvailable).toBe(true);
  const secondRound = await createGameRevivalRound(
    actor,
    { artifactId: artifact.id, deathId: secondDeath.death.id, runId: started.run.id, workspaceId },
    testDatabase.db,
  );
  if (!secondRound.available) throw new Error("fixture_round_unavailable");
  const replayedSecondDeath = await reportGameDeath(
    actor,
    {
      artifactId: artifact.id,
      elapsedMs: 9_000,
      flapCount: 14,
      idempotencyKey: "death-2",
      runId: started.run.id,
      score: 4,
      workspaceId,
    },
    testDatabase.db,
  );
  expect(replayedSecondDeath).toMatchObject({
    death: { id: secondDeath.death.id },
    revivalAvailable: true,
  });
  const failed = await submitGameRevivalRound(
    actor,
    {
      artifactId: artifact.id,
      roundId: secondRound.delivery.roundId,
      runId: started.run.id,
      submission: {
        answers: secondRound.delivery.questions.map((question) => ({
          answer: { optionId: null, type: "single_choice" as const },
          questionId: question.questionId,
        })),
        idempotencyKey: "submit-2",
      },
      workspaceId,
    },
    testDatabase.db,
  );
  expect(failed).toMatchObject({
    correctCount: 0,
    personalBest: 4,
    revived: false,
    state: "finished",
  });
  const result = await getGameRun(
    actor,
    { artifactId: artifact.id, runId: started.run.id, workspaceId },
    testDatabase.db,
  );
  expect(result.run).toMatchObject({ finalScore: 4, state: "finished", successfulRevivals: 1 });
  expect(result.review).toHaveLength(2);
});

test("finishes the run when a death exhausts the revival question pool", async () => {
  const artifact = await createReadyGame();
  const started = await startGameRun(
    actor,
    {
      artifactId: artifact.id,
      idempotencyKey: "start-exhaustion",
      surfaceKey: "browser-1",
      workspaceId,
    },
    testDatabase.db,
  );
  const correctAnswers = new Map(
    gameContent().questions.map((question) => [
      question.questionId,
      question.type === "single_choice" ? question.correctOptionId : null,
    ]),
  );

  for (let index = 0; index < 2; index += 1) {
    const death = await reportGameDeath(
      actor,
      {
        artifactId: artifact.id,
        elapsedMs: 5_000 + index * 1_000,
        flapCount: 8 + index,
        idempotencyKey: `death-exhaustion-${index}`,
        runId: started.run.id,
        score: index + 1,
        workspaceId,
      },
      testDatabase.db,
    );
    expect(death.revivalAvailable).toBe(true);
    const round = await createGameRevivalRound(
      actor,
      { artifactId: artifact.id, deathId: death.death.id, runId: started.run.id, workspaceId },
      testDatabase.db,
    );
    if (!round.available) throw new Error("fixture_round_unavailable");
    const submission = await submitGameRevivalRound(
      actor,
      {
        artifactId: artifact.id,
        roundId: round.delivery.roundId,
        runId: started.run.id,
        submission: {
          answers: round.delivery.questions.map((question) => ({
            answer: {
              optionId: correctAnswers.get(question.questionId) ?? null,
              type: "single_choice" as const,
            },
            questionId: question.questionId,
          })),
          idempotencyKey: `submit-exhaustion-${index}`,
        },
        workspaceId,
      },
      testDatabase.db,
    );
    expect(submission.revived).toBe(true);
  }

  const exhausted = await reportGameDeath(
    actor,
    {
      artifactId: artifact.id,
      elapsedMs: 8_000,
      flapCount: 12,
      idempotencyKey: "death-exhausted",
      runId: started.run.id,
      score: 3,
      workspaceId,
    },
    testDatabase.db,
  );
  expect(exhausted.revivalAvailable).toBe(false);
  const result = await getGameRun(
    actor,
    { artifactId: artifact.id, runId: started.run.id, workspaceId },
    testDatabase.db,
  );
  expect(result.run).toMatchObject({
    currentScore: 3,
    finalScore: 3,
    finishReason: "question_pool_exhausted",
    state: "finished",
    successfulRevivals: 2,
  });
});

test("starting a new run abandons the active run on the same browser surface", async () => {
  const artifact = await createReadyGame();
  const first = await startGameRun(
    actor,
    { artifactId: artifact.id, idempotencyKey: "start-a", surfaceKey: "browser-1", workspaceId },
    testDatabase.db,
  );
  await startGameRun(
    actor,
    { artifactId: artifact.id, idempotencyKey: "start-b", surfaceKey: "browser-1", workspaceId },
    testDatabase.db,
  );
  const abandoned = await getGameRun(
    actor,
    { artifactId: artifact.id, runId: first.run.id, workspaceId },
    testDatabase.db,
  );
  expect(abandoned.run.state).toBe("abandoned");
  expect(abandoned.personalBest).toBe(0);
});

test("replays concurrent starts with the same idempotency key", async () => {
  const artifact = await createReadyGame();
  const input = {
    artifactId: artifact.id,
    idempotencyKey: "start-concurrent",
    surfaceKey: "browser-1",
    workspaceId,
  };

  const [first, replay] = await Promise.all([
    startGameRun(actor, input, testDatabase.db),
    startGameRun(actor, input, testDatabase.db),
  ]);

  expect(replay.run.id).toBe(first.run.id);
});
