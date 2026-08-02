import { randomUUID } from "node:crypto";
import { createMigratedTestDatabase } from "@tests/database";
import { asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, test } from "vitest";
import { artifactGenerationAttempts } from "@/database/schema";
import {
  failTeachingDocumentGeneration,
  startTeachingDocumentGeneration,
} from "@/features/artifacts/documents/service";
import { ensurePrincipalForAuthUser } from "@/features/identity/service";
import { createWorkspace } from "@/features/workspaces/service";
import { retryArtifactGeneration } from "./lifecycle.server";

let testDatabase: Awaited<ReturnType<typeof createMigratedTestDatabase>>;

beforeAll(async () => {
  testDatabase = await createMigratedTestDatabase();
});

afterAll(async () => {
  await testDatabase.destroy();
});

test("retry creates a new generation attempt and workflow identity", async () => {
  const suffix = randomUUID().slice(0, 8);
  const actor = await ensurePrincipalForAuthUser(
    `generation-retry-${suffix}`,
    `retry-${suffix}`,
    testDatabase.db,
  );
  const workspace = await createWorkspace(actor, { name: "Generation retry" }, testDatabase.db);
  const started = await startTeachingDocumentGeneration(
    actor,
    {
      conversationId: randomUUID(),
      locale: "en-US",
      prompt: "Create a retryable document",
      sourceUserMessageId: `user:${randomUUID()}`,
      workspaceId: workspace.id,
    },
    { async enqueue() {} },
    testDatabase.db,
  );
  if (!started.generationAttemptId) throw new Error("Generation attempt missing");
  await failTeachingDocumentGeneration(
    started.id,
    "teaching_document_provider_failed",
    started.generationAttemptId,
    testDatabase.db,
  );

  const jobs: Array<{ artifactId: string; generationAttemptId: string }> = [];
  const retried = await retryArtifactGeneration({
    artifactId: started.id,
    createJob: (artifactId, generationAttemptId) => ({ artifactId, generationAttemptId }),
    db: testDatabase.db,
    enqueue: async (_transaction, job) => {
      jobs.push(job);
    },
    errorLabel: "Teaching document",
    kind: "teaching_document",
  });

  expect(retried.generationAttemptId).not.toBe(started.generationAttemptId);
  expect(retried).toMatchObject({ generationSequence: 0, generationState: "queued" });
  expect(jobs).toEqual([
    { artifactId: started.id, generationAttemptId: retried.generationAttemptId },
  ]);
  const attempts = await testDatabase.db
    .select()
    .from(artifactGenerationAttempts)
    .where(eq(artifactGenerationAttempts.artifactId, started.id))
    .orderBy(asc(artifactGenerationAttempts.ordinal));
  expect(attempts).toMatchObject([
    {
      failureCode: "teaching_document_provider_failed",
      id: started.generationAttemptId,
      ordinal: 1,
      state: "failed",
    },
    { failureCode: null, id: retried.generationAttemptId, ordinal: 2, state: "queued" },
  ]);
});

test("database rejects an invalid generation attempt terminal state", async () => {
  const suffix = randomUUID().slice(0, 8);
  const actor = await ensurePrincipalForAuthUser(
    `generation-constraint-${suffix}`,
    `constraint-${suffix}`,
    testDatabase.db,
  );
  const workspace = await createWorkspace(actor, { name: "Attempt constraint" }, testDatabase.db);
  const started = await startTeachingDocumentGeneration(
    actor,
    {
      conversationId: randomUUID(),
      locale: "en-US",
      prompt: "Create a constrained document",
      sourceUserMessageId: `user:${randomUUID()}`,
      workspaceId: workspace.id,
    },
    { async enqueue() {} },
    testDatabase.db,
  );
  if (!started.generationAttemptId) throw new Error("Generation attempt missing");

  await expect(
    testDatabase.db
      .update(artifactGenerationAttempts)
      .set({ state: "submitted" })
      .where(eq(artifactGenerationAttempts.id, started.generationAttemptId)),
  ).rejects.toMatchObject({ cause: expect.objectContaining({ code: "23514" }) });
});
