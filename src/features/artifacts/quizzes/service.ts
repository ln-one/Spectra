import "server-only";

import { randomUUID } from "node:crypto";
import { and, desc, eq, exists, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { type Database, type DatabaseTransaction, database } from "@/database/client";
import {
  artifactRevisions,
  artifactSources,
  artifacts,
  quizAttemptAnswers,
  quizAttempts,
  sources,
} from "@/database/schema";
import { createStructuredArtifactService } from "@/features/artifacts/structured-artifact-service.server";
import type { Actor } from "@/features/identity/types";
import { requireWorkspacePermission } from "@/features/workspaces/access.server";
import { WorkspaceError } from "@/features/workspaces/errors";
import {
  type QuizAnswer,
  type QuizAttemptDetail,
  type QuizQuestion,
  type QuizRevisionContent,
  quizAnswerSchema,
  quizGenerationRequestSchema,
  quizRevisionContentSchema,
} from "./contract";
import { createQuizDeliverySnapshot } from "./delivery";
import { QuizError } from "./errors";
import { gradeQuiz, gradeQuizQuestion } from "./grading";

const idSchema = z.string().uuid();

const service = createStructuredArtifactService({
  conflictError: () => new QuizError("quiz_conflict"),
  contentSchema: quizRevisionContentSchema,
  errorLabel: "Quiz",
  generationMetadata: { profileVersion: "quiz-strict-v1" },
  kind: "quiz",
  mapDeleteError: true,
  notFoundError: () => new QuizError("quiz_not_found"),
  purgeResources: async (artifactId, db) => {
    // Attempts pin the exact revision they were taken against.
    await db.delete(quizAttempts).where(eq(quizAttempts.artifactId, artifactId));
  },
  requestSchema: quizGenerationRequestSchema,
});

export const claimQuizGeneration = service.claimGeneration;
export const completeQuizGeneration = service.completeGeneration;
export const deleteQuizForConversation = service.deleteForConversation;
export const failQuizGeneration = service.failGeneration;
export const finalizeQuizGeneration = service.finalizeGeneration;
export const getQuizDetailForConversation = service.getDetailForConversation;
export const getQuizGenerationInputById = service.getGenerationInputById;
export const purgeDeletedQuizContent = service.purgeDeletedContent;
export const saveQuizRevision = service.saveRevision;
export const startQuizGeneration = service.startGeneration;

export async function issueQuizEntityIds(
  actor: Actor,
  input: { count: number; workspaceId: string },
  db: Database = database,
) {
  const parsed = z
    .object({ count: z.number().int().min(1).max(16), workspaceId: idSchema })
    .strict()
    .parse(input);
  await service.requirePrivateArtifactCreate(actor, parsed.workspaceId, db);
  return Array.from({ length: parsed.count }, () => randomUUID());
}

type AttemptScope = { artifactId: string; attemptId: string; workspaceId: string };

async function requireQuizWorkspaceRead(
  actor: Actor,
  workspaceId: string,
  errorCode: "quiz_attempt_not_found" | "quiz_not_found",
  db: Database | DatabaseTransaction,
) {
  try {
    await requireWorkspacePermission(actor, workspaceId, "workspace.read", db);
  } catch (error) {
    if (error instanceof WorkspaceError) throw new QuizError(errorCode);
    throw error;
  }
}

async function ownedAttempt(
  actor: Actor,
  input: AttemptScope,
  db: Database | DatabaseTransaction,
  lock = false,
) {
  await requireQuizWorkspaceRead(actor, input.workspaceId, "quiz_attempt_not_found", db);
  const query = db
    .select({ attempt: quizAttempts, artifact: artifacts, revision: artifactRevisions })
    .from(quizAttempts)
    .innerJoin(artifacts, eq(artifacts.id, quizAttempts.artifactId))
    .innerJoin(
      artifactRevisions,
      and(
        eq(artifactRevisions.id, quizAttempts.artifactRevisionId),
        eq(artifactRevisions.artifactId, quizAttempts.artifactId),
      ),
    )
    .where(
      and(
        eq(quizAttempts.id, idSchema.parse(input.attemptId)),
        eq(quizAttempts.artifactId, idSchema.parse(input.artifactId)),
        eq(artifacts.workspaceId, idSchema.parse(input.workspaceId)),
        eq(quizAttempts.actorPrincipalId, actor.principalId),
        eq(artifacts.kind, "quiz"),
        isNull(artifacts.deletedAt),
      ),
    )
    .limit(1);
  const [row] = lock ? await query.for("update") : await query;
  if (!row) throw new QuizError("quiz_attempt_not_found");
  return row;
}

function questionFor(content: QuizRevisionContent, questionId: string) {
  const question = content.questions.find((candidate) => candidate.questionId === questionId);
  if (!question) throw new QuizError("quiz_attempt_not_found");
  return question;
}

function assertAnswerMatchesQuestion(question: QuizQuestion, answer: QuizAnswer) {
  if (question.type !== answer.type) throw new QuizError("quiz_attempt_conflict");
  if (
    question.type === "single_choice" &&
    answer.type === "single_choice" &&
    answer.optionId &&
    !question.options.some((option) => option.optionId === answer.optionId)
  )
    throw new QuizError("quiz_attempt_conflict");
  if (question.type === "multiple_choice" && answer.type === "multiple_choice") {
    const valid = new Set(question.options.map((option) => option.optionId));
    if (answer.optionIds.some((id) => !valid.has(id))) throw new QuizError("quiz_attempt_conflict");
  }
}

function answerMatchesQuestion(question: QuizQuestion | undefined, answer: QuizAnswer) {
  if (!question || question.type !== answer.type) return false;
  if (question.type === "single_choice" && answer.type === "single_choice") {
    return (
      answer.optionId === null ||
      question.options.some((option) => option.optionId === answer.optionId)
    );
  }
  if (question.type === "multiple_choice" && answer.type === "multiple_choice") {
    const valid = new Set(question.options.map((option) => option.optionId));
    return answer.optionIds.every((id) => valid.has(id));
  }
  return true;
}

export async function moveQuizAttemptToRevision(
  actor: Actor,
  input: AttemptScope & { expectedRevisionId: string; targetRevisionId: string },
  db: Database | DatabaseTransaction = database,
) {
  const parsed = z
    .object({
      artifactId: idSchema,
      attemptId: idSchema,
      expectedRevisionId: idSchema,
      targetRevisionId: idSchema,
      workspaceId: idSchema,
    })
    .strict()
    .parse(input);
  return db.transaction(async (tx) => {
    const row = await ownedAttempt(actor, parsed, tx, true);
    if (row.attempt.state !== "in_progress") throw new QuizError("quiz_attempt_submitted");
    if (row.revision.id === parsed.targetRevisionId) return getQuizAttempt(actor, parsed, tx);
    if (row.revision.id !== parsed.expectedRevisionId) {
      throw new QuizError("quiz_attempt_conflict");
    }
    const [target] = await tx
      .select({ revision: artifactRevisions })
      .from(artifactRevisions)
      .where(
        and(
          eq(artifactRevisions.id, parsed.targetRevisionId),
          eq(artifactRevisions.artifactId, parsed.artifactId),
        ),
      )
      .limit(1);
    if (!target) throw new QuizError("quiz_attempt_conflict");
    const content = quizRevisionContentSchema.parse(target.revision.content);
    const questions = new Map(content.questions.map((question) => [question.questionId, question]));
    const answers = await tx
      .select()
      .from(quizAttemptAnswers)
      .where(eq(quizAttemptAnswers.attemptId, row.attempt.id))
      .for("update");
    const invalidAnswerIds = answers
      .filter((answer) => {
        const parsedAnswer = quizAnswerSchema.parse(answer.answer);
        return !answerMatchesQuestion(questions.get(answer.questionId), parsedAnswer);
      })
      .map((answer) => answer.id);
    if (invalidAnswerIds.length > 0) {
      await tx.delete(quizAttemptAnswers).where(inArray(quizAttemptAnswers.id, invalidAnswerIds));
    }
    await tx
      .update(quizAttemptAnswers)
      .set({ checkCount: 0, correct: null, earnedPoints: null, updatedAt: new Date() })
      .where(eq(quizAttemptAnswers.attemptId, row.attempt.id));
    await tx
      .update(quizAttempts)
      .set({
        artifactRevisionId: target.revision.id,
        feedbackMode: content.settings.feedbackMode,
        navigationMode: content.settings.navigationMode,
        updatedAt: new Date(),
      })
      .where(and(eq(quizAttempts.id, row.attempt.id), eq(quizAttempts.state, "in_progress")));
    return getQuizAttempt(actor, parsed, tx);
  });
}

export async function startQuizAttempt(
  actor: Actor,
  input: { artifactId: string; workspaceId: string },
  db: Database = database,
) {
  const parsed = z.object({ artifactId: idSchema, workspaceId: idSchema }).strict().parse(input);
  await requireQuizWorkspaceRead(actor, parsed.workspaceId, "quiz_not_found", db);
  const selected = await db.transaction(async (tx) => {
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
          eq(artifacts.kind, "quiz"),
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
    if (!current) throw new QuizError("quiz_not_found");
    const content = quizRevisionContentSchema.parse(current.revision.content);
    const [created] = await tx
      .insert(quizAttempts)
      .values({
        artifactId: current.artifact.id,
        artifactRevisionId: current.revision.id,
        actorPrincipalId: actor.principalId,
        feedbackMode: content.settings.feedbackMode,
        navigationMode: content.settings.navigationMode,
      })
      .onConflictDoNothing()
      .returning({ id: quizAttempts.id });
    if (created) {
      return {
        artifactRevisionId: current.revision.id,
        currentRevisionId: current.revision.id,
        id: created.id,
      };
    }
    const [existing] = await tx
      .select({ artifactRevisionId: quizAttempts.artifactRevisionId, id: quizAttempts.id })
      .from(quizAttempts)
      .where(
        and(
          eq(quizAttempts.artifactId, current.artifact.id),
          eq(quizAttempts.actorPrincipalId, actor.principalId),
          eq(quizAttempts.state, "in_progress"),
        ),
      )
      .limit(1);
    if (!existing) throw new QuizError("quiz_attempt_conflict");
    return { ...existing, currentRevisionId: current.revision.id };
  });
  if (selected.artifactRevisionId !== selected.currentRevisionId) {
    return moveQuizAttemptToRevision(
      actor,
      {
        ...parsed,
        attemptId: selected.id,
        expectedRevisionId: selected.artifactRevisionId,
        targetRevisionId: selected.currentRevisionId,
      },
      db,
    );
  }
  return getQuizAttempt(actor, { ...parsed, attemptId: selected.id }, db);
}

export async function listQuizAttempts(
  actor: Actor,
  input: { artifactId: string; workspaceId: string },
  db: Database = database,
) {
  const parsed = z.object({ artifactId: idSchema, workspaceId: idSchema }).strict().parse(input);
  await requireQuizWorkspaceRead(actor, parsed.workspaceId, "quiz_not_found", db);
  const rows = await db
    .select({ attempt: quizAttempts })
    .from(quizAttempts)
    .innerJoin(artifacts, eq(artifacts.id, quizAttempts.artifactId))
    .where(
      and(
        eq(quizAttempts.artifactId, parsed.artifactId),
        eq(quizAttempts.actorPrincipalId, actor.principalId),
        eq(artifacts.workspaceId, parsed.workspaceId),
        eq(artifacts.kind, "quiz"),
        isNull(artifacts.deletedAt),
      ),
    )
    .orderBy(desc(quizAttempts.createdAt));
  return rows.map(({ attempt }) => ({
    artifactRevisionId: attempt.artifactRevisionId,
    id: attempt.id,
    state: attempt.state,
    score: attempt.score,
    totalPoints: attempt.totalPoints,
    createdAt: attempt.createdAt.toISOString(),
    submittedAt: attempt.submittedAt?.toISOString() ?? null,
  }));
}

export async function getQuizAttempt(
  actor: Actor,
  input: AttemptScope,
  db: Database | DatabaseTransaction = database,
) {
  const row = await ownedAttempt(actor, input, db);
  const content = quizRevisionContentSchema.parse(row.revision.content);
  const answers = await db
    .select()
    .from(quizAttemptAnswers)
    .where(eq(quizAttemptAnswers.attemptId, row.attempt.id));
  let result: QuizAttemptDetail["result"] = null;
  if (row.attempt.state === "submitted") {
    const { graderVersion, score, submittedAt, totalPoints } = row.attempt;
    if (graderVersion === null || score === null || submittedAt === null || totalPoints === null) {
      throw new Error("Submitted quiz attempt result invariant failed");
    }
    result = {
      content,
      graderVersion,
      score,
      submittedAt: submittedAt.toISOString(),
      totalPoints,
    };
  }
  return {
    id: row.attempt.id,
    state: row.attempt.state as "in_progress" | "submitted" | "abandoned",
    delivery: createQuizDeliverySnapshot({
      artifactId: row.artifact.id,
      content,
      revisionId: row.revision.id,
    }),
    answers: answers.map((answer) => ({
      answer: quizAnswerSchema.parse(answer.answer),
      correct: answer.correct,
      earnedPoints: answer.earnedPoints,
      flagged: answer.flagged,
      questionId: answer.questionId,
      version: answer.version,
    })),
    result,
  };
}

export async function saveQuizAttemptAnswer(
  actor: Actor,
  input: AttemptScope & {
    answer: QuizAnswer;
    expectedVersion: number;
    flagged: boolean;
    questionId: string;
  },
  db: Database = database,
) {
  const parsed = z
    .object({
      artifactId: idSchema,
      attemptId: idSchema,
      workspaceId: idSchema,
      answer: quizAnswerSchema,
      expectedVersion: z.number().int().min(0),
      flagged: z.boolean(),
      questionId: idSchema,
    })
    .strict()
    .parse(input);
  return db.transaction(async (tx) => {
    const row = await ownedAttempt(actor, parsed, tx, true);
    if (row.attempt.state !== "in_progress") throw new QuizError("quiz_attempt_submitted");
    const question = questionFor(
      quizRevisionContentSchema.parse(row.revision.content),
      parsed.questionId,
    );
    assertAnswerMatchesQuestion(question, parsed.answer);
    const [existing] = await tx
      .select()
      .from(quizAttemptAnswers)
      .where(
        and(
          eq(quizAttemptAnswers.attemptId, row.attempt.id),
          eq(quizAttemptAnswers.questionId, parsed.questionId),
        ),
      )
      .limit(1)
      .for("update");
    if (!existing) {
      if (parsed.expectedVersion !== 0) throw new QuizError("quiz_attempt_conflict");
      const [created] = await tx
        .insert(quizAttemptAnswers)
        .values({
          answer: parsed.answer,
          attemptId: row.attempt.id,
          flagged: parsed.flagged,
          questionId: parsed.questionId,
        })
        .returning();
      if (!created) throw new QuizError("quiz_attempt_conflict");
      return {
        answer: quizAnswerSchema.parse(created.answer),
        correct: created.correct,
        earnedPoints: created.earnedPoints,
        flagged: created.flagged,
        questionId: created.questionId,
        version: created.version,
      };
    }
    if (existing.version !== parsed.expectedVersion) throw new QuizError("quiz_attempt_conflict");
    const [updated] = await tx
      .update(quizAttemptAnswers)
      .set({
        answer: parsed.answer,
        correct: null,
        earnedPoints: null,
        flagged: parsed.flagged,
        updatedAt: new Date(),
        version: existing.version + 1,
      })
      .where(
        and(
          eq(quizAttemptAnswers.id, existing.id),
          eq(quizAttemptAnswers.version, parsed.expectedVersion),
        ),
      )
      .returning();
    if (!updated) throw new QuizError("quiz_attempt_conflict");
    return {
      answer: quizAnswerSchema.parse(updated.answer),
      correct: updated.correct,
      earnedPoints: updated.earnedPoints,
      flagged: updated.flagged,
      questionId: updated.questionId,
      version: updated.version,
    };
  });
}

function correctAnswerFor(question: QuizQuestion) {
  if (question.type === "single_choice")
    return { optionId: question.correctOptionId, type: question.type } as const;
  if (question.type === "multiple_choice")
    return { optionIds: question.correctOptionIds, type: question.type } as const;
  return { type: question.type, value: question.correctAnswer } as const;
}

export async function checkQuizAttemptAnswer(
  actor: Actor,
  input: AttemptScope & { questionId: string },
  db: Database = database,
) {
  const parsed = z
    .object({
      artifactId: idSchema,
      attemptId: idSchema,
      workspaceId: idSchema,
      questionId: idSchema,
    })
    .strict()
    .parse(input);
  return db.transaction(async (tx) => {
    const row = await ownedAttempt(actor, parsed, tx, true);
    if (row.attempt.state !== "in_progress") throw new QuizError("quiz_attempt_submitted");
    if (row.attempt.feedbackMode !== "immediate") throw new QuizError("quiz_feedback_unavailable");
    const question = questionFor(
      quizRevisionContentSchema.parse(row.revision.content),
      parsed.questionId,
    );
    const [answer] = await tx
      .select()
      .from(quizAttemptAnswers)
      .where(
        and(
          eq(quizAttemptAnswers.attemptId, row.attempt.id),
          eq(quizAttemptAnswers.questionId, parsed.questionId),
        ),
      )
      .limit(1)
      .for("update");
    const grade = gradeQuizQuestion(question, answer?.answer);
    if (answer)
      await tx
        .update(quizAttemptAnswers)
        .set({
          checkCount: answer.checkCount + 1,
          correct: grade.correct,
          earnedPoints: grade.earnedPoints,
          updatedAt: new Date(),
        })
        .where(eq(quizAttemptAnswers.id, answer.id));
    return {
      ...grade,
      correctAnswer: correctAnswerFor(question),
      explanationMarkdown: question.explanationMarkdown,
    };
  });
}

export async function submitQuizAttempt(
  actor: Actor,
  input: AttemptScope,
  db: Database = database,
) {
  await db.transaction(async (tx) => {
    const row = await ownedAttempt(actor, input, tx, true);
    if (row.attempt.state === "submitted") return;
    if (row.attempt.state !== "in_progress") throw new QuizError("quiz_attempt_submitted");
    const content = quizRevisionContentSchema.parse(row.revision.content);
    const answers = await tx
      .select()
      .from(quizAttemptAnswers)
      .where(eq(quizAttemptAnswers.attemptId, row.attempt.id));
    const grade = gradeQuiz(
      content,
      new Map(answers.map((answer) => [answer.questionId, answer.answer])),
    );
    for (const question of grade.questions) {
      await tx
        .update(quizAttemptAnswers)
        .set({
          correct: question.correct,
          earnedPoints: question.earnedPoints,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(quizAttemptAnswers.attemptId, row.attempt.id),
            eq(quizAttemptAnswers.questionId, question.questionId),
          ),
        );
    }
    await tx
      .update(quizAttempts)
      .set({
        graderVersion: grade.graderVersion,
        score: grade.score,
        state: "submitted",
        submittedAt: new Date(),
        totalPoints: grade.totalPoints,
        updatedAt: new Date(),
      })
      .where(and(eq(quizAttempts.id, row.attempt.id), eq(quizAttempts.state, "in_progress")));
  });
  return getQuizAttempt(actor, input, db);
}

export async function abandonQuizAttempt(
  actor: Actor,
  input: AttemptScope,
  db: Database = database,
) {
  return db.transaction(async (tx) => {
    const row = await ownedAttempt(actor, input, tx, true);
    if (row.attempt.state === "submitted") throw new QuizError("quiz_attempt_submitted");
    if (row.attempt.state === "abandoned") return;
    await tx
      .update(quizAttempts)
      .set({ abandonedAt: new Date(), state: "abandoned", updatedAt: new Date() })
      .where(eq(quizAttempts.id, row.attempt.id));
  });
}
