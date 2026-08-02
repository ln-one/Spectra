import { createHash, randomUUID } from "node:crypto";
import { DBOS } from "@dbos-inc/dbos-sdk";
import { createMigratedTestDatabase } from "@tests/database";
import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { databasePoolProfiles } from "@/database/pool-profiles";
import { artifactRevisions, artifactSourceBundles, artifacts, principals } from "@/database/schema";
import { ARTIFACT_DBOS_SCHEMA } from "@/features/artifacts/dbos-queue.server";
import type { ArtifactRenderStorage } from "@/features/artifacts/render-storage.server";
import type { OpenHandsAuthoringClient } from "@/features/artifacts/task-agent/openhands-client.server";
import type { Actor } from "@/features/identity/types";
import { createWorkspace } from "@/features/workspaces/service";
import { workerLogger } from "@/observability/server";
import { initializeDbosSystem } from "@/worker/dbos-system.server";
import { createPresentationDbosQueue, PRESENTATION_AUTHORING_DBOS_QUEUE } from "./dbos";
import { registerPresentationAuthoringDbosWorkflow } from "./dbos-worker";
import { startPresentationGeneration } from "./service";

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
  llmReasoningEffort: "medium" as const,
  llmTimeoutSeconds: 900,
  maxDurationMs: 60_000,
  maxIterations: 200,
  pollIntervalMs: 10,
  presentationBudget: {
    collectionReserveMs: 10_000,
    maxAccumulatedTokens: 12_000_000,
    maxFailedVisualChecks: 8,
    maxStalledVisualChecks: 3,
  },
  recipeVersion: "presentation-pptd-v1" as const,
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
  actor = {
    handle: `presentation-dbos-${principalId.slice(0, 8)}`,
    principalId,
  };
  await testDatabase.db.insert(principals).values({
    authUserId: `presentation-dbos-${principalId}`,
    handle: actor.handle,
    id: principalId,
  });
  workspaceId = (await createWorkspace(actor, { name: "Presentation DBOS" }, testDatabase.db)).id;
});

afterAll(async () => {
  if (runtimeStarted) await DBOS.shutdown({ deregister: true });
  await testDatabase.destroy();
});

test("continues an incomplete agent message and publishes once after FinishAction", async () => {
  const authoringLogs = vi.spyOn(workerLogger, "info");
  const createConversation = vi.fn(async ({ conversationId }) => ({
    conversationId,
    status: "running" as const,
  }));
  const continueConversation = vi.fn(async () => {});
  const getConversation = vi.fn<OpenHandsAuthoringClient["getConversation"]>().mockResolvedValue({
    found: true,
    status: "finished",
    usageById: {},
  });
  const stopConversation = vi.fn(async () => {});
  const terminalEventPages = [
    {
      cursor: null,
      items: [{ id: "message-1", kind: "MessageEvent", source: "agent" }],
    },
    {
      cursor: null,
      items: [
        {
          action: { kind: "FinishAction" },
          id: "finish-1",
          kind: "ActionEvent",
          source: "agent",
        },
      ],
    },
  ];
  let olderProgressReturned = false;
  let terminalRunsCompleted = 0;
  const progressDeadlinesByRun: string[][] = [[], []];
  const listEvents = vi.fn(
    async ({
      cursor,
      deadlineAt,
      limit,
    }: {
      cursor?: string | null;
      deadlineAt?: string;
      limit?: number;
    }) => {
      if (limit === 100) {
        if (deadlineAt) progressDeadlinesByRun[terminalRunsCompleted]?.push(deadlineAt);
        if ((cursor === null || cursor === undefined) && olderProgressReturned) {
          return {
            cursor: null,
            items: [
              {
                id: "progress-final",
                kind: "ObservationEvent",
                observation: {
                  text: 'SPECTRA_PPT_PROGRESS_V1 {"version":1,"phase":"screenshot","status":"completed","operation":"render","durationMs":80}',
                },
                source: "environment",
              },
            ],
          };
        }
        const page =
          cursor === null || cursor === undefined
            ? 0
            : Number(cursor.replace("progress-page-", ""));
        if (page < 10) {
          return {
            cursor: `progress-page-${page + 1}`,
            items: Array.from({ length: 100 }, (_, index) => ({
              id: `work-${page}-${index}`,
              kind: "ActionEvent",
              source: "agent",
            })),
          };
        }
        olderProgressReturned = true;
        return {
          cursor: null,
          items: [
            {
              forgotten_event_ids: ["work-0-0", "work-0-1"],
              id: "condensation-1",
              kind: "Condensation",
            },
            {
              id: "progress-1",
              kind: "ObservationEvent",
              observation: {
                content: [
                  {
                    text: 'SPECTRA_PPT_PROGRESS_V1 {"version":1,"phase":"visual_check","status":"completed","operation":"check","iteration":1,"durationMs":120,"issues":{"boundsOutside":1,"textOverflow":2,"overlap":3}}',
                  },
                ],
              },
              source: "environment",
            },
          ],
        };
      }
      const terminalPage = terminalEventPages.shift() ?? {
        cursor: null,
        items: [],
      };
      terminalRunsCompleted += 1;
      return terminalPage;
    },
  );
  const client: OpenHandsAuthoringClient = {
    continueConversation,
    createConversation,
    downloadArchive: vi.fn(async ({ deadlineAt }: { deadlineAt?: string }) => {
      // Mirror the real client's boundedTimeout: collection after the workflow
      // deadline must fail so a salvage attempt cannot outlive the attempt.
      if (deadlineAt && new Date(deadlineAt).getTime() <= Date.now()) {
        throw new Error("task_agent_deadline_exceeded");
      }
      return {
        archive: new Uint8Array([1, 2, 3]),
        sha256: "a".repeat(64),
      };
    }),
    downloadFile: vi.fn(async () => new Uint8Array()),
    getConversation,
    getServerInfo: vi.fn(async () => ({
      usable_tools: ["file_editor", "task_tracker", "terminal"],
      version: "1.37.1",
    })),
    listEvents,
    stopConversation,
    uploadFile: vi.fn(async () => {}),
  };
  const sourceArchive = new TextEncoder().encode("normalized source");
  const pptx = new TextEncoder().encode("valid pptx");
  registerPresentationAuthoringDbosWorkflow({
    client,
    db: testDatabase.db,
    environment,
    inspectSource: async () => ({ entrypoint: "deck.pptd", files: [] }),
    pool: testDatabase.pool,
    runPipeline: async () => ({
      content: {
        pageCount: 2,
        pageTitles: ["Opening", "Summary"],
        schemaVersion: 1,
        summary: "A native PPTD project.",
        title: "Native Presentation",
      },
      pptx,
      pptxSha256: sha256(pptx),
      sourceArchive,
      sourceArchiveSha256: sha256(sourceArchive),
      sourceManifest: {
        entrypoint: "out/deck.pptd",
        files: [
          {
            path: "out/deck.pptd",
            sha256: "a".repeat(64),
            sizeBytes: 10,
          },
        ],
        schemaVersion: 1,
      },
    }),
    storage: memoryStorage(),
  });
  DBOS.setConfig({
    listenQueues: [PRESENTATION_AUTHORING_DBOS_QUEUE],
    name: "spectra-presentation-worker-test",
    runAdminServer: false,
    systemDatabasePoolSize: databasePoolProfiles.artifactWorkflowSystem.max,
    systemDatabaseSchemaName: ARTIFACT_DBOS_SCHEMA,
    systemDatabaseUrl: testDatabase.connectionString,
    tracingEnabled: false,
    useListenNotify: true,
  });
  await DBOS.launch();
  runtimeStarted = true;

  const detail = await startPresentationGeneration(
    actor,
    {
      conversationId: randomUUID(),
      locale: "en-US",
      prompt: "Create a native presentation",
      sourceUserMessageId: `presentation-dbos-${randomUUID()}`,
      workspaceId,
    },
    createPresentationDbosQueue(),
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

  expect(result).toMatchObject({ artifactId: detail.id });
  expect(artifact).toMatchObject({
    generationState: "ready",
    title: "Native Presentation",
  });
  expect(revisionCount?.value).toBe(1);
  expect(bundleCount?.value).toBe(1);
  expect(createConversation).toHaveBeenCalledOnce();
  expect(continueConversation).toHaveBeenCalledOnce();
  expect(listEvents).toHaveBeenCalledWith(
    expect.objectContaining({
      cursor: "progress-page-10",
      limit: 100,
      order: "newest",
    }),
  );
  expect(progressDeadlinesByRun.every((deadlines) => new Set(deadlines).size === 1)).toBe(true);
  expect(continueConversation).toHaveBeenCalledWith(
    expect.objectContaining({
      conversationId: expect.any(String),
      message: expect.stringContaining("FinishTool"),
    }),
  );
  expect(await handle.getResult({ pollingIntervalMs: 20 })).toEqual(result);
  expect(authoringLogs).toHaveBeenCalledWith(
    expect.objectContaining({
      artifactId: detail.id,
      boundsOutsideCount: 1,
      event: "artifact.authoring.progress",
      iteration: 1,
      overlapCount: 3,
      phase: "visual_check",
      progressId: "progress-1:0",
      textOverflowCount: 2,
    }),
    expect.any(String),
  );
  expect(
    authoringLogs.mock.calls.filter(
      ([fields]) =>
        fields &&
        typeof fields === "object" &&
        "event" in fields &&
        fields.event === "artifact.authoring.progress",
    ),
  ).toHaveLength(2);
  expect(authoringLogs).toHaveBeenCalledWith(
    expect.objectContaining({
      artifactId: detail.id,
      event: "artifact.authoring.progress",
      phase: "screenshot",
      progressId: "progress-final:0",
    }),
    expect.any(String),
  );
  expect(authoringLogs).toHaveBeenCalledWith(
    expect.objectContaining({
      artifactId: detail.id,
      condensationCount: 1,
      event: "artifact.authoring.budget_snapshot",
    }),
    expect.any(String),
  );
  expect(authoringLogs).toHaveBeenCalledWith(
    expect.objectContaining({
      artifactId: detail.id,
      event: "artifact.authoring.condensation_observed",
      forgottenEventCount: 2,
    }),
    expect.any(String),
  );
  expect(authoringLogs).toHaveBeenCalledWith(
    expect.objectContaining({
      artifactId: detail.id,
      continuationCount: 1,
      event: "artifact.authoring.continuation_requested",
      terminalEventType: "agent_message",
    }),
    expect.any(String),
  );
  expect(authoringLogs).toHaveBeenCalledWith(
    expect.objectContaining({
      artifactId: detail.id,
      continuationCount: 1,
      event: "artifact.authoring.finish_verified",
      terminalEventType: "finish_action",
    }),
    expect.any(String),
  );
  expect(authoringLogs).toHaveBeenCalledWith(
    expect.objectContaining({
      artifactId: detail.id,
      event: "artifact.authoring.started",
    }),
    expect.any(String),
  );
  expect(authoringLogs).toHaveBeenCalledWith(
    expect.objectContaining({
      artifactId: detail.id,
      event: "artifact.authoring.stage_changed",
      stage: "publishing",
    }),
    expect.any(String),
  );
  expect(authoringLogs).toHaveBeenCalledWith(
    expect.objectContaining({
      artifactId: detail.id,
      event: "artifact.authoring.remote_terminal",
      remoteStatus: "finished",
    }),
    expect.any(String),
  );
  expect(authoringLogs).toHaveBeenCalledWith(
    expect.objectContaining({
      artifactId: detail.id,
      event: "artifact.authoring.completed",
    }),
    expect.any(String),
  );

  getConversation.mockResolvedValue({
    found: true,
    status: "running",
    usageById: {
      "spectra-presentation-agent": {
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        completionTokens: 1,
        contextWindow: 1_000_000,
        model: "openai/spectra-authoring",
        perTurnTokens: 1,
        promptTokens: environment.presentationBudget.maxAccumulatedTokens,
        reasoningTokens: 1,
      },
    },
  });
  const salvagedDetail = await startPresentationGeneration(
    actor,
    {
      conversationId: randomUUID(),
      locale: "en-US",
      prompt: "Create a presentation that reaches its token budget",
      sourceUserMessageId: `presentation-dbos-budget-${randomUUID()}`,
      workspaceId,
    },
    createPresentationDbosQueue(),
    testDatabase.db,
  );
  if (!salvagedDetail.generationAttemptId) throw new Error("attempt_missing");
  const salvagedHandle = DBOS.retrieveWorkflow<{ artifactId: string; revisionId: string } | null>(
    salvagedDetail.generationAttemptId,
  );
  await expect(salvagedHandle.getResult({ pollingIntervalMs: 20 })).resolves.toMatchObject({
    artifactId: salvagedDetail.id,
  });
  const [salvagedArtifact] = await testDatabase.db
    .select()
    .from(artifacts)
    .where(eq(artifacts.id, salvagedDetail.id));
  const [salvagedRevisionCount] = await testDatabase.db
    .select({ value: count() })
    .from(artifactRevisions)
    .where(eq(artifactRevisions.artifactId, salvagedDetail.id));
  expect(salvagedArtifact).toMatchObject({
    generationFailureCode: null,
    generationState: "ready",
  });
  expect(salvagedRevisionCount?.value).toBe(1);
  expect(stopConversation).toHaveBeenCalledWith(
    expect.objectContaining({ conversationId: expect.any(String) }),
  );
  expect(authoringLogs).toHaveBeenCalledWith(
    expect.objectContaining({
      artifactId: salvagedDetail.id,
      event: "artifact.authoring.interrupt_completed",
      failureCode: "presentation_agent_token_budget_exhausted",
    }),
    expect.any(String),
  );
  expect(authoringLogs).toHaveBeenCalledWith(
    expect.objectContaining({
      artifactId: salvagedDetail.id,
      event: "artifact.authoring.salvaged",
      failureCode: "presentation_agent_token_budget_exhausted",
    }),
    expect.any(String),
  );

  getConversation.mockResolvedValue({
    found: true,
    status: "running",
    usageById: {},
  });
  stopConversation.mockClear();
  const authoringWarnings = vi.spyOn(workerLogger, "warn");
  const originalMaxDurationMs = environment.maxDurationMs;
  const originalCollectionReserveMs = environment.presentationBudget.collectionReserveMs;
  environment.maxDurationMs = 40;
  environment.presentationBudget.collectionReserveMs = 10;
  const timedOutDetail = await startPresentationGeneration(
    actor,
    {
      conversationId: randomUUID(),
      locale: "en-US",
      prompt: "Create a presentation that reaches its authoring deadline",
      sourceUserMessageId: `presentation-dbos-time-budget-${randomUUID()}`,
      workspaceId,
    },
    createPresentationDbosQueue(),
    testDatabase.db,
  );
  if (!timedOutDetail.generationAttemptId) throw new Error("attempt_missing");
  const timedOutHandle = DBOS.retrieveWorkflow<{ artifactId: string; revisionId: string } | null>(
    timedOutDetail.generationAttemptId,
  );
  await expect(timedOutHandle.getResult({ pollingIntervalMs: 20 })).resolves.toBeNull();
  environment.maxDurationMs = originalMaxDurationMs;
  environment.presentationBudget.collectionReserveMs = originalCollectionReserveMs;
  const [timedOutArtifact] = await testDatabase.db
    .select()
    .from(artifacts)
    .where(eq(artifacts.id, timedOutDetail.id));
  expect(timedOutArtifact).toMatchObject({
    generationFailureCode: "presentation_agent_time_budget_exhausted",
    generationState: "failed",
  });
  expect(stopConversation).toHaveBeenCalledWith(
    expect.objectContaining({ conversationId: expect.any(String) }),
  );
  expect(authoringLogs).toHaveBeenCalledWith(
    expect.objectContaining({
      artifactId: timedOutDetail.id,
      event: "artifact.authoring.interrupt_completed",
      failureCode: "presentation_agent_time_budget_exhausted",
    }),
    expect.any(String),
  );
  expect(authoringWarnings).toHaveBeenCalledWith(
    expect.objectContaining({
      artifactId: timedOutDetail.id,
      event: "artifact.authoring.salvage_unavailable",
      failureCode: "presentation_agent_time_budget_exhausted",
    }),
    expect.any(String),
  );

  getConversation.mockResolvedValue({
    found: true,
    status: "finished",
    usageById: {},
  });
  const listEventCallsBeforeUnavailableProgress = listEvents.mock.calls.length;
  listEvents.mockImplementation(async ({ limit }: { limit?: number }) => {
    if (limit === 100) throw new TypeError("events_unavailable");
    return {
      cursor: null,
      items: [
        {
          action: { kind: "FinishAction" },
          id: "finish-after-progress-timeout",
          kind: "ActionEvent",
          source: "agent",
        },
      ],
    };
  });
  stopConversation.mockClear();
  const unavailableProgressDetail = await startPresentationGeneration(
    actor,
    {
      conversationId: randomUUID(),
      locale: "en-US",
      prompt: "Create a presentation while progress events are unavailable",
      sourceUserMessageId: `presentation-dbos-progress-unavailable-${randomUUID()}`,
      workspaceId,
    },
    createPresentationDbosQueue(),
    testDatabase.db,
  );
  if (!unavailableProgressDetail.generationAttemptId) throw new Error("attempt_missing");
  const unavailableProgressHandle = DBOS.retrieveWorkflow<{
    artifactId: string;
    revisionId: string;
  } | null>(unavailableProgressDetail.generationAttemptId);
  await expect(
    unavailableProgressHandle.getResult({ pollingIntervalMs: 20 }),
  ).resolves.toMatchObject({
    artifactId: unavailableProgressDetail.id,
  });
  const [unavailableProgressArtifact] = await testDatabase.db
    .select()
    .from(artifacts)
    .where(eq(artifacts.id, unavailableProgressDetail.id));
  expect(unavailableProgressArtifact).toMatchObject({
    generationFailureCode: null,
    generationState: "ready",
  });
  expect(stopConversation).not.toHaveBeenCalled();
  const unavailableProgressCalls = listEvents.mock.calls.slice(
    listEventCallsBeforeUnavailableProgress,
  );
  expect(unavailableProgressCalls.filter(([call]) => call.limit === 100)).toHaveLength(2);
  expect(unavailableProgressCalls.filter(([call]) => call.limit === 50)).toHaveLength(1);
  expect(authoringWarnings).toHaveBeenCalledWith(
    expect.objectContaining({
      artifactId: unavailableProgressDetail.id,
      event: "artifact.authoring.progress_unavailable",
      failureCode: "presentation_progress_unavailable",
      progressRequiredForBudget: true,
    }),
    expect.any(String),
  );
  authoringWarnings.mockRestore();
  authoringLogs.mockRestore();
}, 45_000);
