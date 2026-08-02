import { randomUUID } from "node:crypto";
import { createMigratedTestDatabase } from "@tests/database";
import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, test } from "vitest";
import { artifacts, principals } from "@/database/schema";
import { ARTIFACT_DBOS_SCHEMA } from "@/features/artifacts/dbos-queue.server";
import {
  createTeachingDocumentDbosQueue,
  TEACHING_DOCUMENT_DBOS_QUEUE,
  TEACHING_DOCUMENT_DBOS_WORKFLOW,
} from "@/features/artifacts/documents/dbos";
import { startTeachingDocumentGeneration } from "@/features/artifacts/documents/service";
import { ARTIFACT_RENDER_DBOS_QUEUE } from "@/features/artifacts/render-dbos";
import type { Actor } from "@/features/identity/types";
import { createWorkspace } from "@/features/workspaces/service";
import { DBOS_QUEUE_NAMES } from "@/worker/dbos-queues.server";
import { initializeDbosSystem } from "@/worker/dbos-system.server";

let testDatabase: Awaited<ReturnType<typeof createMigratedTestDatabase>>;
let actor: Actor;
let workspaceId: string;

beforeAll(async () => {
  testDatabase = await createMigratedTestDatabase();
  await initializeDbosSystem({
    connectionString: testDatabase.connectionString,
    poolSize: 2,
  });
  const principalId = randomUUID();
  actor = { handle: `dbos-${principalId.slice(0, 8)}`, principalId };
  await testDatabase.db.insert(principals).values({
    authUserId: `dbos-${principalId}`,
    handle: actor.handle,
    id: principalId,
  });
  workspaceId = (await createWorkspace(actor, { name: "DBOS Artifact test" }, testDatabase.db)).id;
});

afterAll(async () => {
  await testDatabase.destroy();
});

function requiredGenerationAttemptId(detail: { generationAttemptId: string | null }) {
  if (!detail.generationAttemptId) throw new Error("Generation attempt missing");
  return detail.generationAttemptId;
}

test("initializes the DBOS schema and Drizzle datasource idempotently", async () => {
  await initializeDbosSystem({
    connectionString: testDatabase.connectionString,
    poolSize: 2,
  });
  const schema = await testDatabase.pool.query<{ schemaName: string }>(
    `SELECT schema_name AS "schemaName" FROM information_schema.schemata WHERE schema_name = $1`,
    [ARTIFACT_DBOS_SCHEMA],
  );
  const tables = await testDatabase.pool.query<{ tableName: string }>(
    `SELECT table_name AS "tableName" FROM information_schema.tables WHERE table_schema = $1`,
    [ARTIFACT_DBOS_SCHEMA],
  );
  const functions = await testDatabase.pool.query<{ count: string }>(
    `SELECT count(*) FROM pg_proc JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
      WHERE pg_namespace.nspname = $1 AND pg_proc.proname = 'enqueue_workflow'`,
    [ARTIFACT_DBOS_SCHEMA],
  );
  expect(schema.rows).toEqual([{ schemaName: ARTIFACT_DBOS_SCHEMA }]);
  expect(tables.rows.map((row) => row.tableName)).toEqual(
    expect.arrayContaining(["transaction_completion", "workflow_status", "queues", "streams"]),
  );
  expect(functions.rows).toEqual([{ count: "1" }]);
  const queues = await testDatabase.pool.query<{ name: string }>(
    `SELECT name FROM dbos.queues WHERE name = ANY($1::text[]) ORDER BY name`,
    [DBOS_QUEUE_NAMES],
  );
  expect(queues.rows.map((row) => row.name)).toEqual([...DBOS_QUEUE_NAMES].sort());
  expect(queues.rows.map((row) => row.name)).toContain(ARTIFACT_RENDER_DBOS_QUEUE);
});

test("commits the Artifact, generation attempt, and DBOS workflow atomically", async () => {
  const conversationId = randomUUID();
  const sourceUserMessageId = `dbos-atomic-${randomUUID()}`;
  const queue = createTeachingDocumentDbosQueue();
  const created = await startTeachingDocumentGeneration(
    actor,
    {
      conversationId,
      locale: "zh-CN",
      prompt: "验证 DBOS 事务入队",
      sourceUserMessageId,
      workspaceId,
    },
    queue,
    testDatabase.db,
  );
  const replay = await startTeachingDocumentGeneration(
    actor,
    {
      conversationId,
      locale: "zh-CN",
      prompt: "验证 DBOS 事务入队",
      sourceUserMessageId,
      workspaceId,
    },
    queue,
    testDatabase.db,
  );
  const [stored] = await testDatabase.db
    .select({ generationRequest: artifacts.generationRequest })
    .from(artifacts)
    .where(eq(artifacts.id, created.id));
  const workflow = await testDatabase.pool.query<{
    inputs: string;
    name: string;
    queueName: string;
    status: string;
  }>(
    `SELECT inputs, name, queue_name AS "queueName", status
       FROM dbos.workflow_status WHERE workflow_uuid = $1`,
    [requiredGenerationAttemptId(created)],
  );
  expect(replay.id).toBe(created.id);
  expect(stored?.generationRequest).toEqual({
    grounding: { evidence: [], version: 1 },
    locale: "zh-CN",
    prompt: "验证 DBOS 事务入队",
  });
  expect(workflow.rows).toHaveLength(1);
  expect(workflow.rows[0]).toMatchObject({
    name: TEACHING_DOCUMENT_DBOS_WORKFLOW,
    queueName: TEACHING_DOCUMENT_DBOS_QUEUE,
    status: "ENQUEUED",
  });
  expect(JSON.parse(workflow.rows[0]?.inputs ?? "null")).toEqual({
    namedArgs: {},
    positionalArgs: [created.id, requiredGenerationAttemptId(created)],
  });
});

test("setup never consumes an already queued Artifact workflow", async () => {
  const created = await startTeachingDocumentGeneration(
    actor,
    {
      conversationId: randomUUID(),
      locale: "en-US",
      prompt: "Leave this workflow queued during setup",
      sourceUserMessageId: `dbos-setup-${randomUUID()}`,
      workspaceId,
    },
    createTeachingDocumentDbosQueue(),
    testDatabase.db,
  );

  await initializeDbosSystem({
    connectionString: testDatabase.connectionString,
    poolSize: 2,
  });

  const workflow = await testDatabase.pool.query<{ status: string }>(
    "SELECT status FROM dbos.workflow_status WHERE workflow_uuid = $1",
    [requiredGenerationAttemptId(created)],
  );
  expect(workflow.rows).toEqual([{ status: "ENQUEUED" }]);
});

test("rolls back both the Artifact and DBOS workflow when enqueue fails", async () => {
  const sourceUserMessageId = `dbos-rollback-${randomUUID()}`;
  const dbosQueue = createTeachingDocumentDbosQueue();
  const beforeWorkflowCount = await testDatabase.pool.query<{ count: string }>(
    "SELECT count(*) FROM dbos.workflow_status",
  );
  await expect(
    startTeachingDocumentGeneration(
      actor,
      {
        conversationId: randomUUID(),
        locale: "en-US",
        prompt: "Rollback this request",
        sourceUserMessageId,
        workspaceId,
      },
      {
        async enqueue(transaction, job) {
          await dbosQueue.enqueue(transaction, job);
          throw new Error("forced enqueue rollback");
        },
      },
      testDatabase.db,
    ),
  ).rejects.toThrow("forced enqueue rollback");
  const [artifactCount] = await testDatabase.db
    .select({ value: count() })
    .from(artifacts)
    .where(eq(artifacts.sourceUserMessageId, sourceUserMessageId));
  const afterWorkflowCount = await testDatabase.pool.query<{ count: string }>(
    "SELECT count(*) FROM dbos.workflow_status",
  );
  expect(artifactCount?.value).toBe(0);
  expect(afterWorkflowCount.rows).toEqual(beforeWorkflowCount.rows);
});
