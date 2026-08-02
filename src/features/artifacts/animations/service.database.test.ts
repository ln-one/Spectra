import { createHash, randomUUID } from "node:crypto";
import { createMigratedTestDatabase } from "@tests/database";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import {
  artifactRenderJobs,
  artifactSourceBundles,
  artifactSources,
  artifacts,
  sources,
  workspacePermissionGrants,
} from "@/database/schema";
import { ensurePrincipalForAuthUser } from "@/features/identity/service";
import { createWorkspace } from "@/features/workspaces/service";
import { stageArtifactSourceBundle } from "../source-bundles.server";
import { AnimationError } from "./errors";
import {
  ANIMATION_MEDIA_TYPES,
  claimAnimationGeneration,
  completeAnimationGeneration,
  getAnimationRender,
  startAnimationGeneration,
  updateAnimationStage,
} from "./service";

let testDatabase: Awaited<ReturnType<typeof createMigratedTestDatabase>>;

beforeAll(async () => {
  testDatabase = await createMigratedTestDatabase();
});

afterAll(async () => {
  await testDatabase.destroy();
});

test("atomically publishes an Animation Revision, source bundle, and all ready outputs", async () => {
  const suffix = randomUUID().slice(0, 8);
  const actor = await ensurePrincipalForAuthUser(
    `animation-${suffix}`,
    `animation-${suffix}`,
    testDatabase.db,
  );
  const workspace = await createWorkspace(actor, { name: "Animation" }, testDatabase.db);
  const jobs: Array<{ artifactId: string; generationAttemptId: string }> = [];
  const queue = {
    enqueue: async (
      _transaction: unknown,
      job: { artifactId: string; generationAttemptId: string },
    ) => {
      jobs.push(job);
    },
  };
  const conversationId = randomUUID();
  const sourceUserMessageId = `user:${randomUUID()}`;
  const detail = await startAnimationGeneration(
    actor,
    {
      conversationId,
      locale: "en-US",
      prompt: "Explain gradient descent in a short animation",
      sourceUserMessageId,
      workspaceId: workspace.id,
    },
    queue,
    testDatabase.db,
  );
  const replay = await startAnimationGeneration(
    actor,
    {
      conversationId,
      locale: "en-US",
      prompt: "Explain gradient descent in a short animation",
      sourceUserMessageId,
      workspaceId: workspace.id,
    },
    queue,
    testDatabase.db,
  );
  expect(replay.id).toBe(detail.id);
  expect(jobs).toHaveLength(1);
  const attemptId = detail.generationAttemptId;
  if (!attemptId) throw new Error("attempt_missing");
  await claimAnimationGeneration(detail.id, attemptId, testDatabase.db);
  await stageArtifactSourceBundle(
    {
      artifactId: detail.id,
      generationAttemptId: attemptId,
      manifest: {
        assetReceipts: [],
        files: [
          "package.json",
          "package-lock.json",
          "tsconfig.json",
          "src/index.ts",
          "src/Root.tsx",
          "src/Animation.tsx",
        ].map((path, index) => ({
          path: `out/project/${path}`,
          sha256: String(index + 1).repeat(64),
          sizeBytes: 10,
        })),
        schemaVersion: 1,
      },
      mediaType: "application/gzip",
      objectKey: "animation-source.tar.gz",
      objectVersionId: "source-v1",
      recipeVersion: "animation-remotion-v1",
      sha256: "a".repeat(64),
      sizeBytes: 100,
    },
    testDatabase.db,
  );
  await updateAnimationStage(detail.id, attemptId, "publishing", testDatabase.db);
  const objects = { mp4: new Uint8Array(120).fill(1) };
  const ready = await completeAnimationGeneration(
    {
      actorId: actor.principalId,
      artifactId: detail.id,
      attemptId,
      content: {
        compositionId: "Main",
        durationInFrames: 450,
        fps: 30,
        height: 1080,
        schemaVersion: 1,
        summary: "Gradient descent explained in three scenes.",
        title: "Gradient descent",
        width: 1920,
      },
      outputs: Object.fromEntries(
        Object.entries(objects).map(([format, body]) => [
          format,
          {
            objectKey: `${format}.bin`,
            objectVersionId: `${format}-v1`,
            sha256: createHash("sha256").update(body).digest("hex"),
            sizeBytes: body.byteLength,
          },
        ]),
      ) as Parameters<typeof completeAnimationGeneration>[0]["outputs"],
    },
    testDatabase.db,
  );

  const [bundle] = await testDatabase.db
    .select()
    .from(artifactSourceBundles)
    .where(eq(artifactSourceBundles.artifactId, detail.id));
  const renders = await testDatabase.db
    .select()
    .from(artifactRenderJobs)
    .where(eq(artifactRenderJobs.artifactId, detail.id));
  const [artifact] = await testDatabase.db
    .select()
    .from(artifacts)
    .where(eq(artifacts.id, detail.id));
  expect(bundle).toMatchObject({
    artifactRevisionId: ready.currentRevision.id,
    state: "published",
  });
  expect(renders.map((render) => render.format)).toEqual(["mp4"]);
  expect(artifact).toMatchObject({
    currentRevisionId: ready.currentRevision.id,
    generationRequest: null,
    generationState: "ready",
  });

  const video = await getAnimationRender(
    actor,
    {
      artifactId: detail.id,
      conversationId,
      format: "mp4",
      revisionId: ready.currentRevision.id,
      workspaceId: workspace.id,
    },
    {
      db: testDatabase.db,
      storage: {
        delete: async () => {},
        get: async () => ({ body: objects.mp4, contentType: ANIMATION_MEDIA_TYPES.mp4 }),
        listVersions: async () => [],
        put: async () => ({ versionId: "unused" }),
      },
    },
  );
  expect(video).toMatchObject({
    body: objects.mp4,
    contentType: "video/mp4",
    filename: "Gradient descent.mp4",
  });

  const get = vi.fn(async () => {
    throw new Error("full_object_read_forbidden");
  });
  const getRange = vi.fn(async ({ end, start }: { end: number; start: number }) => ({
    body: objects.mp4.slice(start, end + 1),
    contentType: ANIMATION_MEDIA_TYPES.mp4,
  }));
  const partial = await getAnimationRender(
    actor,
    {
      artifactId: detail.id,
      conversationId,
      format: "mp4",
      range: "bytes=2-5",
      revisionId: ready.currentRevision.id,
      workspaceId: workspace.id,
    },
    {
      db: testDatabase.db,
      storage: {
        delete: async () => {},
        get,
        getRange,
        listVersions: async () => [],
        put: async () => ({ versionId: "unused" }),
      },
    },
  );
  expect(get).not.toHaveBeenCalled();
  expect(getRange).toHaveBeenCalledWith({
    end: 5,
    key: "mp4.bin",
    start: 2,
    versionId: "mp4-v1",
  });
  expect(partial).toMatchObject({
    body: objects.mp4.slice(2, 6),
    range: { end: 5, start: 2 },
    sizeBytes: objects.mp4.byteLength,
  });

  const readerHandle = `animation-reader-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const reader = await ensurePrincipalForAuthUser(readerHandle, readerHandle, testDatabase.db);
  await testDatabase.db.insert(workspacePermissionGrants).values({
    grantedByPrincipalId: actor.principalId,
    permission: "workspace.read",
    principalId: reader.principalId,
    workspaceId: workspace.id,
  });
  const sourceId = randomUUID();
  await testDatabase.db
    .insert(sources)
    .values({ id: sourceId, kind: "artifact", workspaceId: workspace.id });
  await testDatabase.db.insert(artifactSources).values({ artifactId: detail.id, sourceId });
  const sourcePlayback = await getAnimationRender(
    reader,
    {
      artifactId: detail.id,
      conversationId,
      format: "mp4",
      revisionId: ready.currentRevision.id,
      workspaceId: workspace.id,
    },
    {
      allowPublishedSource: true,
      db: testDatabase.db,
      storage: {
        delete: async () => {},
        get: async () => ({ body: objects.mp4, contentType: ANIMATION_MEDIA_TYPES.mp4 }),
        listVersions: async () => [],
        put: async () => ({ versionId: "unused" }),
      },
    },
  );
  expect(sourcePlayback).toMatchObject({ body: objects.mp4 });
  await expect(
    getAnimationRender(
      reader,
      {
        artifactId: detail.id,
        conversationId,
        format: "mp4",
        revisionId: ready.currentRevision.id,
        workspaceId: workspace.id,
      },
      { db: testDatabase.db },
    ),
  ).rejects.toEqual(new AnimationError("animation_not_found"));
});
