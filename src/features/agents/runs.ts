import "server-only";

import { and, desc, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { canonicalJsonSha256 } from "@/database/canonical-json";
import { type Database, type DatabaseTransaction, database } from "@/database/client";
import { aiConversations, aiRunAttempts, aiRuns } from "@/database/schema";
import { workspaceAgentProfile } from "./config";
import { aiModelRate, aiPricingVersion, estimateAiCostMicrousd } from "./pricing";
import { transitionAiRun, transitionAiRunAttempt } from "./run-state";

const ACTIVE_RUN_STATES = ["claimed", "running", "publishing"] as const;
const TERMINAL_RUN_STATES = [
  "succeeded",
  "failed",
  "interrupted",
  "cancelled",
  "superseded",
] as const;

const aiRunBudgetSchema = z
  .object({
    maxCostMicrousd: z.number().int().positive(),
    maxInputTokens: z.number().int().positive(),
    maxOutputTokens: z.number().int().positive(),
    maxProviderCalls: z.number().int().positive(),
    maxToolCalls: z.number().int().nonnegative(),
    maxTotalTokens: z.number().int().positive(),
    pricingVersion: z.string().min(1),
    wallTimeMs: z.number().int().positive(),
  })
  .strict();

const aiRunBudgetUsageSchema = z
  .object({
    costMicrousd: z.number().int().nonnegative(),
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    providerCalls: z.number().int().nonnegative(),
    toolCalls: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
  })
  .strict();

async function ensureLockedAiConversation(
  tx: DatabaseTransaction,
  input: { conversationId: string; createdByPrincipalId: string; workspaceId: string },
) {
  await tx
    .insert(aiConversations)
    .values({
      conversationId: input.conversationId,
      createdByPrincipalId: input.createdByPrincipalId,
      workspaceId: input.workspaceId,
    })
    .onConflictDoNothing();
  const [conversation] = await tx
    .select()
    .from(aiConversations)
    .where(
      and(
        eq(aiConversations.workspaceId, input.workspaceId),
        eq(aiConversations.conversationId, input.conversationId),
        eq(aiConversations.createdByPrincipalId, input.createdByPrincipalId),
        isNull(aiConversations.deletedAt),
      ),
    )
    .limit(1)
    .for("update");
  return conversation ?? null;
}

const defaultAiRunBudget = aiRunBudgetSchema.parse({
  ...workspaceAgentProfile.budget,
  pricingVersion: aiPricingVersion,
});

const emptyBudgetUsage = aiRunBudgetUsageSchema.parse({
  costMicrousd: 0,
  inputTokens: 0,
  outputTokens: 0,
  providerCalls: 0,
  toolCalls: 0,
  totalTokens: 0,
});

export class AiRunConflictError extends Error {
  constructor(readonly code: "agent_conversation_busy" | "agent_request_conflict") {
    super(code);
    this.name = "AiRunConflictError";
  }
}

type RunOperation = "artifact" | "edit" | "regenerate" | "send";

export type AiRunAuditResult = typeof aiRuns.$inferSelect & { reused: boolean };

export function aiRunRequestHash(input: {
  artifact?: unknown;
  locale: string;
  operation: unknown;
  surface?: unknown;
  text: string;
}) {
  return canonicalJsonSha256(input);
}

async function claimAiConversationStream(
  tx: DatabaseTransaction,
  input: { conversationRowId: string; streamId: string },
) {
  const [claimedConversation] = await tx
    .update(aiConversations)
    .set({ activeStreamId: input.streamId, updatedAt: new Date() })
    .where(
      and(
        eq(aiConversations.id, input.conversationRowId),
        or(
          isNull(aiConversations.activeStreamId),
          eq(aiConversations.activeStreamId, input.streamId),
        ),
      ),
    )
    .returning({ id: aiConversations.id });
  if (!claimedConversation) throw new AiRunConflictError("agent_conversation_busy");
}

export async function createAiRunAudit(
  input: {
    conversationId: string;
    createdByPrincipalId: string;
    inputMessageId: string;
    operation: Extract<RunOperation, "regenerate" | "send">;
    requestHash: string;
    workspaceId: string;
    clientRequestId?: string;
    claimConversationStream?: boolean;
  },
  db: Database = database,
): Promise<AiRunAuditResult> {
  return db.transaction(async (tx) => {
    const conversation = await ensureLockedAiConversation(tx, input);
    if (!conversation) throw new AiRunConflictError("agent_request_conflict");

    const clientRequestId = input.clientRequestId ?? crypto.randomUUID();
    const [existingRun] = await tx
      .select()
      .from(aiRuns)
      .where(
        and(
          eq(aiRuns.workspaceId, input.workspaceId),
          eq(aiRuns.conversationId, input.conversationId),
          eq(aiRuns.clientRequestId, clientRequestId),
        ),
      )
      .limit(1);

    let activeRun = null;
    if (input.claimConversationStream && conversation.activeStreamId) {
      const [candidate] = await tx
        .select()
        .from(aiRuns)
        .where(
          and(
            eq(aiRuns.id, conversation.activeStreamId),
            eq(aiRuns.workspaceId, input.workspaceId),
            eq(aiRuns.conversationId, input.conversationId),
          ),
        )
        .limit(1);
      if (candidate && ACTIVE_RUN_STATES.includes(candidate.state as never)) {
        activeRun = candidate;
      } else {
        await tx
          .update(aiConversations)
          .set({ activeStreamId: null, updatedAt: new Date() })
          .where(
            and(
              eq(aiConversations.id, conversation.id),
              eq(aiConversations.activeStreamId, conversation.activeStreamId),
            ),
          );
      }
    }

    if (existingRun) {
      if (
        existingRun.inputMessageId !== input.inputMessageId ||
        existingRun.operation !== input.operation ||
        existingRun.requestHash !== input.requestHash
      ) {
        throw new AiRunConflictError("agent_request_conflict");
      }
      if (activeRun && activeRun.id !== existingRun.id) {
        throw new AiRunConflictError("agent_conversation_busy");
      }
      if (
        input.claimConversationStream &&
        !activeRun &&
        ACTIVE_RUN_STATES.includes(existingRun.state as never)
      ) {
        await claimAiConversationStream(tx, {
          conversationRowId: conversation.id,
          streamId: existingRun.id,
        });
      }
      return { ...existingRun, reused: true };
    }

    if (activeRun) throw new AiRunConflictError("agent_conversation_busy");

    const [run] = await tx
      .insert(aiRuns)
      .values({
        budget: defaultAiRunBudget,
        budgetUsage: emptyBudgetUsage,
        clientRequestId,
        conversationId: input.conversationId,
        deadlineAt: new Date(Date.now() + defaultAiRunBudget.wallTimeMs),
        inputMessageId: input.inputMessageId,
        operation: input.operation,
        requestHash: input.requestHash,
        workspaceId: input.workspaceId,
      })
      .returning();
    if (!run) throw new Error("AI Run was not created");

    if (input.claimConversationStream) {
      await claimAiConversationStream(tx, { conversationRowId: conversation.id, streamId: run.id });
    }

    return { ...run, reused: false };
  });
}

async function clearAiConversationActiveStreamForRun(
  tx: DatabaseTransaction,
  run: Pick<typeof aiRuns.$inferSelect, "conversationId" | "id" | "workspaceId">,
  finishedAt: Date,
) {
  await tx
    .update(aiConversations)
    .set({ activeStreamId: null, updatedAt: finishedAt })
    .where(
      and(
        eq(aiConversations.workspaceId, run.workspaceId),
        eq(aiConversations.conversationId, run.conversationId),
        eq(aiConversations.activeStreamId, run.id),
      ),
    );
}

export async function completeAiRunAudit(input: { runId: string }, db: Database = database) {
  return db.transaction(async (tx) => {
    const [run] = await tx
      .select()
      .from(aiRuns)
      .where(eq(aiRuns.id, input.runId))
      .limit(1)
      .for("update");
    if (!run || !ACTIVE_RUN_STATES.includes(run.state as never)) return null;
    const finishedAt = new Date();
    const [completed] = await tx
      .update(aiRuns)
      .set({
        abortReason: null,
        failureCode: null,
        finishedAt,
        state: transitionAiRun(run.state, "succeeded"),
        updatedAt: finishedAt,
      })
      .where(eq(aiRuns.id, input.runId))
      .returning();
    if (completed) await clearAiConversationActiveStreamForRun(tx, completed, finishedAt);
    return completed ?? null;
  });
}

export async function startAiRunAttempt(
  input: {
    executionKey?: string;
    modelId: string;
    profileSnapshot: unknown;
    purpose: "thread_title" | "workspace_agent";
    provider?: string;
    runId: string;
  },
  db: Database = database,
) {
  return db.transaction(async (tx) => {
    const [run] = await tx
      .select()
      .from(aiRuns)
      .where(eq(aiRuns.id, input.runId))
      .limit(1)
      .for("update");
    if (!run || !ACTIVE_RUN_STATES.includes(run.state as (typeof ACTIVE_RUN_STATES)[number])) {
      return null;
    }
    const [runningAttempt] = await tx
      .select()
      .from(aiRunAttempts)
      .where(
        and(
          eq(aiRunAttempts.runId, input.runId),
          eq(aiRunAttempts.purpose, input.purpose),
          eq(aiRunAttempts.state, "running"),
          input.executionKey
            ? eq(aiRunAttempts.executionKey, input.executionKey)
            : isNull(aiRunAttempts.executionKey),
        ),
      )
      .orderBy(desc(aiRunAttempts.attemptNumber))
      .limit(1);
    if (runningAttempt) return runningAttempt;
    const usage = aiRunBudgetUsageSchema.parse(run.budgetUsage);
    const budget = aiRunBudgetSchema.parse(run.budget);
    aiModelRate(input.modelId);
    if (
      usage.providerCalls >= budget.maxProviderCalls ||
      usage.costMicrousd >= budget.maxCostMicrousd ||
      usage.inputTokens >= budget.maxInputTokens ||
      usage.outputTokens >= budget.maxOutputTokens ||
      usage.toolCalls >= budget.maxToolCalls ||
      usage.totalTokens >= budget.maxTotalTokens ||
      Date.now() >= run.deadlineAt.getTime()
    ) {
      return null;
    }
    const [attempt] = await tx
      .insert(aiRunAttempts)
      .values({
        attemptNumber: usage.providerCalls + 1,
        executionKey: input.executionKey ?? null,
        profileSnapshot: input.profileSnapshot,
        purpose: input.purpose,
        requestedModel: input.modelId,
        requestedProvider: input.provider ?? "dashscope",
        runId: input.runId,
      })
      .returning();
    if (!attempt) throw new Error("AI Run attempt was not created");
    const nextState = transitionAiRun(run.state, "running");
    await tx
      .update(aiRuns)
      .set({
        budgetUsage: { ...usage, providerCalls: usage.providerCalls + 1 },
        startedAt: run.startedAt ?? new Date(),
        state: nextState,
        updatedAt: new Date(),
      })
      .where(eq(aiRuns.id, run.id));
    return attempt;
  });
}

export async function settleAiRunAttempt(
  input: {
    attemptId: string;
    effectiveModel?: string | null;
    effectiveProvider?: string | null;
    errorCode?: string | null;
    finishReason?: string | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    state: "cancelled" | "failed" | "interrupted" | "succeeded";
    toolCallCount?: number;
    totalTokens?: number | null;
  },
  db: Database = database,
) {
  return db.transaction(async (tx) => {
    const [attempt] = await tx
      .select()
      .from(aiRunAttempts)
      .where(eq(aiRunAttempts.id, input.attemptId))
      .limit(1)
      .for("update");
    if (attempt?.state !== "running") return null;
    const nextAttemptState = transitionAiRunAttempt(attempt.state, input.state);
    const usageKnown =
      input.inputTokens !== null &&
      input.inputTokens !== undefined &&
      input.outputTokens !== null &&
      input.outputTokens !== undefined;
    const costMicrousd = usageKnown
      ? estimateAiCostMicrousd({
          inputTokens: input.inputTokens ?? 0,
          modelId: input.effectiveModel ?? attempt.requestedModel,
          outputTokens: input.outputTokens ?? 0,
        })
      : null;
    const [updated] = await tx
      .update(aiRunAttempts)
      .set({
        effectiveModel: input.effectiveModel ?? null,
        effectiveProvider: input.effectiveProvider ?? null,
        errorCode: input.errorCode ?? null,
        estimatedCostMicrousd: costMicrousd,
        finishReason: input.finishReason ?? null,
        finishedAt: new Date(),
        inputTokens: usageKnown ? input.inputTokens : null,
        outputTokens: usageKnown ? input.outputTokens : null,
        state: nextAttemptState,
        toolCallCount: input.toolCallCount ?? 0,
        totalTokens: usageKnown ? (input.totalTokens ?? null) : null,
        usageState: usageKnown ? "known" : "unknown",
      })
      .where(eq(aiRunAttempts.id, attempt.id))
      .returning();
    if (!updated) return null;
    const [run] = await tx
      .select()
      .from(aiRuns)
      .where(eq(aiRuns.id, attempt.runId))
      .limit(1)
      .for("update");
    if (run) {
      const usage = aiRunBudgetUsageSchema.parse(run.budgetUsage);
      const inputTokens = usageKnown ? (input.inputTokens ?? 0) : 0;
      const outputTokens = usageKnown ? (input.outputTokens ?? 0) : 0;
      await tx
        .update(aiRuns)
        .set({
          budgetUsage: {
            ...usage,
            costMicrousd: usage.costMicrousd + (costMicrousd ?? 0),
            inputTokens: usage.inputTokens + inputTokens,
            outputTokens: usage.outputTokens + outputTokens,
            toolCalls: usage.toolCalls + (input.toolCallCount ?? 0),
            totalTokens: usage.totalTokens + (input.totalTokens ?? inputTokens + outputTokens),
          },
          updatedAt: new Date(),
        })
        .where(eq(aiRuns.id, run.id));
    }
    return updated;
  });
}

export async function finishAiRun(
  input: {
    abortReason?: string | null;
    failureCode?: string | null;
    runId: string;
    state: "cancelled" | "failed" | "interrupted";
  },
  db: Database = database,
) {
  return db.transaction(async (tx) => {
    const [run] = await tx
      .select()
      .from(aiRuns)
      .where(eq(aiRuns.id, input.runId))
      .limit(1)
      .for("update");
    if (!run || TERMINAL_RUN_STATES.includes(run.state as (typeof TERMINAL_RUN_STATES)[number])) {
      return null;
    }
    return finishActiveAiRun(
      run,
      {
        abortReason: input.abortReason ?? null,
        attemptErrorCode: input.failureCode ?? input.abortReason ?? `agent_run_${input.state}`,
        failureCode: input.failureCode ?? null,
        state: input.state,
      },
      tx,
    );
  });
}

async function finishActiveAiRun(
  run: typeof aiRuns.$inferSelect,
  input: {
    abortReason: string | null;
    attemptErrorCode: string;
    failureCode: string | null;
    state: "cancelled" | "failed" | "interrupted";
  },
  tx: DatabaseTransaction,
) {
  const finishedAt = new Date();
  const nextState = transitionAiRun(run.state, input.state);
  const nextAttemptState = transitionAiRunAttempt("running", input.state);
  const [updated] = await tx
    .update(aiRuns)
    .set({
      abortReason: input.abortReason,
      failureCode: input.failureCode,
      finishedAt,
      state: nextState,
      updatedAt: finishedAt,
    })
    .where(eq(aiRuns.id, run.id))
    .returning();
  await tx
    .update(aiRunAttempts)
    .set({
      errorCode: input.attemptErrorCode,
      finishedAt,
      state: nextAttemptState,
      usageState: "unknown",
    })
    .where(and(eq(aiRunAttempts.runId, run.id), eq(aiRunAttempts.state, "running")));
  if (updated) await clearAiConversationActiveStreamForRun(tx, updated, finishedAt);
  return updated ?? null;
}

async function cancelAiRun(run: typeof aiRuns.$inferSelect, tx: DatabaseTransaction) {
  if (TERMINAL_RUN_STATES.includes(run.state as (typeof TERMINAL_RUN_STATES)[number])) {
    await clearAiConversationActiveStreamForRun(tx, run, new Date());
    return run;
  }
  return finishActiveAiRun(
    run,
    {
      abortReason: "user_abort_requested",
      attemptErrorCode: "user_abort_requested",
      failureCode: null,
      state: "cancelled",
    },
    tx,
  );
}

export async function requestAiRunCancellation(
  input: {
    conversationId: string;
    createdByPrincipalId: string;
    runId: string;
    workspaceId: string;
  },
  db: Database = database,
) {
  return db.transaction(async (tx) => {
    const [run] = await tx
      .select({ run: aiRuns })
      .from(aiRuns)
      .innerJoin(
        aiConversations,
        and(
          eq(aiConversations.workspaceId, aiRuns.workspaceId),
          eq(aiConversations.conversationId, aiRuns.conversationId),
        ),
      )
      .where(
        and(
          eq(aiRuns.id, input.runId),
          eq(aiRuns.workspaceId, input.workspaceId),
          eq(aiRuns.conversationId, input.conversationId),
          eq(aiConversations.createdByPrincipalId, input.createdByPrincipalId),
        ),
      )
      .limit(1)
      .for("update");
    return run ? cancelAiRun(run.run, tx) : null;
  });
}

export async function requestAiRunCancellationByClientRequest(
  input: {
    clientRequestId: string;
    conversationId: string;
    createdByPrincipalId: string;
    workspaceId: string;
  },
  db: Database = database,
) {
  return db.transaction(async (tx) => {
    const [conversation] = await tx
      .select({ id: aiConversations.id })
      .from(aiConversations)
      .where(
        and(
          eq(aiConversations.workspaceId, input.workspaceId),
          eq(aiConversations.conversationId, input.conversationId),
          eq(aiConversations.createdByPrincipalId, input.createdByPrincipalId),
          isNull(aiConversations.deletedAt),
        ),
      )
      .limit(1)
      .for("update");
    if (!conversation) return false;
    const [run] = await tx
      .select()
      .from(aiRuns)
      .where(
        and(
          eq(aiRuns.clientRequestId, input.clientRequestId),
          eq(aiRuns.workspaceId, input.workspaceId),
          eq(aiRuns.conversationId, input.conversationId),
        ),
      )
      .limit(1)
      .for("update");
    if (run) {
      return cancelAiRun(run, tx);
    }
    return null;
  });
}
