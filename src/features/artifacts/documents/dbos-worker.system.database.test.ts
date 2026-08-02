import { randomUUID } from "node:crypto";
import { DBOS } from "@dbos-inc/dbos-sdk";
import { createMigratedTestDatabase } from "@tests/database";
import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { databasePoolProfiles } from "@/database/pool-profiles";
import { aiRuns, artifactRevisions, artifacts, principals } from "@/database/schema";
import { aiRunRequestHash, completeAiRunAudit, createAiRunAudit } from "@/features/agents/runs";
import { ARTIFACT_DBOS_SCHEMA } from "@/features/artifacts/dbos-queue.server";
import {
  artifactDbosStreamKey,
  readArtifactDbosStream,
} from "@/features/artifacts/dbos-realtime.server";
import {
  createTeachingDocumentDbosQueue,
  TEACHING_DOCUMENT_DBOS_QUEUE,
} from "@/features/artifacts/documents/dbos";
import {
  recoverTeachingDocumentStreamTail,
  registerTeachingDocumentDbosWorkflow,
} from "@/features/artifacts/documents/dbos-worker";
import {
  TEACHING_DOCUMENT_TERMINAL_SEQUENCE,
  teachingDocumentTextDeltaEvent,
} from "@/features/artifacts/documents/realtime";
import {
  deleteTeachingDocumentForConversationWithCleanupQueue,
  purgeDeletedTeachingDocumentContent,
  startTeachingDocumentGeneration,
} from "@/features/artifacts/documents/service";
import type { Actor } from "@/features/identity/types";
import { createWorkspace } from "@/features/workspaces/service";
import { workerLogger } from "@/observability/server";
import { initializeDbosSystem } from "@/worker/dbos-system.server";

let testDatabase: Awaited<ReturnType<typeof createMigratedTestDatabase>>;
let actor: Actor;
let workspaceId: string;
let runtimeStarted = false;

const deterministicMarkdown = [
  "# Deterministic teaching document",
  "## A deterministic heading",
  "First deterministic paragraph.",
  "- A deterministic bullet.",
  "Final deterministic paragraph.",
].join("\n\n");
const failBeforeFinalization = new Set<string>();
const generatedPrompts: string[] = [];

test("recovers durable deltas written after the last product checkpoint", () => {
  const events = [
    teachingDocumentTextDeltaEvent({ delta: "first", sequence: 1, startOffset: 0 }),
    teachingDocumentTextDeltaEvent({ delta: " second", sequence: 2, startOffset: 5 }),
  ].map((event) => ({ value: JSON.stringify(JSON.stringify(event)) }));

  expect(recoverTeachingDocumentStreamTail({ markdown: "first", sequence: 1 }, events)).toEqual({
    markdown: "first second",
    sequence: 2,
  });
});

beforeAll(async () => {
  testDatabase = await createMigratedTestDatabase();
  await initializeDbosSystem({
    connectionString: testDatabase.connectionString,
    poolSize: 2,
  });
  const principalId = randomUUID();
  actor = { handle: `dbos-worker-${principalId.slice(0, 8)}`, principalId };
  await testDatabase.db.insert(principals).values({
    authUserId: `dbos-worker-${principalId}`,
    handle: actor.handle,
    id: principalId,
  });
  workspaceId = (await createWorkspace(actor, { name: "DBOS worker test" }, testDatabase.db)).id;
  registerTeachingDocumentDbosWorkflow({
    beforeFinalize: async (artifactId) => {
      if (failBeforeFinalization.delete(artifactId)) {
        throw new Error("forced finalization failure");
      }
    },
    db: testDatabase.db,
    generateDraft: async (input) => {
      generatedPrompts.push(input.prompt);
      if (input.prompt.includes("whitespace-timeout")) {
        await input.onTextDelta(" \n\t");
        throw new Error("generation timed out");
      }
      if (input.prompt.includes("many-snapshots")) {
        let markdown = "";
        for (let index = 0; index < 40; index += 1) {
          const delta = `Partial ${index}\n`;
          markdown += delta;
          await input.onTextDelta(delta);
        }
        return {
          markdown,
          outcome: "complete",
          usage: {
            finishReason: "stop",
            inputTokens: undefined,
            outputTokens: undefined,
            totalTokens: undefined,
          },
        };
      }
      const midpoint = Math.floor(deterministicMarkdown.length / 2);
      await input.onTextDelta(deterministicMarkdown.slice(0, midpoint));
      if (input.prompt.includes("force-timeout")) throw new Error("generation timed out");
      await input.onTextDelta(deterministicMarkdown.slice(midpoint));
      return {
        markdown: deterministicMarkdown,
        outcome: "complete",
        usage: {
          finishReason: "stop",
          inputTokens: undefined,
          outputTokens: undefined,
          totalTokens: undefined,
        },
      };
    },
    generationStep: {
      timeoutMS: 5_000,
    },
    pool: testDatabase.pool,
  });
});

afterAll(async () => {
  if (runtimeStarted) await DBOS.shutdown({ deregister: true });
  await testDatabase.destroy();
});

async function startRuntime() {
  DBOS.setConfig({
    listenQueues: [TEACHING_DOCUMENT_DBOS_QUEUE],
    name: "spectra-artifact-worker-test",
    runAdminServer: false,
    systemDatabasePoolSize: databasePoolProfiles.artifactWorkflowSystem.max,
    systemDatabaseSchemaName: ARTIFACT_DBOS_SCHEMA,
    systemDatabaseUrl: testDatabase.connectionString,
    tracingEnabled: false,
    useListenNotify: true,
  });
  await DBOS.launch();
  runtimeStarted = true;
}

async function enqueueWorkflow(input: {
  artifactId: string;
  conversationId: string;
  generationAttemptId: string;
  locale: "zh-CN" | "en-US";
  prompt: string;
}) {
  await testDatabase.db.transaction((transaction) =>
    createTeachingDocumentDbosQueue().enqueue(transaction, {
      ...input,
      workspaceId,
    }),
  );
}

function requiredGenerationAttemptId(detail: { generationAttemptId: string | null }) {
  if (!detail.generationAttemptId) throw new Error("Generation attempt missing");
  return detail.generationAttemptId;
}

test("consumes a queued document after the Artifact Worker starts and completes exactly once", async () => {
  const info = vi.spyOn(workerLogger, "info");
  const created = await startTeachingDocumentGeneration(
    actor,
    {
      conversationId: randomUUID(),
      locale: "en-US",
      prompt: "Generate after the worker starts",
      sourceUserMessageId: `dbos-worker-success-${randomUUID()}`,
      workspaceId,
    },
    createTeachingDocumentDbosQueue(),
    testDatabase.db,
  );
  expect(created.generationState).toBe("queued");

  await startRuntime();
  const result = await DBOS.retrieveWorkflow<{ id: string; title: string } | null>(
    requiredGenerationAttemptId(created),
  ).getResult({ pollingIntervalMs: 20 });
  const [stored] = await testDatabase.db
    .select()
    .from(artifacts)
    .where(eq(artifacts.id, created.id));
  const [revisionCount] = await testDatabase.db
    .select({ value: count() })
    .from(artifactRevisions)
    .where(eq(artifactRevisions.artifactId, created.id));
  const streamRows = await testDatabase.pool.query<{ key: string }>(
    `SELECT DISTINCT key FROM dbos.streams WHERE workflow_uuid = $1`,
    [requiredGenerationAttemptId(created)],
  );

  expect(result).toMatchObject({ id: created.id, title: "Deterministic teaching document" });
  expect(stored).toMatchObject({
    generationDraft: null,
    generationState: "ready",
    title: "Deterministic teaching document",
  });
  expect(stored?.generationAttemptId).toBeNull();
  expect(revisionCount?.value).toBe(1);
  expect(streamRows.rows).toHaveLength(1);
  expect(streamRows.rows[0]?.key).toMatch(/^artifact:/);

  const attemptId = requiredGenerationAttemptId(created);
  const streamClient = async () => ({
    readStream: <T>(workflowId: string, key: string) => DBOS.readStream<T>(workflowId, key),
  });
  const resumed = await readArtifactDbosStream({ attemptId }, streamClient);
  const reader = resumed.stream.getReader();
  const chunks: string[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  expect(chunks).toHaveLength(3);
  expect(JSON.parse(chunks.at(-1) ?? "")).toMatchObject({
    event: "completed",
    kind: "teaching_document",
    sequence: TEACHING_DOCUMENT_TERMINAL_SEQUENCE,
    version: 3,
  });

  expect(await DBOS.retrieveWorkflow(requiredGenerationAttemptId(created)).getResult()).toEqual(
    result,
  );
  const [revisionCountAfterReplay] = await testDatabase.db
    .select({ value: count() })
    .from(artifactRevisions)
    .where(eq(artifactRevisions.artifactId, created.id));
  expect(revisionCountAfterReplay?.value).toBe(1);
  expect(info).toHaveBeenCalledWith(
    expect.objectContaining({
      artifactId: created.id,
      artifactKind: "teaching_document",
      attemptId,
      event: "artifact.generation.started",
      workflowId: attemptId,
    }),
    "Artifact generation started",
  );
  expect(info).toHaveBeenCalledWith(
    expect.objectContaining({
      artifactId: created.id,
      attemptId,
      event: "artifact.generation.stage_changed",
      stage: "finalizing",
    }),
    "Artifact generation entered finalization",
  );
  expect(info).toHaveBeenCalledWith(
    expect.objectContaining({
      artifactId: created.id,
      attemptId,
      durationMs: expect.any(Number),
      event: "artifact.generation.completed",
    }),
    "Artifact generation completed",
  );
  info.mockRestore();
});

test("publishes a partial ready revision when the provider fails after visible content", async () => {
  const created = await startTeachingDocumentGeneration(
    actor,
    {
      conversationId: randomUUID(),
      locale: "en-US",
      prompt: "force-timeout",
      sourceUserMessageId: `dbos-worker-failure-${randomUUID()}`,
      workspaceId,
    },
    createTeachingDocumentDbosQueue(),
    testDatabase.db,
  );

  await expect(
    DBOS.retrieveWorkflow(requiredGenerationAttemptId(created)).getResult({
      pollingIntervalMs: 20,
    }),
  ).resolves.toMatchObject({ id: created.id, title: "Deterministic teaching document" });
  const [stored] = await testDatabase.db
    .select()
    .from(artifacts)
    .where(eq(artifacts.id, created.id));
  expect(stored).toMatchObject({
    generationFailureCode: null,
    generationState: "ready",
  });
  expect(stored?.generationAttemptId).toBeNull();
  const [revision] = await testDatabase.db
    .select()
    .from(artifactRevisions)
    .where(eq(artifactRevisions.artifactId, created.id));
  expect(revision?.content).toMatchObject({
    generation: { outcome: "partial", warnings: ["partial_generation"] },
    schemaVersion: 2,
  });
  const terminalStreamRows = await testDatabase.pool.query<{ key: string; value: string }>(
    `SELECT DISTINCT ON (key) key, value
       FROM dbos.streams
      WHERE workflow_uuid = $1
      ORDER BY key, "offset" DESC`,
    [requiredGenerationAttemptId(created)],
  );
  expect(terminalStreamRows.rows).toHaveLength(1);
  expect(terminalStreamRows.rows.every((row) => row.value === "__DBOS_STREAM_CLOSED__")).toBe(true);
});

test("publishes a later failed terminal sequence when only whitespace was streamed", async () => {
  const error = vi.spyOn(workerLogger, "error");
  const created = await startTeachingDocumentGeneration(
    actor,
    {
      conversationId: randomUUID(),
      locale: "en-US",
      prompt: "whitespace-timeout",
      sourceUserMessageId: `dbos-worker-whitespace-${randomUUID()}`,
      workspaceId,
    },
    createTeachingDocumentDbosQueue(),
    testDatabase.db,
  );

  await expect(
    DBOS.retrieveWorkflow(requiredGenerationAttemptId(created)).getResult({
      pollingIntervalMs: 20,
    }),
  ).resolves.toBeNull();
  const events = await testDatabase.pool.query<{ value: string }>(
    `SELECT value
       FROM dbos.streams
      WHERE workflow_uuid = $1
        AND value <> '__DBOS_STREAM_CLOSED__'
      ORDER BY "offset"`,
    [requiredGenerationAttemptId(created)],
  );
  const parsed = events.rows.map((row) => {
    const outer: unknown = JSON.parse(row.value);
    const event: unknown = typeof outer === "string" ? JSON.parse(outer) : outer;
    if (!event || typeof event !== "object") throw new Error("Invalid stream event");
    return event;
  });
  expect(parsed).toMatchObject([
    { event: "text_delta", sequence: 1 },
    { event: "failed", sequence: TEACHING_DOCUMENT_TERMINAL_SEQUENCE },
  ]);
  expect(error).toHaveBeenCalledWith(
    expect.objectContaining({
      artifactId: created.id,
      artifactKind: "teaching_document",
      attemptId: requiredGenerationAttemptId(created),
      durationMs: expect.any(Number),
      event: "artifact.generation.failed",
      failureCode: "teaching_document_generation_timeout",
    }),
    "Artifact generation failed",
  );
  error.mockRestore();
});

test("projects invalid persisted generation input into a terminal failure", async () => {
  const conversationId = randomUUID();
  const prompt = "Load invalid persisted input";
  const created = await startTeachingDocumentGeneration(
    actor,
    {
      conversationId,
      locale: "en-US",
      prompt,
      sourceUserMessageId: `dbos-worker-load-failure-${randomUUID()}`,
      workspaceId,
    },
    { async enqueue() {} },
    testDatabase.db,
  );
  await testDatabase.pool.query(
    "UPDATE artifacts SET generation_request = $2::jsonb WHERE id = $1",
    [created.id, JSON.stringify({ prompt })],
  );
  await enqueueWorkflow({
    artifactId: created.id,
    conversationId,
    generationAttemptId: requiredGenerationAttemptId(created),
    locale: "en-US",
    prompt,
  });

  expect(
    await DBOS.retrieveWorkflow(requiredGenerationAttemptId(created)).getResult({
      pollingIntervalMs: 20,
    }),
  ).toBeNull();
  const [stored] = await testDatabase.db
    .select()
    .from(artifacts)
    .where(eq(artifacts.id, created.id));
  expect(stored).toMatchObject({
    generationFailureCode: "teaching_document_provider_failed",
    generationState: "failed",
    generationAttemptId: null,
  });
});

test("projects finalization errors into a terminal failure", async () => {
  const conversationId = randomUUID();
  const prompt = "Fail before finalization";
  const created = await startTeachingDocumentGeneration(
    actor,
    {
      conversationId,
      locale: "en-US",
      prompt,
      sourceUserMessageId: `dbos-worker-finalization-failure-${randomUUID()}`,
      workspaceId,
    },
    { async enqueue() {} },
    testDatabase.db,
  );
  failBeforeFinalization.add(created.id);
  await enqueueWorkflow({
    artifactId: created.id,
    conversationId,
    generationAttemptId: requiredGenerationAttemptId(created),
    locale: "en-US",
    prompt,
  });

  expect(
    await DBOS.retrieveWorkflow(requiredGenerationAttemptId(created)).getResult({
      pollingIntervalMs: 20,
    }),
  ).toBeNull();
  const [stored] = await testDatabase.db
    .select()
    .from(artifacts)
    .where(eq(artifacts.id, created.id));
  expect(stored).toMatchObject({
    generationFailureCode: "teaching_document_provider_failed",
    generationState: "failed",
    generationAttemptId: null,
  });
});

test("continues generation after the root Run completes and expires", async () => {
  const conversationId = randomUUID();
  const prompt = `budget-exhausted-${randomUUID()}`;
  const sourceUserMessageId = `user:${randomUUID()}`;
  const root = await createAiRunAudit(
    {
      conversationId,
      createdByPrincipalId: actor.principalId,
      inputMessageId: sourceUserMessageId,
      operation: "send",
      requestHash: aiRunRequestHash({
        artifact: { type: "teaching_document" },
        locale: "en-US",
        operation: { type: "send" },
        text: prompt,
      }),
      workspaceId,
    },
    testDatabase.db,
  );
  const created = await startTeachingDocumentGeneration(
    actor,
    {
      conversationId,
      locale: "en-US",
      prompt,
      rootRunId: root.id,
      sourceUserMessageId,
      workspaceId,
    },
    { async enqueue() {} },
    testDatabase.db,
  );
  await completeAiRunAudit({ runId: root.id }, testDatabase.db);
  await testDatabase.db
    .update(aiRuns)
    .set({ deadlineAt: new Date(0) })
    .where(eq(aiRuns.id, root.id));
  await enqueueWorkflow({
    artifactId: created.id,
    conversationId,
    generationAttemptId: requiredGenerationAttemptId(created),
    locale: "en-US",
    prompt,
  });

  await expect(
    DBOS.retrieveWorkflow(requiredGenerationAttemptId(created)).getResult({
      pollingIntervalMs: 20,
    }),
  ).resolves.toMatchObject({ id: created.id });
  expect(generatedPrompts).toContain(prompt);
  const [stored] = await testDatabase.db
    .select()
    .from(artifacts)
    .where(eq(artifacts.id, created.id));
  expect(stored).toMatchObject({ generationFailureCode: null, generationState: "ready" });
});

test("writes every structured Word increment without applying the Map throttle", async () => {
  const created = await startTeachingDocumentGeneration(
    actor,
    {
      conversationId: randomUUID(),
      locale: "en-US",
      prompt: "many-snapshots",
      sourceUserMessageId: `dbos-worker-coalescing-${randomUUID()}`,
      workspaceId,
    },
    createTeachingDocumentDbosQueue(),
    testDatabase.db,
  );

  await DBOS.retrieveWorkflow(requiredGenerationAttemptId(created)).getResult({
    pollingIntervalMs: 20,
  });
  const streamRows = await testDatabase.pool.query<{ count: string }>(
    "SELECT count(*) FROM dbos.streams WHERE workflow_uuid = $1",
    [requiredGenerationAttemptId(created)],
  );
  // Forty provider deltas, one terminal fact event, and DBOS's durable close marker.
  expect(Number(streamRows.rows[0]?.count)).toBeGreaterThanOrEqual(41);
  expect(Number(streamRows.rows[0]?.count)).toBeLessThanOrEqual(42);
}, 15_000);

test("never retries a provider call automatically", async () => {
  const partialArtifact = await testDatabase.db
    .select({ generationAttemptId: artifactRevisions.generationAttemptId, id: artifacts.id })
    .from(artifacts)
    .innerJoin(artifactRevisions, eq(artifactRevisions.artifactId, artifacts.id))
    .where(eq(artifacts.generationState, "ready"));
  const partial = partialArtifact.find((row) => row.id);
  const artifactId = partial?.id;
  expect(artifactId).toBeDefined();
  expect(partial?.generationAttemptId).toBeDefined();
  const streamRows = await testDatabase.pool.query<{ key: string }>(
    `SELECT DISTINCT key FROM dbos.streams WHERE workflow_uuid = $1`,
    [partial?.generationAttemptId],
  );
  expect(streamRows.rows).toHaveLength(1);
  expect(streamRows.rows.every((row) => row.key.startsWith(artifactDbosStreamKey("")))).toBe(true);
  expect(generatedPrompts.filter((prompt) => prompt === "force-timeout")).toHaveLength(1);
});

test("deletion scrubs product content while retaining durable workflow state", async () => {
  const [stored] = await testDatabase.db
    .select({
      conversationId: artifacts.conversationId,
      generationAttemptId: artifactRevisions.generationAttemptId,
      id: artifacts.id,
    })
    .from(artifacts)
    .innerJoin(artifactRevisions, eq(artifactRevisions.id, artifacts.currentRevisionId))
    .where(eq(artifacts.generationState, "ready"))
    .limit(1);
  expect(stored?.conversationId).toBeTruthy();
  if (!stored?.conversationId || !stored.generationAttemptId) {
    throw new Error("Ready Artifact fixture is missing");
  }

  await deleteTeachingDocumentForConversationWithCleanupQueue(
    actor,
    { artifactId: stored.id, conversationId: stored.conversationId, workspaceId },
    testDatabase.db,
    { async enqueue() {} },
  );
  await DBOS.cancelWorkflow(stored.generationAttemptId, { cancelChildren: true });
  await purgeDeletedTeachingDocumentContent(stored.id, testDatabase.db);

  const [productTombstone] = await testDatabase.db
    .select({
      deletedAt: artifacts.deletedAt,
      failureCode: artifacts.generationFailureCode,
      generationRequest: artifacts.generationRequest,
    })
    .from(artifacts)
    .where(eq(artifacts.id, stored.id));
  const revisionCount = await testDatabase.pool.query<{ count: string }>(
    "SELECT count(*) FROM artifact_revisions WHERE artifact_id = $1",
    [stored.id],
  );
  const workflowRows = await testDatabase.pool.query<{ status: string }>(
    "SELECT status FROM dbos.workflow_status WHERE workflow_uuid = $1",
    [stored.generationAttemptId],
  );
  expect(productTombstone).toMatchObject({
    deletedAt: expect.any(Date),
    failureCode: null,
    generationRequest: null,
  });
  expect(revisionCount.rows).toEqual([{ count: "0" }]);
  expect(workflowRows.rows).toEqual([{ status: "SUCCESS" }]);
});
