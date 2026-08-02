import { z } from "zod";
import { gameQuestionSchema, gameSkinSchema } from "@/features/artifacts/games/contract";
import { type QuizAnswer, quizAnswerSchema } from "@/features/artifacts/quizzes/contract";

const gameOverviewSchema = z
  .object({
    overview: z
      .object({
        artifactId: z.string().uuid(),
        descriptionMarkdown: z.string(),
        maximumRevivalRounds: z.number().int(),
        personalBest: z.number().int(),
        questionCount: z.number().int(),
        skin: gameSkinSchema,
        title: z.string(),
      })
      .strict(),
  })
  .strict();

const gameRunSchema = z
  .object({
    id: z.string().uuid(),
    seed: z.string(),
    state: z.enum(["in_progress", "awaiting_revival", "finished", "abandoned"]),
    currentScore: z.number().int(),
    finalScore: z.number().int().nullable(),
    successfulRevivals: z.number().int(),
  })
  .passthrough();

const gameStartSchema = z.object({ personalBest: z.number().int(), run: gameRunSchema }).strict();

const gameDeathSchema = z
  .object({
    death: z.object({ id: z.string().uuid() }).passthrough(),
    revivalAvailable: z.boolean(),
  })
  .strict();

const gameRevivalQuestionSchema = z.discriminatedUnion("type", [
  z
    .object({
      difficulty: z.enum(["easy", "medium", "hard"]),
      options: z.array(z.object({ optionId: z.string().uuid(), text: z.string() }).strict()),
      points: z.number().int(),
      promptMarkdown: z.string(),
      questionId: z.string().uuid(),
      type: z.literal("single_choice"),
    })
    .strict(),
  z
    .object({
      difficulty: z.enum(["easy", "medium", "hard"]),
      points: z.number().int(),
      promptMarkdown: z.string(),
      questionId: z.string().uuid(),
      type: z.literal("true_false"),
    })
    .strict(),
]);

const gameRevivalSchema = z.union([
  z.object({ available: z.literal(false), personalBest: z.number().int() }).strict(),
  z
    .object({
      available: z.literal(true),
      delivery: z
        .object({
          questions: z.array(gameRevivalQuestionSchema).length(3),
          roundId: z.string().uuid(),
        })
        .strict(),
    })
    .strict(),
]);

const gameRevivalSubmissionSchema = z
  .object({
    correctCount: z.number().int(),
    personalBest: z.number().int(),
    revived: z.boolean(),
    state: z.enum(["in_progress", "finished"]),
  })
  .strict();

const gameRunResultSchema = z
  .object({
    personalBest: z.number().int(),
    review: z
      .array(
        z
          .object({
            correctCount: z.number().int().nullable(),
            questions: z.array(
              z
                .object({ answer: quizAnswerSchema.nullable(), question: gameQuestionSchema })
                .strict(),
            ),
            state: z.string(),
          })
          .strict(),
      )
      .nullable(),
    run: gameRunSchema,
  })
  .strict();

export type GameQuestion = z.infer<typeof gameQuestionSchema>;
export type GameRevivalDelivery = Extract<
  z.infer<typeof gameRevivalSchema>,
  { available: true }
>["delivery"];
export type GameRun = z.infer<typeof gameRunSchema>;
export type GameRunResult = z.infer<typeof gameRunResultSchema>;
export type GameRunResultPayload =
  | { result: GameRunResult; valid: true }
  | { result: null; valid: false };
export type GameSkin = z.infer<typeof gameSkinSchema>;

async function responseJson(response: Response) {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`game_request_failed:${response.status}`);
  return body;
}

function gameUrl(artifactId: string, suffix: string, workspaceId: string) {
  return `/api/artifacts/game/${artifactId}${suffix}?workspaceId=${encodeURIComponent(workspaceId)}`;
}

function gameResultPayload(body: unknown): GameRunResultPayload {
  const parsed = gameRunResultSchema.safeParse(body);
  return parsed.success ? { result: parsed.data, valid: true } : { result: null, valid: false };
}

export async function fetchGameOverview(artifactId: string, workspaceId: string) {
  return gameOverviewSchema.parse(
    await responseJson(await fetch(gameUrl(artifactId, "", workspaceId))),
  ).overview;
}

export async function startGameRun(artifactId: string, workspaceId: string) {
  return gameStartSchema.parse(
    await responseJson(
      await fetch(gameUrl(artifactId, "/runs", workspaceId), {
        body: JSON.stringify({
          idempotencyKey: crypto.randomUUID(),
          surfaceKey: "artifact-workbench",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    ),
  );
}

export function abandonGameRun(artifactId: string, runId: string, workspaceId: string) {
  return fetch(gameUrl(artifactId, `/runs/${runId}`, workspaceId), {
    keepalive: true,
    method: "DELETE",
  });
}

export async function fetchGameRunResult(artifactId: string, runId: string, workspaceId: string) {
  return gameResultPayload(
    await responseJson(await fetch(gameUrl(artifactId, `/runs/${runId}`, workspaceId))),
  );
}

export async function recordGameDeath(input: {
  artifactId: string;
  runId: string;
  summary: { elapsedMs: number; flapCount: number; score: number };
  workspaceId: string;
}) {
  return gameDeathSchema.parse(
    await responseJson(
      await fetch(gameUrl(input.artifactId, `/runs/${input.runId}/deaths`, input.workspaceId), {
        body: JSON.stringify({ ...input.summary, idempotencyKey: crypto.randomUUID() }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    ),
  );
}

export async function requestGameRevival(input: {
  artifactId: string;
  deathId: string;
  runId: string;
  workspaceId: string;
}) {
  return gameRevivalSchema.parse(
    await responseJson(
      await fetch(
        gameUrl(
          input.artifactId,
          `/runs/${input.runId}/deaths/${input.deathId}/revival`,
          input.workspaceId,
        ),
        { method: "POST" },
      ),
    ),
  );
}

export async function submitGameRevival(input: {
  answers: Array<{ answer: QuizAnswer | undefined; questionId: string }>;
  artifactId: string;
  idempotencyKey: string;
  roundId: string;
  runId: string;
  workspaceId: string;
}) {
  return gameRevivalSubmissionSchema.parse(
    await responseJson(
      await fetch(
        gameUrl(
          input.artifactId,
          `/runs/${input.runId}/rounds/${input.roundId}/submit`,
          input.workspaceId,
        ),
        {
          body: JSON.stringify({
            answers: input.answers,
            idempotencyKey: input.idempotencyKey,
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      ),
    ),
  );
}

export async function finishGameRun(input: {
  artifactId: string;
  runId: string;
  score: number;
  workspaceId: string;
}) {
  return gameResultPayload(
    await responseJson(
      await fetch(gameUrl(input.artifactId, `/runs/${input.runId}/finish`, input.workspaceId), {
        body: JSON.stringify({ score: input.score }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    ),
  );
}
