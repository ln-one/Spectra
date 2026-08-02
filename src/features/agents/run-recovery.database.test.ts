import { createMigratedTestDatabase } from "@tests/database";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { aiRunAttempts, aiRuns } from "@/database/schema";
import { ensurePrincipalForAuthUser } from "@/features/identity/service";
import { createWorkspace } from "@/features/workspaces/service";
import { convergeStaleAiRuns } from "./run-recovery";
import { aiRunRequestHash, createAiRunAudit, startAiRunAttempt } from "./runs";

let testDatabase: Awaited<ReturnType<typeof createMigratedTestDatabase>>;

beforeAll(async () => {
  testDatabase = await createMigratedTestDatabase();
});

afterAll(async () => {
  await testDatabase.destroy();
});

describe("stale AI run recovery", () => {
  it("interrupts an expired attempt without reconstructing chat messages", async () => {
    const actor = await ensurePrincipalForAuthUser("recovery", "recovery", testDatabase.db);
    const workspace = await createWorkspace(actor, { name: "Recovery" }, testDatabase.db);
    const conversationId = "10000000-0000-4000-8000-000000000102";
    const run = await createAiRunAudit(
      {
        conversationId,
        createdByPrincipalId: actor.principalId,
        inputMessageId: "user:timeout",
        operation: "send",
        requestHash: aiRunRequestHash({
          locale: "en-US",
          operation: "send",
          text: "timeout",
        }),
        workspaceId: workspace.id,
      },
      testDatabase.db,
    );
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
    await testDatabase.db
      .update(aiRuns)
      .set({ deadlineAt: new Date("2026-07-18T00:00:00.000Z") })
      .where(eq(aiRuns.id, run.id));

    expect(await convergeStaleAiRuns(testDatabase.db, new Date("2026-07-18T00:01:00.000Z"))).toBe(
      1,
    );
    const [storedRun] = await testDatabase.db.select().from(aiRuns).where(eq(aiRuns.id, run.id));
    const [storedAttempt] = await testDatabase.db
      .select()
      .from(aiRunAttempts)
      .where(eq(aiRunAttempts.id, attempt.id));
    expect(storedRun).toMatchObject({
      abortReason: "timeout",
      failureCode: "agent_timeout",
      state: "interrupted",
    });
    expect(storedAttempt).toMatchObject({
      errorCode: "agent_timeout",
      state: "interrupted",
    });
  });
});
