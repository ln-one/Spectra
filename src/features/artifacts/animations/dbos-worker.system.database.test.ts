import { createHash, randomUUID } from "node:crypto";
import { DBOS } from "@dbos-inc/dbos-sdk";
import { createMigratedTestDatabase } from "@tests/database";
import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { databasePoolProfiles } from "@/database/pool-profiles";
import {
  artifactRenderJobs,
  artifactRevisions,
  artifactSourceBundles,
  artifacts,
  principals,
} from "@/database/schema";
import { ARTIFACT_DBOS_SCHEMA } from "@/features/artifacts/dbos-queue.server";
import type { ArtifactRenderStorage } from "@/features/artifacts/render-storage.server";
import type { OpenHandsAuthoringClient } from "@/features/artifacts/task-agent/openhands-client.server";
import type { Actor } from "@/features/identity/types";
import { createWorkspace } from "@/features/workspaces/service";
import { initializeDbosSystem } from "@/worker/dbos-system.server";
import { ANIMATION_AUTHORING_DBOS_QUEUE, createAnimationDbosQueue } from "./dbos";
import { registerAnimationAuthoringDbosWorkflow } from "./dbos-worker";
import { startAnimationGeneration } from "./service";

let testDatabase: Awaited<ReturnType<typeof createMigratedTestDatabase>>;
let actor: Actor;
let workspaceId: string;
let runtimeStarted = false;

const environment = {
  apiKey: "runtime-key",
  condenserMaxEvents: 80,
  condenserMaxOutputTokens: 4_096,
  condenserMaxTokens: 200_000,
  enabled: true,
  llmApiKey: "llm-key",
  llmBaseUrl: "https://llm.example.test/v1",
  llmEnableThinking: true,
  llmModel: "openai/spectra-authoring",
  llmReasoningEffort: "low" as const,
  llmTimeoutSeconds: 900,
  maxDurationMs: 60_000,
  maxIterations: 200,
  pollIntervalMs: 10,
  presentationBudget: null,
  recipeVersion: "animation-remotion-v1" as const,
  runtimeUrl: "http://openhands.internal",
  workspaceIsolation: "local_development" as const,
  workspaceRoot: "/workspace/spectra",
};

function sha256(body: Uint8Array) {
  return createHash("sha256").update(body).digest("hex");
}

function memoryStorage(): ArtifactRenderStorage {
  const objects = new Map<string, { body: Uint8Array; contentType: string; versionId: string }>();
  return {
    async delete({ key, versionId }) {
      if (objects.get(key)?.versionId === versionId) objects.delete(key);
    },
    async get({ key, versionId }) {
      const object = objects.get(key);
      if (!object || object.versionId !== versionId) throw new Error("object_not_found");
      return { body: object.body, contentType: object.contentType };
    },
    async listVersions({ key }) {
      const object = objects.get(key);
      return object ? [object.versionId] : [];
    },
    async put({ body, contentType, key }) {
      const versionId = `v-${sha256(body).slice(0, 12)}`;
      objects.set(key, { body, contentType, versionId });
      return { versionId };
    },
  };
}

beforeAll(async () => {
  testDatabase = await createMigratedTestDatabase();
  await initializeDbosSystem({
    connectionString: testDatabase.connectionString,
    poolSize: 2,
  });
  const principalId = randomUUID();
  actor = { handle: `animation-dbos-${principalId.slice(0, 8)}`, principalId };
  await testDatabase.db.insert(principals).values({
    authUserId: `animation-dbos-${principalId}`,
    handle: actor.handle,
    id: principalId,
  });
  workspaceId = (await createWorkspace(actor, { name: "Animation DBOS" }, testDatabase.db)).id;
});

afterAll(async () => {
  if (runtimeStarted) await DBOS.shutdown({ deregister: true });
  await testDatabase.destroy();
});

test("renders and publishes one MP4 through the official conversation contract", async () => {
  const createConversation = vi.fn(async ({ conversationId }) => ({
    conversationId,
    status: "running" as const,
  }));
  const client: OpenHandsAuthoringClient = {
    continueConversation: vi.fn(async () => {}),
    createConversation,
    downloadArchive: vi.fn(async () => ({
      archive: new Uint8Array([1, 2, 3]),
      sha256: "a".repeat(64),
    })),
    downloadFile: vi.fn(async () => new Uint8Array()),
    getConversation: vi.fn(async () => ({
      found: true as const,
      status: "finished" as const,
      usageById: {},
    })),
    getServerInfo: vi.fn(async () => ({
      usable_tools: ["file_editor", "task_tracker", "terminal"],
      version: "1.37.1",
    })),
    listEvents: vi.fn(async () => ({ cursor: null, items: [] })),
    stopConversation: vi.fn(async () => {}),
    uploadFile: vi.fn(async () => {}),
  };
  const sourceArchive = new TextEncoder().encode("normalized source");
  const mp4 = new Uint8Array([1, 2, 3]);
  registerAnimationAuthoringDbosWorkflow({
    client,
    db: testDatabase.db,
    environment,
    pool: testDatabase.pool,
    runPipeline: async () => ({
      content: {
        compositionId: "Main",
        durationInFrames: 450,
        fps: 30,
        height: 1080,
        schemaVersion: 1,
        summary: "A native Remotion project.",
        title: "Native animation",
        width: 1920,
      },
      mp4,
      mp4Sha256: sha256(mp4),
      sourceArchive,
      sourceArchiveSha256: sha256(sourceArchive),
      sourceManifest: {
        files: ["package.json", "package-lock.json", "src/index.ts", "src/Root.tsx"].map(
          (pathname) => ({
            path: `out/project/${pathname}`,
            sha256: "a".repeat(64),
            sizeBytes: 10,
          }),
        ),
        schemaVersion: 1,
      },
    }),
    storage: memoryStorage(),
  });
  DBOS.setConfig({
    listenQueues: [ANIMATION_AUTHORING_DBOS_QUEUE],
    name: "spectra-animation-worker-test",
    runAdminServer: false,
    systemDatabasePoolSize: databasePoolProfiles.artifactWorkflowSystem.max,
    systemDatabaseSchemaName: ARTIFACT_DBOS_SCHEMA,
    systemDatabaseUrl: testDatabase.connectionString,
    tracingEnabled: false,
    useListenNotify: true,
  });
  await DBOS.launch();
  runtimeStarted = true;

  const detail = await startAnimationGeneration(
    actor,
    {
      conversationId: randomUUID(),
      locale: "en-US",
      prompt: "Create a native animation",
      sourceUserMessageId: `animation-dbos-${randomUUID()}`,
      workspaceId,
    },
    createAnimationDbosQueue(),
    testDatabase.db,
  );
  if (!detail.generationAttemptId) throw new Error("attempt_missing");
  const handle = DBOS.retrieveWorkflow<{
    artifactId: string;
    revisionId: string;
  } | null>(detail.generationAttemptId);
  const result = await handle.getResult({ pollingIntervalMs: 20 });

  const [artifact] = await testDatabase.db
    .select()
    .from(artifacts)
    .where(eq(artifacts.id, detail.id));
  const [revisionCount] = await testDatabase.db
    .select({ value: count() })
    .from(artifactRevisions)
    .where(eq(artifactRevisions.artifactId, detail.id));
  const [bundleCount] = await testDatabase.db
    .select({ value: count() })
    .from(artifactSourceBundles)
    .where(eq(artifactSourceBundles.artifactId, detail.id));
  const [renderCount] = await testDatabase.db
    .select({ value: count() })
    .from(artifactRenderJobs)
    .where(eq(artifactRenderJobs.artifactId, detail.id));

  expect(result).toMatchObject({ artifactId: detail.id });
  expect(artifact).toMatchObject({
    generationState: "ready",
    title: "Native animation",
  });
  expect(revisionCount?.value).toBe(1);
  expect(bundleCount?.value).toBe(1);
  expect(renderCount?.value).toBe(1);
  expect(createConversation).toHaveBeenCalledOnce();
  expect(await handle.getResult({ pollingIntervalMs: 20 })).toEqual(result);
}, 30_000);
