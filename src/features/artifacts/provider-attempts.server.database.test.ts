import { randomUUID } from "node:crypto";
import { createMigratedTestDatabase } from "@tests/database";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, test } from "vitest";
import { aiRunAttempts, artifactProviderAttempts } from "@/database/schema";
import {
  claimTeachingDocumentGeneration,
  startTeachingDocumentGeneration,
} from "@/features/artifacts/documents/service";
import { ensurePrincipalForAuthUser } from "@/features/identity/service";
import { createWorkspace } from "@/features/workspaces/service";
import {
  settleArtifactProviderAttempt,
  startArtifactProviderAttempt,
} from "./provider-attempts.server";

let testDatabase: Awaited<ReturnType<typeof createMigratedTestDatabase>>;

beforeAll(async () => {
  testDatabase = await createMigratedTestDatabase();
});

afterAll(async () => {
  await testDatabase.destroy();
});

test("records ordered provider attempts outside foreground AI attempts", async () => {
  const principalSuffix = randomUUID().slice(0, 8);
  const actor = await ensurePrincipalForAuthUser(
    `provider-attempt-${principalSuffix}`,
    `provider-${principalSuffix}`,
    testDatabase.db,
  );
  const workspace = await createWorkspace(actor, { name: "Provider attempts" }, testDatabase.db);
  const started = await startTeachingDocumentGeneration(
    actor,
    {
      conversationId: randomUUID(),
      locale: "en-US",
      prompt: "Create a durable document",
      sourceUserMessageId: `user:${randomUUID()}`,
      workspaceId: workspace.id,
    },
    { async enqueue() {} },
    testDatabase.db,
  );
  if (!started.generationAttemptId) throw new Error("Generation attempt missing");
  await claimTeachingDocumentGeneration(started.id, started.generationAttemptId, testDatabase.db);

  const first = await startArtifactProviderAttempt(
    {
      generationAttemptId: started.generationAttemptId,
      model: "primary-model",
      provider: "primary-provider",
    },
    testDatabase.db,
  );
  if (!first) throw new Error("First provider attempt missing");
  await settleArtifactProviderAttempt(
    {
      attemptId: first.id,
      effectiveModel: "primary-model",
      effectiveProvider: "primary-provider",
      errorCode: "provider_timeout",
      providerCallCount: 2,
      state: "failed",
      toolCallCount: 3,
    },
    testDatabase.db,
  );

  const second = await startArtifactProviderAttempt(
    {
      generationAttemptId: started.generationAttemptId,
      model: "fallback-model",
      provider: "fallback-provider",
    },
    testDatabase.db,
  );
  if (!second) throw new Error("Second provider attempt missing");
  await settleArtifactProviderAttempt(
    {
      attemptId: second.id,
      effectiveModel: "fallback-model",
      effectiveProvider: "fallback-provider",
      providerCallCount: 1,
      state: "succeeded",
      toolCallCount: 4,
    },
    testDatabase.db,
  );

  const providerAttempts = await testDatabase.db
    .select()
    .from(artifactProviderAttempts)
    .where(eq(artifactProviderAttempts.generationAttemptId, started.generationAttemptId));
  expect(providerAttempts).toMatchObject([
    {
      ordinal: 1,
      providerCallCount: 2,
      state: "failed",
      toolCallCount: 3,
    },
    {
      ordinal: 2,
      providerCallCount: 1,
      state: "succeeded",
      toolCallCount: 4,
    },
  ]);
  expect(await testDatabase.db.select().from(aiRunAttempts)).toHaveLength(0);
});

test("database rejects a terminal provider attempt without a finish timestamp", async () => {
  const [attempt] = await testDatabase.db.select().from(artifactProviderAttempts).limit(1);
  if (!attempt) throw new Error("Provider attempt fixture missing");
  await expect(
    testDatabase.db
      .update(artifactProviderAttempts)
      .set({ finishedAt: null, state: "succeeded" })
      .where(eq(artifactProviderAttempts.id, attempt.id)),
  ).rejects.toMatchObject({ cause: expect.objectContaining({ code: "23514" }) });
});
