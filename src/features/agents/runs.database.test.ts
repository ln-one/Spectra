import { createMigratedTestDatabase } from "@tests/database";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { aiConversations, aiRunAttempts, aiRuns } from "@/database/schema";
import { ensurePrincipalForAuthUser } from "@/features/identity/service";
import { createWorkspace } from "@/features/workspaces/service";
import {
  aiRunRequestHash,
  completeAiRunAudit,
  createAiRunAudit,
  finishAiRun,
  requestAiRunCancellation,
  requestAiRunCancellationByClientRequest,
  settleAiRunAttempt,
  startAiRunAttempt,
} from "./runs";

let testDatabase: Awaited<ReturnType<typeof createMigratedTestDatabase>>;
let workspaceId: string;
let principalId: string;
const conversationId = "00000000-0000-4000-8000-000000000301";

beforeAll(async () => {
  testDatabase = await createMigratedTestDatabase();
});

beforeEach(async () => {
  await testDatabase.pool.query(
    "TRUNCATE TABLE public.ai_run_attempts, public.ai_runs, public.ai_conversations, public.workspaces, public.principals CASCADE",
  );
  const actor = await ensurePrincipalForAuthUser("run-alice", "run-alice", testDatabase.db);
  principalId = actor.principalId;
  workspaceId = (await createWorkspace(actor, { name: "Runs" }, testDatabase.db)).id;
});

afterAll(async () => {
  await testDatabase.destroy();
});

function requestHash(text: string) {
  return aiRunRequestHash({ artifact: null, locale: "en-US", operation: "send", text });
}

async function createRun(
  text = "hello",
  options: { claimConversationStream?: boolean; clientRequestId?: string } = {},
) {
  return createAiRunAudit(
    {
      ...(options.claimConversationStream ? { claimConversationStream: true } : {}),
      ...(options.clientRequestId ? { clientRequestId: options.clientRequestId } : {}),
      conversationId,
      createdByPrincipalId: principalId,
      inputMessageId: `user:${text}`,
      operation: "send",
      requestHash: requestHash(text),
      workspaceId,
    },
    testDatabase.db,
  );
}

describe("AI run audit", () => {
  it("records attempts, usage, and successful completion without owning chat state", async () => {
    const run = await createRun();
    const attempt = await startAiRunAttempt(
      {
        modelId: "qwen3.7-plus",
        profileSnapshot: { version: 1 },
        purpose: "workspace_agent",
        runId: run.id,
      },
      testDatabase.db,
    );
    if (!attempt) throw new Error("Attempt missing");

    await settleAiRunAttempt(
      {
        attemptId: attempt.id,
        effectiveModel: "qwen3.7-plus",
        effectiveProvider: "dashscope",
        inputTokens: 10,
        outputTokens: 5,
        state: "succeeded",
        toolCallCount: 1,
        totalTokens: 15,
      },
      testDatabase.db,
    );
    await completeAiRunAudit({ runId: run.id }, testDatabase.db);

    const [storedRun] = await testDatabase.db.select().from(aiRuns).where(eq(aiRuns.id, run.id));
    const [storedAttempt] = await testDatabase.db
      .select()
      .from(aiRunAttempts)
      .where(eq(aiRunAttempts.id, attempt.id));
    expect(storedRun).toMatchObject({
      state: "succeeded",
      budgetUsage: expect.objectContaining({
        inputTokens: 10,
        outputTokens: 5,
        toolCalls: 1,
        totalTokens: 15,
      }),
    });
    expect(storedAttempt).toMatchObject({ state: "succeeded", usageState: "known" });
  });

  it("cancels only a run owned by the requested conversation principal", async () => {
    const run = await createRun("cancel");
    await startAiRunAttempt(
      {
        modelId: "qwen3.7-plus",
        profileSnapshot: { version: 1 },
        purpose: "workspace_agent",
        runId: run.id,
      },
      testDatabase.db,
    );

    expect(
      await requestAiRunCancellation(
        { conversationId, createdByPrincipalId: principalId, runId: run.id, workspaceId },
        testDatabase.db,
      ),
    ).toMatchObject({ state: "cancelled" });

    const [attempt] = await testDatabase.db
      .select()
      .from(aiRunAttempts)
      .where(eq(aiRunAttempts.runId, run.id));
    expect(attempt).toMatchObject({
      errorCode: "user_abort_requested",
      state: "cancelled",
    });
  });

  it("cancels a client request repeatedly without reviving its run", async () => {
    const clientRequestId = "request:cancel-by-client";
    const run = await createRun("cancel by client", {
      claimConversationStream: true,
      clientRequestId,
    });

    const first = await requestAiRunCancellationByClientRequest(
      {
        clientRequestId,
        conversationId,
        createdByPrincipalId: principalId,
        workspaceId,
      },
      testDatabase.db,
    );
    const second = await requestAiRunCancellationByClientRequest(
      {
        clientRequestId,
        conversationId,
        createdByPrincipalId: principalId,
        workspaceId,
      },
      testDatabase.db,
    );

    expect(first).toMatchObject({ id: run.id, state: "cancelled" });
    expect(second).toMatchObject({ id: run.id, state: "cancelled" });
    const [conversation] = await testDatabase.db
      .select()
      .from(aiConversations)
      .where(eq(aiConversations.conversationId, conversationId));
    expect(conversation?.activeStreamId).toBeNull();
  });

  it("reuses one client request and rejects a second active conversation run", async () => {
    const clientRequestId = "request:deduplicated";
    const results = await Promise.all([
      createRun("same request", { claimConversationStream: true, clientRequestId }),
      createRun("same request", { claimConversationStream: true, clientRequestId }),
    ]);

    expect(new Set(results.map((result) => result.id)).size).toBe(1);
    expect(results.map((result) => result.reused).sort()).toEqual([false, true]);
    await expect(
      testDatabase.db.select().from(aiRuns).where(eq(aiRuns.clientRequestId, clientRequestId)),
    ).resolves.toHaveLength(1);

    await expect(
      createRun("different request", {
        claimConversationStream: true,
        clientRequestId: "request:other",
      }),
    ).rejects.toMatchObject({ code: "agent_conversation_busy" });

    const firstResult = results[0];
    if (!firstResult) throw new Error("Run result missing");
    await finishAiRun(
      { failureCode: "test_finished", runId: firstResult.id, state: "failed" },
      testDatabase.db,
    );
    const [conversation] = await testDatabase.db
      .select()
      .from(aiConversations)
      .where(eq(aiConversations.conversationId, conversationId));
    expect(conversation?.activeStreamId).toBeNull();
  });

  it("rejects reusing a client request id for different input", async () => {
    await createRun("original", {
      claimConversationStream: true,
      clientRequestId: "request:identity",
    });

    await expect(
      createRun("changed", {
        claimConversationStream: true,
        clientRequestId: "request:identity",
      }),
    ).rejects.toMatchObject({ code: "agent_request_conflict" });
  });

  it("keeps terminal timestamp and state constraints enforced", async () => {
    const run = await createRun("constraint");
    const attempt = await startAiRunAttempt(
      {
        modelId: "qwen3.7-plus",
        profileSnapshot: { version: 1 },
        purpose: "workspace_agent",
        runId: run.id,
      },
      testDatabase.db,
    );
    if (!attempt) throw new Error("Attempt missing");
    await expect(
      testDatabase.db
        .update(aiRunAttempts)
        .set({ state: "failed" })
        .where(eq(aiRunAttempts.id, attempt.id)),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });
});
