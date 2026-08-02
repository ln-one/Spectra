import "server-only";

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, exists, inArray, isNull, max, or } from "drizzle-orm";
import { z } from "zod";
import { type Database, type DatabaseTransaction, database } from "@/database/client";
import {
  artifactRevisions,
  artifactSources,
  artifacts,
  gameRevivalRounds,
  gameRunDeaths,
  gameRuns,
  sources,
} from "@/database/schema";
import type { Actor } from "@/features/identity/types";
import { requireWorkspacePermission } from "@/features/workspaces/access.server";
import type { QuizAnswer } from "../quizzes/contract";
import { createQuizDeliveryQuestions } from "../quizzes/delivery";
import { gradeQuizQuestion } from "../quizzes/grading";
import {
  FLAP_RUNTIME_VERSION,
  type FlapRevivalGameRevisionContent,
  flapRevivalGameRevisionContentSchema,
  gameRevivalSubmissionSchema,
} from "./contract";
import { GameError } from "./errors";
import { seededShuffle } from "./random";

const idSchema = z.string().uuid();
type RunScope = { artifactId: string; runId: string; workspaceId: string };

async function ownedRun(
  actor: Actor,
  input: RunScope,
  db: Database | DatabaseTransaction,
  lock = false,
) {
  await requireWorkspacePermission(actor, input.workspaceId, "workspace.read", db);
  const query = db
    .select({ artifact: artifacts, revision: artifactRevisions, run: gameRuns })
    .from(gameRuns)
    .innerJoin(artifacts, eq(artifacts.id, gameRuns.artifactId))
    .innerJoin(
      artifactRevisions,
      and(
        eq(artifactRevisions.id, gameRuns.artifactRevisionId),
        eq(artifactRevisions.artifactId, gameRuns.artifactId),
      ),
    )
    .where(
      and(
        eq(gameRuns.id, idSchema.parse(input.runId)),
        eq(gameRuns.artifactId, idSchema.parse(input.artifactId)),
        eq(artifacts.workspaceId, idSchema.parse(input.workspaceId)),
        eq(gameRuns.actorPrincipalId, actor.principalId),
        eq(artifacts.kind, "game"),
        isNull(artifacts.deletedAt),
      ),
    )
    .limit(1);
  const [row] = lock ? await query.for("update") : await query;
  if (!row) throw new GameError("game_run_not_found");
  return { ...row, content: flapRevivalGameRevisionContentSchema.parse(row.revision.content) };
}

async function personalBest(actor: Actor, artifactId: string, db: Database | DatabaseTransaction) {
  const [row] = await db
    .select({ score: max(gameRuns.finalScore) })
    .from(gameRuns)
    .where(
      and(
        eq(gameRuns.actorPrincipalId, actor.principalId),
        eq(gameRuns.artifactId, artifactId),
        eq(gameRuns.state, "finished"),
      ),
    );
  return row?.score ?? 0;
}

export async function getGameOverview(
  actor: Actor,
  input: { artifactId: string; workspaceId: string },
  db: Database = database,
) {
  const parsed = z.object({ artifactId: idSchema, workspaceId: idSchema }).strict().parse(input);
  await requireWorkspacePermission(actor, parsed.workspaceId, "workspace.read", db);
  const [row] = await db
    .select({ artifact: artifacts, revision: artifactRevisions })
    .from(artifacts)
    .innerJoin(
      artifactRevisions,
      and(
        eq(artifactRevisions.id, artifacts.currentRevisionId),
        eq(artifactRevisions.artifactId, artifacts.id),
      ),
    )
    .where(
      and(
        eq(artifacts.id, parsed.artifactId),
        eq(artifacts.workspaceId, parsed.workspaceId),
        or(
          eq(artifacts.createdByPrincipalId, actor.principalId),
          exists(
            db
              .select({ sourceId: artifactSources.sourceId })
              .from(artifactSources)
              .innerJoin(sources, eq(artifactSources.sourceId, sources.id))
              .where(and(eq(artifactSources.artifactId, artifacts.id), isNull(sources.deletedAt))),
          ),
        ),
        eq(artifacts.kind, "game"),
        eq(artifacts.generationState, "ready"),
        isNull(artifacts.deletedAt),
      ),
    )
    .limit(1);
  if (!row) throw new GameError("game_not_found");
  const content = flapRevivalGameRevisionContentSchema.parse(row.revision.content);
  return {
    artifactId: row.artifact.id,
    descriptionMarkdown: content.descriptionMarkdown,
    maximumRevivalRounds: Math.floor(content.questions.length / content.revival.questionCount),
    personalBest: await personalBest(actor, row.artifact.id, db),
    questionCount: content.questions.length,
    skin: content.skin,
    title: content.title,
  };
}

export async function startGameRun(
  actor: Actor,
  input: { artifactId: string; idempotencyKey: string; surfaceKey: string; workspaceId: string },
  db: Database = database,
) {
  const parsed = z
    .object({
      artifactId: idSchema,
      idempotencyKey: z.string().trim().min(1).max(128),
      surfaceKey: z.string().trim().min(1).max(128),
      workspaceId: idSchema,
    })
    .strict()
    .parse(input);
  await requireWorkspacePermission(actor, parsed.workspaceId, "workspace.read", db);
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ artifact: artifacts, revision: artifactRevisions })
      .from(artifacts)
      .innerJoin(
        artifactRevisions,
        and(
          eq(artifactRevisions.id, artifacts.currentRevisionId),
          eq(artifactRevisions.artifactId, artifacts.id),
        ),
      )
      .where(
        and(
          eq(artifacts.id, parsed.artifactId),
          eq(artifacts.workspaceId, parsed.workspaceId),
          eq(artifacts.kind, "game"),
          eq(artifacts.generationState, "ready"),
          isNull(artifacts.deletedAt),
          or(
            eq(artifacts.createdByPrincipalId, actor.principalId),
            exists(
              tx
                .select({ sourceId: artifactSources.sourceId })
                .from(artifactSources)
                .innerJoin(sources, eq(artifactSources.sourceId, sources.id))
                .where(
                  and(eq(artifactSources.artifactId, artifacts.id), isNull(sources.deletedAt)),
                ),
            ),
          ),
        ),
      )
      .limit(1)
      .for("update");
    if (!current) throw new GameError("game_not_found");
    const [existing] = await tx
      .select()
      .from(gameRuns)
      .where(
        and(
          eq(gameRuns.actorPrincipalId, actor.principalId),
          eq(gameRuns.artifactId, parsed.artifactId),
          eq(gameRuns.startRequestId, parsed.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing)
      return { personalBest: await personalBest(actor, parsed.artifactId, tx), run: existing };
    const content = flapRevivalGameRevisionContentSchema.parse(current.revision.content);
    const now = new Date();
    await tx
      .update(gameRuns)
      .set({ abandonedAt: now, state: "abandoned", updatedAt: now })
      .where(
        and(
          eq(gameRuns.actorPrincipalId, actor.principalId),
          eq(gameRuns.artifactId, parsed.artifactId),
          eq(gameRuns.surfaceKey, parsed.surfaceKey),
          inArray(gameRuns.state, ["in_progress", "awaiting_revival"]),
        ),
      );
    const seed = randomUUID();
    const [created] = await tx
      .insert(gameRuns)
      .values({
        artifactId: current.artifact.id,
        artifactRevisionId: current.revision.id,
        actorPrincipalId: actor.principalId,
        questionOrder: seededShuffle(
          content.questions.map((question) => question.questionId),
          seed,
        ),
        runtimeVersion: FLAP_RUNTIME_VERSION,
        seed,
        startRequestId: parsed.idempotencyKey,
        surfaceKey: parsed.surfaceKey,
      })
      .returning();
    if (!created) throw new GameError("game_run_conflict");
    return { personalBest: await personalBest(actor, parsed.artifactId, tx), run: created };
  });
}

export async function reportGameDeath(
  actor: Actor,
  input: RunScope & { elapsedMs: number; flapCount: number; idempotencyKey: string; score: number },
  db: Database = database,
) {
  const parsed = z
    .object({
      artifactId: idSchema,
      runId: idSchema,
      workspaceId: idSchema,
      elapsedMs: z.number().int().min(0),
      flapCount: z.number().int().min(0),
      idempotencyKey: z.string().trim().min(1).max(128),
      score: z.number().int().min(0),
    })
    .strict()
    .parse(input);
  return db.transaction(async (tx) => {
    const row = await ownedRun(actor, parsed, tx, true);
    const priorRounds = await tx
      .select({ deathId: gameRevivalRounds.deathId })
      .from(gameRevivalRounds)
      .where(eq(gameRevivalRounds.runId, row.run.id));
    const unusedQuestionsAvailable =
      row.run.questionOrder.length - priorRounds.length * row.content.revival.questionCount >=
      row.content.revival.questionCount;
    const [existing] = await tx
      .select()
      .from(gameRunDeaths)
      .where(
        and(
          eq(gameRunDeaths.runId, row.run.id),
          eq(gameRunDeaths.requestId, parsed.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) {
      const hasBoundRound = priorRounds.some((round) => round.deathId === existing.id);
      return {
        death: existing,
        revivalAvailable: hasBoundRound || unusedQuestionsAvailable,
      };
    }
    if (row.run.state !== "in_progress" || parsed.score < row.run.currentScore)
      throw new GameError("game_run_conflict");
    const [latest] = await tx
      .select({ sequence: gameRunDeaths.sequence })
      .from(gameRunDeaths)
      .where(eq(gameRunDeaths.runId, row.run.id))
      .orderBy(desc(gameRunDeaths.sequence))
      .limit(1);
    const [death] = await tx
      .insert(gameRunDeaths)
      .values({
        elapsedMs: parsed.elapsedMs,
        flapCount: parsed.flapCount,
        requestId: parsed.idempotencyKey,
        runId: row.run.id,
        score: parsed.score,
        sequence: (latest?.sequence ?? 0) + 1,
      })
      .returning();
    const now = new Date();
    await tx
      .update(gameRuns)
      .set(
        unusedQuestionsAvailable
          ? { currentScore: parsed.score, state: "awaiting_revival", updatedAt: now }
          : {
              currentScore: parsed.score,
              finalScore: parsed.score,
              finishedAt: now,
              finishReason: "question_pool_exhausted",
              state: "finished",
              updatedAt: now,
            },
      )
      .where(eq(gameRuns.id, row.run.id));
    if (!death) throw new GameError("game_run_conflict");
    return { death, revivalAvailable: unusedQuestionsAvailable };
  });
}

export async function createGameRevivalRound(
  actor: Actor,
  input: RunScope & { deathId: string },
  db: Database = database,
) {
  const parsed = z
    .object({ artifactId: idSchema, deathId: idSchema, runId: idSchema, workspaceId: idSchema })
    .strict()
    .parse(input);
  return db.transaction(async (tx) => {
    const row = await ownedRun(actor, parsed, tx, true);
    const [death] = await tx
      .select()
      .from(gameRunDeaths)
      .where(and(eq(gameRunDeaths.id, parsed.deathId), eq(gameRunDeaths.runId, row.run.id)))
      .limit(1);
    if (!death || row.run.state !== "awaiting_revival")
      throw new GameError("game_revival_unavailable");
    const [existing] = await tx
      .select()
      .from(gameRevivalRounds)
      .where(eq(gameRevivalRounds.deathId, death.id))
      .limit(1);
    const round =
      existing ??
      (await (async () => {
        const prior = await tx
          .select({ id: gameRevivalRounds.id })
          .from(gameRevivalRounds)
          .where(eq(gameRevivalRounds.runId, row.run.id));
        const offset = prior.length * row.content.revival.questionCount;
        const questionIds = row.run.questionOrder.slice(
          offset,
          offset + row.content.revival.questionCount,
        );
        if (questionIds.length < row.content.revival.questionCount) {
          const now = new Date();
          await tx
            .update(gameRuns)
            .set({
              finalScore: row.run.currentScore,
              finishedAt: now,
              finishReason: "question_pool_exhausted",
              state: "finished",
              updatedAt: now,
            })
            .where(eq(gameRuns.id, row.run.id));
          return null;
        }
        const [created] = await tx
          .insert(gameRevivalRounds)
          .values({ deathId: death.id, questionIds, runId: row.run.id })
          .returning();
        return created ?? null;
      })());
    if (!round)
      return {
        available: false as const,
        personalBest: await personalBest(actor, row.run.artifactId, tx),
      };
    const questions = round.questionIds
      .map((questionId) =>
        row.content.questions.find((question) => question.questionId === questionId),
      )
      .filter(
        (question): question is FlapRevivalGameRevisionContent["questions"][number] =>
          question !== undefined,
      );
    if (questions.length !== 3) throw new GameError("game_revival_conflict");
    return {
      available: true as const,
      delivery: { questions: createQuizDeliveryQuestions(questions), roundId: round.id },
    };
  });
}

export async function submitGameRevivalRound(
  actor: Actor,
  input: RunScope & { roundId: string; submission: unknown },
  db: Database = database,
) {
  const parsed = z
    .object({
      artifactId: idSchema,
      roundId: idSchema,
      runId: idSchema,
      submission: gameRevivalSubmissionSchema,
      workspaceId: idSchema,
    })
    .strict()
    .parse(input);
  return db.transaction(async (tx) => {
    const row = await ownedRun(actor, parsed, tx, true);
    const [round] = await tx
      .select()
      .from(gameRevivalRounds)
      .where(and(eq(gameRevivalRounds.id, parsed.roundId), eq(gameRevivalRounds.runId, row.run.id)))
      .limit(1)
      .for("update");
    if (!round) throw new GameError("game_revival_conflict");
    if (round.state !== "in_progress") {
      if (round.submitRequestId !== parsed.submission.idempotencyKey)
        throw new GameError("game_revival_conflict");
      return {
        correctCount: round.correctCount ?? 0,
        personalBest: await personalBest(actor, row.run.artifactId, tx),
        revived: round.state === "passed",
        state: round.state === "passed" ? ("in_progress" as const) : ("finished" as const),
      };
    }
    if (row.run.state !== "awaiting_revival") throw new GameError("game_revival_conflict");
    const answers = new Map(
      parsed.submission.answers.map((answer) => [answer.questionId, answer.answer]),
    );
    if (answers.size !== 3 || round.questionIds.some((questionId) => !answers.has(questionId)))
      throw new GameError("game_revival_conflict");
    const questions = round.questionIds.map((questionId) =>
      row.content.questions.find((question) => question.questionId === questionId),
    );
    if (questions.some((question) => !question)) throw new GameError("game_revival_conflict");
    const correctCount = questions.reduce(
      (count, question) =>
        count +
        (question && gradeQuizQuestion(question, answers.get(question.questionId)).correct ? 1 : 0),
      0,
    );
    const revived = correctCount >= row.content.revival.requiredCorrect;
    const now = new Date();
    await tx
      .update(gameRevivalRounds)
      .set({
        answers: parsed.submission.answers as Array<{ questionId: string; answer: QuizAnswer }>,
        correctCount,
        state: revived ? "passed" : "failed",
        submitRequestId: parsed.submission.idempotencyKey,
        submittedAt: now,
        updatedAt: now,
      })
      .where(eq(gameRevivalRounds.id, round.id));
    await tx
      .update(gameRuns)
      .set(
        revived
          ? {
              state: "in_progress",
              successfulRevivals: row.run.successfulRevivals + 1,
              updatedAt: now,
            }
          : {
              finalScore: row.run.currentScore,
              finishedAt: now,
              finishReason: "revival_failed",
              state: "finished",
              updatedAt: now,
            },
      )
      .where(eq(gameRuns.id, row.run.id));
    return {
      correctCount,
      personalBest: await personalBest(actor, row.run.artifactId, tx),
      revived,
      state: revived ? ("in_progress" as const) : ("finished" as const),
    };
  });
}

export async function finishGameRun(
  actor: Actor,
  input: RunScope & { score: number },
  db: Database = database,
) {
  const parsed = z
    .object({
      artifactId: idSchema,
      runId: idSchema,
      score: z.number().int().min(0),
      workspaceId: idSchema,
    })
    .strict()
    .parse(input);
  return db.transaction(async (tx) => {
    const row = await ownedRun(actor, parsed, tx, true);
    if (row.run.state === "finished") return getGameRun(actor, parsed, tx);
    if (row.run.state === "abandoned" || parsed.score < row.run.currentScore)
      throw new GameError("game_run_conflict");
    const now = new Date();
    await tx
      .update(gameRuns)
      .set({
        currentScore: parsed.score,
        finalScore: parsed.score,
        finishedAt: now,
        finishReason: "ended",
        state: "finished",
        updatedAt: now,
      })
      .where(eq(gameRuns.id, row.run.id));
    return getGameRun(actor, parsed, tx);
  });
}

export async function abandonGameRun(actor: Actor, input: RunScope, db: Database = database) {
  const parsed = z
    .object({ artifactId: idSchema, runId: idSchema, workspaceId: idSchema })
    .strict()
    .parse(input);
  return db.transaction(async (tx) => {
    const row = await ownedRun(actor, parsed, tx, true);
    if (row.run.state === "finished" || row.run.state === "abandoned") return;
    const now = new Date();
    await tx
      .update(gameRuns)
      .set({ abandonedAt: now, state: "abandoned", updatedAt: now })
      .where(eq(gameRuns.id, row.run.id));
  });
}

export async function getGameRun(
  actor: Actor,
  input: RunScope,
  db: Database | DatabaseTransaction = database,
) {
  const row = await ownedRun(actor, input, db);
  const rounds = await db
    .select()
    .from(gameRevivalRounds)
    .where(eq(gameRevivalRounds.runId, row.run.id))
    .orderBy(asc(gameRevivalRounds.createdAt));
  const review =
    row.run.state === "finished"
      ? rounds.map((round) => ({
          correctCount: round.correctCount,
          questions: round.questionIds
            .map((questionId) =>
              row.content.questions.find((question) => question.questionId === questionId),
            )
            .filter(
              (question): question is FlapRevivalGameRevisionContent["questions"][number] =>
                question !== undefined,
            )
            .map((question) => ({
              answer:
                round.answers?.find((answer) => answer.questionId === question.questionId)
                  ?.answer ?? null,
              question,
            })),
          state: round.state,
        }))
      : null;
  return { personalBest: await personalBest(actor, row.run.artifactId, db), review, run: row.run };
}
