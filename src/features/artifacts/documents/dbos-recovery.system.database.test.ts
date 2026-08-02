import { randomUUID } from "node:crypto";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createMigratedTestDatabase } from "@tests/database";
import { count, eq } from "drizzle-orm";
import { execa } from "execa";
import { afterAll, beforeAll, expect, test } from "vitest";
import { artifactRevisions, artifacts, principals } from "@/database/schema";
import { createTeachingDocumentDbosQueue } from "@/features/artifacts/documents/dbos";
import { TEACHING_DOCUMENT_TERMINAL_SEQUENCE } from "@/features/artifacts/documents/realtime";
import { startTeachingDocumentGeneration } from "@/features/artifacts/documents/service";
import type { Actor } from "@/features/identity/types";
import { createWorkspace } from "@/features/workspaces/service";
import { initializeDbosSystem } from "@/worker/dbos-system.server";

type WorkerPhase = "complete" | "long" | "pause-generating" | "pause-finalizing";

let testDatabase: Awaited<ReturnType<typeof createMigratedTestDatabase>>;
let actor: Actor;
let workspaceId: string;
const childCleanups = new Set<() => Promise<void>>();

beforeAll(async () => {
  testDatabase = await createMigratedTestDatabase();
  await initializeDbosSystem({
    connectionString: testDatabase.connectionString,
    poolSize: 2,
  });
  const principalId = randomUUID();
  actor = { handle: `dbos-recovery-${principalId.slice(0, 8)}`, principalId };
  await testDatabase.db.insert(principals).values({
    authUserId: `dbos-recovery-${principalId}`,
    handle: actor.handle,
    id: principalId,
  });
  workspaceId = (await createWorkspace(actor, { name: "DBOS recovery test" }, testDatabase.db)).id;
});

afterAll(async () => {
  await Promise.all([...childCleanups].map((cleanup) => cleanup()));
  await testDatabase.destroy();
});

function startWorker(phase: WorkerPhase) {
  const child = execa(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      path.resolve(process.cwd(), "scripts/artifact-dbos-recovery-worker.ts"),
    ],
    {
      env: {
        ...process.env,
        ARTIFACT_DBOS_RECOVERY_PHASE: phase,
        DATABASE_URL: testDatabase.connectionString,
      },
      reject: false,
    },
  );
  const output: string[] = [];
  child.stdout?.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  let stopped = false;
  const cleanup = async () => {
    if (stopped) return;
    stopped = true;
    child.kill("SIGKILL");
    await child;
    childCleanups.delete(cleanup);
  };
  childCleanups.add(cleanup);
  void child.then(() => {
    stopped = true;
    childCleanups.delete(cleanup);
  });
  return { child, cleanup, output };
}

async function stopWorker(worker: ReturnType<typeof startWorker>, signal: "SIGKILL" | "SIGTERM") {
  worker.child.kill(signal);
  await worker.child;
  await worker.cleanup();
}

async function waitForArtifactState(
  artifactId: string,
  expectedState: string,
  worker?: ReturnType<typeof startWorker>,
  timeoutMs = 12_000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [artifact] = await testDatabase.db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, artifactId));
    if (artifact?.generationState === expectedState) return artifact;
    await delay(50);
  }
  throw new Error(
    `Artifact ${artifactId} did not reach ${expectedState}. Worker output:\n${worker?.output.join("") ?? "not captured"}`,
  );
}

function requiredGenerationAttemptId(detail: { generationAttemptId: string | null }) {
  if (!detail.generationAttemptId) throw new Error("Generation attempt missing");
  return detail.generationAttemptId;
}

async function waitForGenerationCheckpoint(generationAttemptId: string) {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    const checkpoint = await testDatabase.pool.query<{ count: string }>(
      `SELECT count(*)
         FROM dbos.operation_outputs
        WHERE workflow_uuid = $1
          AND function_name = 'generateTeachingDocumentDraft'
          AND error IS NULL`,
      [generationAttemptId],
    );
    if (checkpoint.rows[0]?.count === "1") return;
    await delay(50);
  }
  throw new Error(`Generation attempt ${generationAttemptId} did not checkpoint generation`);
}

async function waitForDurableStream(generationAttemptId: string, minimumEventCount = 1) {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    const streams = await testDatabase.pool.query<{ key: string }>(
      `SELECT key
         FROM dbos.streams
        WHERE workflow_uuid = $1
          AND value <> '__DBOS_STREAM_CLOSED__'`,
      [generationAttemptId],
    );
    if (streams.rows.length >= minimumEventCount) return streams.rows;
    await delay(50);
  }
  throw new Error(
    `Generation attempt ${generationAttemptId} did not persist its first durable stream event`,
  );
}

async function queuedArtifact(label: string) {
  return startTeachingDocumentGeneration(
    actor,
    {
      conversationId: randomUUID(),
      locale: "en-US",
      prompt: label,
      sourceUserMessageId: `dbos-recovery-${label}-${randomUUID()}`,
      workspaceId,
    },
    createTeachingDocumentDbosQueue(),
    testDatabase.db,
  );
}

async function expectSingleRevision(artifactId: string) {
  const [revisionCount] = await testDatabase.db
    .select({ value: count() })
    .from(artifactRevisions)
    .where(eq(artifactRevisions.artifactId, artifactId));
  expect(revisionCount?.value).toBe(1);
}

function streamEventSequence(value: string) {
  const parsed: unknown = JSON.parse(value);
  const event: unknown = typeof parsed === "string" ? JSON.parse(parsed) : parsed;
  if (!event || typeof event !== "object" || !("sequence" in event)) {
    throw new Error("DBOS stream event is missing its sequence");
  }
  const sequence = Reflect.get(event, "sequence");
  if (typeof sequence !== "number") throw new Error("DBOS stream sequence is invalid");
  return sequence;
}

test("recovers visible checkpoint content without starting a second model attempt", async () => {
  const artifact = await queuedArtifact("recover-generating");
  const generationAttemptId = requiredGenerationAttemptId(artifact);
  const firstWorker = startWorker("pause-generating");
  const generating = await waitForArtifactState(artifact.id, "generating", firstWorker);
  const firstAttemptId = generating.generationAttemptId;
  expect(firstAttemptId).toBeTruthy();
  await waitForDurableStream(generationAttemptId, 2);

  await stopWorker(firstWorker, "SIGKILL");
  const [checkpointBeforeRecovery] = await testDatabase.db
    .select({ sequence: artifacts.generationSequence })
    .from(artifacts)
    .where(eq(artifacts.id, artifact.id));
  const visibleEventsBeforeRecovery = await testDatabase.pool.query<{ value: string }>(
    `SELECT value
       FROM dbos.streams
      WHERE workflow_uuid = $1
        AND value <> '__DBOS_STREAM_CLOSED__'`,
    [generationAttemptId],
  );
  const visibleSequencesBeforeRecovery = visibleEventsBeforeRecovery.rows.map((row) =>
    streamEventSequence(row.value),
  );
  expect(visibleSequencesBeforeRecovery).toEqual([1, 2]);
  expect(Math.max(...visibleSequencesBeforeRecovery)).toBeGreaterThan(
    checkpointBeforeRecovery?.sequence ?? 0,
  );

  const recoveryWorker = startWorker("complete");
  await waitForArtifactState(artifact.id, "ready", recoveryWorker);
  await stopWorker(recoveryWorker, "SIGTERM");

  await expectSingleRevision(artifact.id);
  const streams = await testDatabase.pool.query<{ key: string; value: string }>(
    `SELECT DISTINCT ON (key) key, value
       FROM dbos.streams
      WHERE workflow_uuid = $1
      ORDER BY key, "offset" DESC`,
    [generationAttemptId],
  );
  expect(streams.rows).toHaveLength(1);
  expect(streams.rows[0]?.key).toBe(`artifact:${firstAttemptId}`);
  expect(streams.rows.every((row) => row.value === "__DBOS_STREAM_CLOSED__")).toBe(true);
  const recoveredEvents = await testDatabase.pool.query<{ value: string }>(
    `SELECT value
       FROM dbos.streams
      WHERE workflow_uuid = $1
        AND value <> '__DBOS_STREAM_CLOSED__'
      ORDER BY "offset"`,
    [generationAttemptId],
  );
  const recoveredSequences = recoveredEvents.rows.map((row) => streamEventSequence(row.value));
  expect(recoveredSequences).toEqual([1, 2, TEACHING_DOCUMENT_TERMINAL_SEQUENCE]);
  const status = await testDatabase.pool.query<{ status: string }>(
    `SELECT status FROM dbos.workflow_status WHERE workflow_uuid = $1`,
    [generationAttemptId],
  );
  expect(status.rows).toEqual([{ status: "SUCCESS" }]);
}, 30_000);

test("recovers after generation checkpoint without rerunning the model or duplicating the revision", async () => {
  const artifact = await queuedArtifact("recover-finalizing");
  const generationAttemptId = requiredGenerationAttemptId(artifact);
  const firstWorker = startWorker("pause-finalizing");
  const finalizing = await waitForArtifactState(artifact.id, "finalizing", firstWorker);
  await waitForGenerationCheckpoint(generationAttemptId);
  const attemptId = finalizing.generationAttemptId;
  expect(attemptId).toBeTruthy();

  await stopWorker(firstWorker, "SIGKILL");
  const recoveryWorker = startWorker("complete");
  await waitForArtifactState(artifact.id, "ready", recoveryWorker);
  await stopWorker(recoveryWorker, "SIGTERM");

  await expectSingleRevision(artifact.id);
  const streams = await testDatabase.pool.query<{ key: string }>(
    `SELECT DISTINCT key FROM dbos.streams WHERE workflow_uuid = $1`,
    [generationAttemptId],
  );
  expect(streams.rows).toHaveLength(1);
  expect(streams.rows[0]?.key).toBe(`artifact:${attemptId}`);
}, 30_000);

test.runIf(process.env.ARTIFACT_DBOS_LONG_SMOKE === "1")(
  "recovers an opt-in 25 minute generation after the Artifact Worker restarts",
  async () => {
    const artifact = await queuedArtifact("recover-long-generation");
    const firstWorker = startWorker("pause-generating");
    await waitForArtifactState(artifact.id, "generating", firstWorker);
    await delay(5_000);
    await stopWorker(firstWorker, "SIGKILL");

    const recoveryWorker = startWorker("long");
    await waitForArtifactState(artifact.id, "ready", recoveryWorker, 27 * 60 * 1_000);
    await stopWorker(recoveryWorker, "SIGTERM");
    await expectSingleRevision(artifact.id);
  },
  30 * 60 * 1_000,
);
