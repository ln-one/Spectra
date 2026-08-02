import { createHash, randomUUID } from "node:crypto";
import { createMigratedTestDatabase } from "@tests/database";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import {
  aiRuns,
  artifactRenderJobs,
  artifactRevisions,
  artifactSourceBundles,
  artifactSources,
  artifacts,
  presentationEditorSnapshots,
  retrievalIndexGenerations,
  sources,
  workspacePermissionGrants,
} from "@/database/schema";
import { publishArtifactEditProposal } from "@/features/artifacts/proposal-service.server";
import type { ArtifactRenderStorage } from "@/features/artifacts/render-storage.server";
import { ensurePrincipalForAuthUser } from "@/features/identity/service";
import { createWorkspace } from "@/features/workspaces/service";
import { stageArtifactSourceBundle } from "../source-bundles.server";
import { PresentationError } from "./errors";
import { deterministicPresentationSourceArchive } from "./pipeline.server";
import { acceptPresentationProposal } from "./refine-service.server";
import {
  claimPresentationGeneration,
  completePresentationGeneration,
  failPresentationGeneration,
  getPresentationDetailForConversation,
  getPresentationEditorPptdSource,
  getPresentationEditorProject,
  getPresentationEditorSource,
  getPresentationPptdAssets,
  getPresentationPptdSource,
  getPresentationPptxDownload,
  retryPresentationGeneration,
  savePresentationEditorProject,
  startPresentationGeneration,
  updatePresentationStage,
} from "./service";

let testDatabase: Awaited<ReturnType<typeof createMigratedTestDatabase>>;

beforeAll(async () => {
  testDatabase = await createMigratedTestDatabase();
});

afterAll(async () => {
  await testDatabase.destroy();
});

async function fixture() {
  const suffix = randomUUID().slice(0, 8);
  const actor = await ensurePrincipalForAuthUser(
    `presentation-${suffix}`,
    `presentation-${suffix}`,
    testDatabase.db,
  );
  const workspace = await createWorkspace(actor, { name: "Presentation" }, testDatabase.db);
  const jobs: Array<{ artifactId: string; generationAttemptId: string }> = [];
  const queue = {
    enqueue: async (
      _transaction: unknown,
      job: { artifactId: string; generationAttemptId: string },
    ) => {
      jobs.push(job);
    },
  };
  const input = {
    conversationId: randomUUID(),
    locale: "en-US" as const,
    prompt: "Create a six-slide lesson about gravity",
    requestedTitle: "Gravity",
    sourceUserMessageId: `user:${randomUUID()}`,
    workspaceId: workspace.id,
  };
  const detail = await startPresentationGeneration(actor, input, queue, testDatabase.db);
  if (!detail.generationAttemptId) throw new Error("attempt missing");
  return { actor, detail, input, jobs, queue };
}

async function readyFixture() {
  const base = await fixture();
  const attemptId = base.detail.generationAttemptId as string;
  await claimPresentationGeneration(base.detail.id, attemptId, testDatabase.db);
  await stageArtifactSourceBundle(
    {
      artifactId: base.detail.id,
      generationAttemptId: attemptId,
      manifest: {
        entrypoint: "out/presentation.pptd",
        files: [
          {
            path: "out/presentation.pptd",
            sha256: "a".repeat(64),
            sizeBytes: 12,
          },
        ],
        schemaVersion: 1,
      },
      mediaType: "application/gzip",
      objectKey: "source.tar.gz",
      objectVersionId: "source-v1",
      recipeVersion: "presentation-pptd-v1",
      sha256: "b".repeat(64),
      sizeBytes: 100,
    },
    testDatabase.db,
  );
  await updatePresentationStage(base.detail.id, attemptId, "publishing", testDatabase.db);
  const ready = await completePresentationGeneration(
    {
      actorId: base.actor.principalId,
      artifactId: base.detail.id,
      attemptId,
      content: {
        schemaVersion: 1,
        pageCount: 2,
        pageTitles: ["Gravity", "Practice"],
        summary: "A short lesson",
        title: "Gravity",
      },
    },
    testDatabase.db,
  );
  return { ...base, ready };
}

function editorStorageFixture() {
  const objects = new Map<string, { body: Uint8Array; contentType: string; versionId: string }>();
  let putCount = 0;
  const storage: ArtifactRenderStorage = {
    async delete({ key, versionId }) {
      if (objects.get(key)?.versionId === versionId) objects.delete(key);
    },
    async get({ key, versionId }) {
      const object = objects.get(key);
      if (!object || object.versionId !== versionId) throw new Error("object_missing");
      return { body: object.body, contentType: object.contentType };
    },
    async listVersions({ key }) {
      const object = objects.get(key);
      return object ? [object.versionId] : [];
    },
    async put({ body, contentType, key }) {
      putCount += 1;
      const versionId = `version-${putCount}`;
      objects.set(key, { body, contentType, versionId });
      return { versionId };
    },
  };
  return { objects, putCount: () => putCount, storage };
}

function editorProject(title: string, text: string) {
  return new TextEncoder().encode(
    JSON.stringify({
      height: 562.5,
      slides: [
        {
          elements: [
            {
              contentNode: { content: [{ text, type: "text" }], type: "doc" },
              id: "text-1",
              style: "$title",
              type: "text",
            },
          ],
          id: "slide-1",
        },
      ],
      storage: {},
      templateJSONUrl: null,
      theme: {},
      title,
      type: "pptd",
      width: 1000,
    }),
  );
}

function editorPptdSource(title: string, text: string) {
  return {
    pageMap: {
      "pages/slide-1.page": `pageType: content\nelements:\n  - elementId: text-1\n    elementType: text\n    bounds: [0, 0, 100, 40]\n    content: { style: "$title", text: "${text}" }\n`,
    },
    pptdContent: `title: ${title}\nsize: [1000, 562.5]\npages: [pages/slide-1.page]\n`,
  };
}

test("atomically publishes a Presentation Revision and structured source bundle", async () => {
  const { actor, detail, input, jobs, queue } = await fixture();
  const replay = await startPresentationGeneration(actor, input, queue, testDatabase.db);
  expect(replay.id).toBe(detail.id);
  expect(jobs).toHaveLength(1);
  const attemptId = detail.generationAttemptId as string;
  await claimPresentationGeneration(detail.id, attemptId, testDatabase.db);
  const manifest = {
    entrypoint: "out/presentation.pptd",
    files: [
      {
        path: "out/presentation.pptd",
        sha256: "1".repeat(64),
        sizeBytes: 12,
      },
    ],
    schemaVersion: 1,
  };
  await stageArtifactSourceBundle(
    {
      artifactId: detail.id,
      generationAttemptId: attemptId,
      manifest,
      mediaType: "application/gzip",
      objectKey: "source.tar.gz",
      objectVersionId: "source-v1",
      recipeVersion: "presentation-pptd-v1",
      sha256: "2".repeat(64),
      sizeBytes: 100,
    },
    testDatabase.db,
  );
  await updatePresentationStage(detail.id, attemptId, "publishing", testDatabase.db);
  const ready = await completePresentationGeneration(
    {
      actorId: actor.principalId,
      artifactId: detail.id,
      attemptId,
      content: {
        schemaVersion: 1,
        pageCount: 2,
        pageTitles: ["Gravity", "Practice"],
        summary: "A short lesson",
        title: "Gravity",
      },
    },
    testDatabase.db,
  );
  expect(ready.currentRevision.content.pageCount).toBe(2);
  const [bundle] = await testDatabase.db
    .select()
    .from(artifactSourceBundles)
    .where(eq(artifactSourceBundles.artifactId, detail.id));
  const [render] = await testDatabase.db
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
  expect(render).toBeUndefined();
  expect(artifact).toMatchObject({
    currentRevisionId: ready.currentRevision.id,
    generationRequest: null,
    generationState: "ready",
  });
});

test("loads the PPTD source for the editor from the published source bundle", async () => {
  const { actor, detail, input } = await fixture();
  const attemptId = detail.generationAttemptId as string;
  await claimPresentationGeneration(detail.id, attemptId, testDatabase.db);
  const encode = (value: string) => new TextEncoder().encode(value);
  const pptd = "title: Gravity\npages:\n  - pages/01-cover.page\n";
  const cover = "pageType: cover\nelements: []\n";
  const coverImage = new Uint8Array(
    await sharp({
      create: { background: "#ff0000", channels: 4, height: 1, width: 1 },
    })
      .png()
      .toBuffer(),
  );
  const sourceArchive = await deterministicPresentationSourceArchive([
    { body: encode(pptd), path: "deck/deck.pptd" },
    { body: encode(cover), path: "deck/pages/01-cover.page" },
    { body: coverImage, path: "deck/images/cover.png" },
  ]);
  await stageArtifactSourceBundle(
    {
      artifactId: detail.id,
      generationAttemptId: attemptId,
      manifest: {
        entrypoint: "out/deck/deck.pptd",
        files: [
          {
            path: "out/deck/deck.pptd",
            sha256: createHash("sha256").update(encode(pptd)).digest("hex"),
            sizeBytes: encode(pptd).byteLength,
          },
          {
            path: "out/deck/pages/01-cover.page",
            sha256: createHash("sha256").update(encode(cover)).digest("hex"),
            sizeBytes: encode(cover).byteLength,
          },
          {
            path: "out/deck/images/cover.png",
            sha256: createHash("sha256").update(coverImage).digest("hex"),
            sizeBytes: coverImage.byteLength,
          },
        ],
        schemaVersion: 1,
      },
      mediaType: "application/gzip",
      objectKey: "source.tar.gz",
      objectVersionId: "source-v1",
      recipeVersion: "presentation-pptd-v1",
      sha256: createHash("sha256").update(sourceArchive).digest("hex"),
      sizeBytes: sourceArchive.byteLength,
    },
    testDatabase.db,
  );
  await updatePresentationStage(detail.id, attemptId, "publishing", testDatabase.db);
  const ready = await completePresentationGeneration(
    {
      actorId: actor.principalId,
      artifactId: detail.id,
      attemptId,
      content: {
        schemaVersion: 1,
        pageCount: 1,
        pageTitles: ["Gravity"],
        summary: "A short lesson",
        title: "Gravity",
      },
    },
    testDatabase.db,
  );
  const storage = {
    delete: async () => {},
    get: async () => ({ body: sourceArchive, contentType: "application/gzip" }),
    listVersions: async () => [],
    put: async () => ({ versionId: "unused" }),
  };
  const source = await getPresentationPptdSource(
    actor,
    {
      artifactId: detail.id,
      conversationId: input.conversationId,
      revisionId: ready.currentRevision.id,
      workspaceId: input.workspaceId,
    },
    { db: testDatabase.db, storage },
  );
  expect(source).toEqual({
    pageMap: { "pages/01-cover.page": cover },
    pptdContent: pptd,
  });
  const assets = await getPresentationPptdAssets(
    actor,
    {
      artifactId: detail.id,
      conversationId: input.conversationId,
      paths: ["/images/cover.png", "/images/missing.png"],
      revisionId: ready.currentRevision.id,
      workspaceId: input.workspaceId,
    },
    { db: testDatabase.db, storage },
  );
  expect(assets).toEqual([
    `data:image/png;base64,${Buffer.from(coverImage).toString("base64")}`,
    undefined,
  ]);
  const otherRevision = await getPresentationPptdSource(
    actor,
    {
      artifactId: detail.id,
      conversationId: input.conversationId,
      revisionId: randomUUID(),
      workspaceId: input.workspaceId,
    },
    { db: testDatabase.db, storage },
  );
  expect(otherRevision).toBeNull();
});

test("published Artifact Sources remain view-only and cannot download or edit the private presentation", async () => {
  const { actor, detail, input, ready } = await readyFixture();
  const readerHandle = `presentation-reader-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const reader = await ensurePrincipalForAuthUser(readerHandle, readerHandle, testDatabase.db);
  await testDatabase.db.insert(workspacePermissionGrants).values({
    grantedByPrincipalId: actor.principalId,
    permission: "workspace.read",
    principalId: reader.principalId,
    workspaceId: input.workspaceId,
  });
  const sourceId = randomUUID();
  await testDatabase.db
    .insert(sources)
    .values({ id: sourceId, kind: "artifact", workspaceId: input.workspaceId });
  await testDatabase.db.insert(artifactSources).values({ artifactId: detail.id, sourceId });

  const scope = {
    artifactId: detail.id,
    conversationId: input.conversationId,
    revisionId: ready.currentRevision.id,
    workspaceId: input.workspaceId,
  };
  await expect(getPresentationPptxDownload(reader, scope, { db: testDatabase.db })).rejects.toEqual(
    new PresentationError("presentation_not_found"),
  );
  await expect(getPresentationEditorSource(reader, scope, { db: testDatabase.db })).rejects.toEqual(
    new PresentationError("presentation_not_found"),
  );
});

test("persists the first recovered editor project as a new revision", async () => {
  const { actor, detail, input, ready } = await readyFixture();
  const { putCount, storage } = editorStorageFixture();
  const project = editorProject("Gravity", "Original");
  const materialized = await savePresentationEditorProject(
    actor,
    {
      artifactId: detail.id,
      conversationId: input.conversationId,
      expectedRevisionId: ready.currentRevision.id,
      name: "Gravity",
      project: { body: project, mediaType: "application/json" },
      workspaceId: input.workspaceId,
    },
    { db: testDatabase.db, storage },
  );
  if (materialized.generationState !== "ready") throw new Error("presentation not ready");
  expect(materialized.artifact.currentRevision).toMatchObject({
    content: { pageCount: 1, pageTitles: ["Original"] },
    parentRevisionId: ready.currentRevision.id,
    revisionNumber: ready.currentRevision.revisionNumber + 1,
  });
  const snapshots = await testDatabase.db
    .select()
    .from(presentationEditorSnapshots)
    .where(eq(presentationEditorSnapshots.artifactId, detail.id));
  expect(snapshots).toHaveLength(1);
  expect(putCount()).toBe(1);
  await expect(testDatabase.db.select().from(retrievalIndexGenerations)).resolves.toHaveLength(0);

  const source = await getPresentationEditorSource(
    actor,
    {
      artifactId: detail.id,
      conversationId: input.conversationId,
      revisionId: materialized.artifact.currentRevision.id,
      workspaceId: input.workspaceId,
    },
    { db: testDatabase.db, storage },
  );
  expect(source).toEqual({ kind: "saved-project", title: "Gravity" });
  const restored = await getPresentationEditorProject(
    actor,
    {
      artifactId: detail.id,
      conversationId: input.conversationId,
      revisionId: materialized.artifact.currentRevision.id,
      workspaceId: input.workspaceId,
    },
    { db: testDatabase.db, storage },
  );
  expect(restored).toEqual({ body: project, contentType: "application/json" });

  const lostResponseRetry = await savePresentationEditorProject(
    actor,
    {
      artifactId: detail.id,
      conversationId: input.conversationId,
      expectedRevisionId: ready.currentRevision.id,
      name: "Gravity",
      project: { body: project, mediaType: "application/json" },
      workspaceId: input.workspaceId,
    },
    { db: testDatabase.db, storage },
  );
  if (lostResponseRetry.generationState !== "ready") {
    throw new Error("presentation not ready");
  }
  expect(lostResponseRetry.artifact.currentRevision.id).toBe(
    materialized.artifact.currentRevision.id,
  );
  expect(putCount()).toBe(1);

  const replay = await savePresentationEditorProject(
    actor,
    {
      artifactId: detail.id,
      conversationId: input.conversationId,
      expectedRevisionId: materialized.artifact.currentRevision.id,
      name: "Gravity",
      project: { body: project, mediaType: "application/json" },
      workspaceId: input.workspaceId,
    },
    { db: testDatabase.db, storage },
  );
  if (replay.generationState !== "ready") throw new Error("presentation not ready");
  expect(replay.artifact.currentRevision.id).toBe(materialized.artifact.currentRevision.id);
  expect(putCount()).toBe(1);
});

test("persists and restores the reverse PPTD source alongside the editor project", async () => {
  const { actor, detail, input, ready } = await readyFixture();
  const { putCount, storage } = editorStorageFixture();
  const project = editorProject("Gravity", "Original");
  const source = editorPptdSource("Gravity", "Original");
  const materialized = await savePresentationEditorProject(
    actor,
    {
      artifactId: detail.id,
      conversationId: input.conversationId,
      expectedRevisionId: ready.currentRevision.id,
      name: "Gravity",
      project: { body: project, mediaType: "application/json" },
      source,
      workspaceId: input.workspaceId,
    },
    { db: testDatabase.db, storage },
  );
  if (materialized.generationState !== "ready") throw new Error("presentation not ready");
  expect(materialized.artifact.currentRevision.content).toMatchObject({
    editorSourceSha256: createHash("sha256")
      .update(new TextEncoder().encode(JSON.stringify(source)))
      .digest("hex"),
  });
  expect(putCount()).toBe(2);
  const restored = await getPresentationEditorPptdSource(
    actor,
    {
      artifactId: detail.id,
      conversationId: input.conversationId,
      revisionId: materialized.artifact.currentRevision.id,
      workspaceId: input.workspaceId,
    },
    { db: testDatabase.db, storage },
  );
  expect(restored).toEqual(source);
});

test("stages the saved revision when the presentation is already in Sources", async () => {
  vi.stubEnv("DASHSCOPE_API_KEY", "test-key");
  vi.stubEnv("DASHSCOPE_BASE_URL", "https://dashscope.test/v1");
  vi.stubEnv("KNOWLEDGE_INDEXING_ENABLED", "true");
  const { actor, detail, input, ready } = await readyFixture();
  const sourceId = randomUUID();
  await testDatabase.db
    .insert(sources)
    .values({ id: sourceId, kind: "artifact", workspaceId: input.workspaceId });
  await testDatabase.db.insert(artifactSources).values({ artifactId: detail.id, sourceId });
  const { storage } = editorStorageFixture();

  try {
    const saved = await savePresentationEditorProject(
      actor,
      {
        artifactId: detail.id,
        conversationId: input.conversationId,
        expectedRevisionId: ready.currentRevision.id,
        name: "Gravity",
        project: {
          body: editorProject("Gravity", "Revised source"),
          mediaType: "application/json",
        },
        workspaceId: input.workspaceId,
      },
      { db: testDatabase.db, storage },
    );
    if (saved.generationState !== "ready") throw new Error("presentation not ready");

    const generations = await testDatabase.db
      .select()
      .from(retrievalIndexGenerations)
      .where(eq(retrievalIndexGenerations.sourceId, sourceId));
    expect(generations).toMatchObject([
      {
        artifactRevisionId: saved.artifact.currentRevision.id,
        sourceRevisionId: saved.artifact.currentRevision.id,
        state: "queued",
      },
    ]);
  } finally {
    vi.unstubAllEnvs();
  }
});

test("does not treat a different concurrent save as a lost-response replay", async () => {
  const { actor, detail, input, ready } = await readyFixture();
  const { putCount, storage } = editorStorageFixture();
  const project = editorProject("Gravity", "Original");
  await savePresentationEditorProject(
    actor,
    {
      artifactId: detail.id,
      conversationId: input.conversationId,
      expectedRevisionId: ready.currentRevision.id,
      name: "Gravity",
      project: { body: project, mediaType: "application/json" },
      workspaceId: input.workspaceId,
    },
    { db: testDatabase.db, storage },
  );

  await expect(
    savePresentationEditorProject(
      actor,
      {
        artifactId: detail.id,
        conversationId: input.conversationId,
        expectedRevisionId: ready.currentRevision.id,
        name: "Gravity",
        project: {
          body: editorProject("Gravity", "Different"),
          mediaType: "application/json",
        },
        workspaceId: input.workspaceId,
      },
      { db: testDatabase.db, storage },
    ),
  ).rejects.toMatchObject({ code: "presentation_revision_conflict" });
  await expect(
    savePresentationEditorProject(
      actor,
      {
        artifactId: detail.id,
        conversationId: input.conversationId,
        cover: { body: new Uint8Array([1]), mediaType: "image/png" },
        expectedRevisionId: ready.currentRevision.id,
        name: "Gravity",
        project: { body: project, mediaType: "application/json" },
        workspaceId: input.workspaceId,
      },
      { db: testDatabase.db, storage },
    ),
  ).rejects.toMatchObject({ code: "presentation_revision_conflict" });
  expect(putCount()).toBe(1);
});

test("includes the cover identity in lost-response replay detection", async () => {
  const { actor, detail, input, ready } = await readyFixture();
  const { putCount, storage } = editorStorageFixture();
  const project = editorProject("Gravity", "Original");
  await savePresentationEditorProject(
    actor,
    {
      artifactId: detail.id,
      conversationId: input.conversationId,
      cover: { body: new Uint8Array([1]), mediaType: "image/png" },
      expectedRevisionId: ready.currentRevision.id,
      name: "Gravity",
      project: { body: project, mediaType: "application/json" },
      workspaceId: input.workspaceId,
    },
    { db: testDatabase.db, storage },
  );

  for (const cover of [undefined, { body: new Uint8Array([2]), mediaType: "image/png" as const }]) {
    await expect(
      savePresentationEditorProject(
        actor,
        {
          artifactId: detail.id,
          conversationId: input.conversationId,
          ...(cover ? { cover } : {}),
          expectedRevisionId: ready.currentRevision.id,
          name: "Gravity",
          project: { body: project, mediaType: "application/json" },
          workspaceId: input.workspaceId,
        },
        { db: testDatabase.db, storage },
      ),
    ).rejects.toMatchObject({ code: "presentation_revision_conflict" });
  }
  expect(putCount()).toBe(2);
});

test("appends an editor revision and restores its exact saved project", async () => {
  const { actor, detail, input, ready } = await readyFixture();
  const { storage } = editorStorageFixture();
  const initialized = await savePresentationEditorProject(
    actor,
    {
      artifactId: detail.id,
      conversationId: input.conversationId,
      expectedRevisionId: ready.currentRevision.id,
      name: "Gravity",
      project: {
        body: editorProject("Gravity", "Original"),
        mediaType: "application/json",
      },
      workspaceId: input.workspaceId,
    },
    { db: testDatabase.db, storage },
  );
  if (initialized.generationState !== "ready") throw new Error("presentation not ready");
  const editedProject = editorProject("Gravity revised", "Edited");
  const edited = await savePresentationEditorProject(
    actor,
    {
      artifactId: detail.id,
      conversationId: input.conversationId,
      expectedRevisionId: initialized.artifact.currentRevision.id,
      name: "Gravity revised",
      project: { body: editedProject, mediaType: "application/json" },
      workspaceId: input.workspaceId,
    },
    { db: testDatabase.db, storage },
  );
  if (edited.generationState !== "ready") throw new Error("presentation not ready");
  expect(edited.artifact.currentRevision).toMatchObject({
    content: {
      editorProjectSha256: createHash("sha256").update(editedProject).digest("hex"),
      hasPptxRender: false,
      pageCount: 1,
      pageTitles: ["Edited"],
      title: "Gravity revised",
    },
    parentRevisionId: initialized.artifact.currentRevision.id,
    revisionNumber: initialized.artifact.currentRevision.revisionNumber + 1,
  });
  const revisions = await testDatabase.db
    .select()
    .from(artifactRevisions)
    .where(eq(artifactRevisions.artifactId, detail.id));
  expect(revisions).toHaveLength(3);
  const restored = await getPresentationEditorProject(
    actor,
    {
      artifactId: detail.id,
      conversationId: input.conversationId,
      revisionId: edited.artifact.currentRevision.id,
      workspaceId: input.workspaceId,
    },
    { db: testDatabase.db, storage },
  );
  expect(restored?.body).toEqual(editedProject);
  const download = await getPresentationPptxDownload(
    actor,
    {
      artifactId: detail.id,
      conversationId: input.conversationId,
      revisionId: edited.artifact.currentRevision.id,
      workspaceId: input.workspaceId,
    },
    { db: testDatabase.db, storage },
  );
  expect(download).toBeNull();
});

test("rejects invalid recovered editor projects before object upload", async () => {
  const { actor, detail, input, ready } = await readyFixture();
  const { putCount, storage } = editorStorageFixture();
  await expect(
    savePresentationEditorProject(
      actor,
      {
        artifactId: detail.id,
        conversationId: input.conversationId,
        expectedRevisionId: ready.currentRevision.id,
        name: "Gravity",
        project: {
          body: new TextEncoder().encode('{"title":"Gravity","slides":[]}'),
          mediaType: "application/json",
        },
        workspaceId: input.workspaceId,
      },
      { db: testDatabase.db, storage },
    ),
  ).rejects.toMatchObject({ code: "presentation_editor_project_invalid" });
  expect(putCount()).toBe(0);
});

test("rejects editor persistence by a non-owner before object upload", async () => {
  const { detail, input, ready } = await readyFixture();
  const suffix = randomUUID().slice(0, 8);
  const other = await ensurePrincipalForAuthUser(
    `presentation-reader-${suffix}`,
    `presentation-reader-${suffix}`,
    testDatabase.db,
  );
  const { putCount, storage } = editorStorageFixture();
  await expect(
    savePresentationEditorProject(
      other,
      {
        artifactId: detail.id,
        conversationId: input.conversationId,
        expectedRevisionId: ready.currentRevision.id,
        name: "Gravity",
        project: {
          body: editorProject("Gravity", "Unauthorized"),
          mediaType: "application/json",
        },
        workspaceId: input.workspaceId,
      },
      { db: testDatabase.db, storage },
    ),
  ).rejects.toBeInstanceOf(Error);
  expect(putCount()).toBe(0);
});

test("retries a failed Presentation with a new task-agent attempt", async () => {
  const { actor, detail, queue, input } = await fixture();
  const firstAttemptId = detail.generationAttemptId as string;
  await claimPresentationGeneration(detail.id, firstAttemptId, testDatabase.db);
  await failPresentationGeneration(
    detail.id,
    "presentation_remote_error",
    firstAttemptId,
    testDatabase.db,
  );
  const retried = await retryPresentationGeneration(
    actor,
    {
      artifactId: detail.id,
      conversationId: input.conversationId,
      workspaceId: input.workspaceId,
    },
    queue,
    testDatabase.db,
    true,
  );
  expect(retried.generationState).toBe("queued");
  expect(retried.generationAttemptId).not.toBe(firstAttemptId);
});

test("does not enqueue a retry while the OpenHands runtime is unavailable", async () => {
  const { actor, detail, queue, input } = await fixture();
  await expect(
    retryPresentationGeneration(
      actor,
      {
        artifactId: detail.id,
        conversationId: input.conversationId,
        workspaceId: input.workspaceId,
      },
      queue,
      testDatabase.db,
      false,
    ),
  ).rejects.toMatchObject({ code: "presentation_runtime_unavailable" });
});

test("rejects a conflicting source object identity for the same attempt", async () => {
  const { detail } = await fixture();
  const attemptId = detail.generationAttemptId as string;
  const source = {
    artifactId: detail.id,
    generationAttemptId: attemptId,
    manifest: {
      entrypoint: "out/presentation.pptd",
      files: [{ path: "out/presentation.pptd", sha256: "4".repeat(64), sizeBytes: 12 }],
      schemaVersion: 1,
    },
    mediaType: "application/gzip" as const,
    objectKey: "source.tar.gz",
    objectVersionId: "source-v1",
    recipeVersion: "presentation-pptd-v1",
    sha256: "5".repeat(64),
    sizeBytes: 100,
  };
  await stageArtifactSourceBundle(source, testDatabase.db);
  await expect(
    stageArtifactSourceBundle(
      { ...source, objectVersionId: "source-v2", sha256: "6".repeat(64) },
      testDatabase.db,
    ),
  ).rejects.toThrow("artifact_source_bundle_conflict");
  await expect(
    stageArtifactSourceBundle(
      {
        ...source,
        manifest: {
          ...source.manifest,
          entrypoint: "out/other.pptd",
        },
      },
      testDatabase.db,
    ),
  ).rejects.toThrow("artifact_source_bundle_conflict");
});

test("rejects a source bundle whose attempt belongs to another Artifact", async () => {
  const first = await fixture();
  const second = await fixture();
  await expect(
    stageArtifactSourceBundle(
      {
        artifactId: first.detail.id,
        generationAttemptId: second.detail.generationAttemptId as string,
        manifest: {
          entrypoint: "out/presentation.pptd",
          files: [{ path: "out/presentation.pptd", sha256: "7".repeat(64), sizeBytes: 12 }],
          schemaVersion: 1,
        },
        mediaType: "application/gzip",
        objectKey: "cross-artifact.tar.gz",
        objectVersionId: "source-v1",
        recipeVersion: "presentation-pptd-v1",
        sha256: "8".repeat(64),
        sizeBytes: 100,
      },
      testDatabase.db,
    ),
  ).rejects.toThrow();
});

test("stages and replays a refinement source bundle by producing run", async () => {
  const { detail, input } = await fixture();
  const runId = randomUUID();
  await testDatabase.db.insert(aiRuns).values({
    id: runId,
    budget: {},
    budgetUsage: {},
    clientRequestId: randomUUID(),
    conversationId: input.conversationId,
    deadlineAt: new Date(Date.now() + 60_000),
    inputMessageId: `refine:${runId}`,
    operation: "artifact",
    requestHash: "a".repeat(64),
    workspaceId: input.workspaceId,
  });
  const source = {
    artifactId: detail.id,
    manifest: {
      entrypoint: "out/presentation.pptd",
      files: [{ path: "out/presentation.pptd", sha256: "b".repeat(64), sizeBytes: 12 }],
      schemaVersion: 1,
    },
    mediaType: "application/gzip" as const,
    objectKey: `refine/${runId}.tar.gz`,
    objectVersionId: "source-v1",
    producingRunId: runId,
    recipeVersion: "presentation-pptd-v1",
    sha256: "c".repeat(64),
    sizeBytes: 100,
  };

  const first = await stageArtifactSourceBundle(source, testDatabase.db);
  const replay = await stageArtifactSourceBundle(source, testDatabase.db);
  expect(replay.id).toBe(first.id);
  expect(replay.generationAttemptId).toBeNull();
  expect(replay.producingRunId).toBe(runId);
});

test("accepts a presentation proposal once and replays the accepted revision", async () => {
  const { actor, detail, input, ready } = await readyFixture();
  const { storage } = editorStorageFixture();
  const runId = randomUUID();
  await testDatabase.db.insert(aiRuns).values({
    id: runId,
    budget: {},
    budgetUsage: {},
    clientRequestId: randomUUID(),
    conversationId: input.conversationId,
    deadlineAt: new Date(Date.now() + 60_000),
    inputMessageId: `refine:${runId}`,
    operation: "artifact",
    requestHash: "d".repeat(64),
    workspaceId: input.workspaceId,
  });
  const sourceFiles = [
    {
      body: new TextEncoder().encode("title: Refined\npages:\n  - pages/slide-1.page\n"),
      path: "deck.pptd",
    },
    {
      body: new TextEncoder().encode("pageType: cover\nelements: []\n"),
      path: "pages/slide-1.page",
    },
  ];
  const sourceArchive = await deterministicPresentationSourceArchive(sourceFiles);
  const stored = await storage.put({
    body: sourceArchive,
    contentType: "application/gzip",
    key: `refine/${runId}.tar.gz`,
  });
  const bundle = await stageArtifactSourceBundle(
    {
      artifactId: detail.id,
      manifest: {
        entrypoint: "out/deck.pptd",
        files: sourceFiles.map((file) => ({
          path: `out/${file.path}`,
          sha256: createHash("sha256").update(file.body).digest("hex"),
          sizeBytes: file.body.byteLength,
        })),
        schemaVersion: 1,
      },
      mediaType: "application/gzip",
      objectKey: `refine/${runId}.tar.gz`,
      objectVersionId: stored.versionId,
      producingRunId: runId,
      recipeVersion: "presentation-pptd-v1",
      sha256: createHash("sha256").update(sourceArchive).digest("hex"),
      sizeBytes: sourceArchive.byteLength,
    },
    testDatabase.db,
  );
  const proposal = {
    artifactId: detail.id,
    baseRevisionId: ready.currentRevision.id,
    candidateSourceBundleId: bundle.id,
    changedSlidePaths: ["out/pages/slide-1.page"],
    focus: [{ index: 0, path: "slide-1" }],
    kind: "presentation" as const,
    request: "Refine the opening slide.",
    runId,
    summary: "Opening slide refined",
    title: "Refined",
  };
  await publishArtifactEditProposal(
    actor,
    {
      artifactId: detail.id,
      conversationId: input.conversationId,
      groundingReceipt: { operationEvidence: [], version: 1 },
      proposal,
      workspaceId: input.workspaceId,
    },
    testDatabase.db,
  );

  const acceptanceInput = {
    artifactId: detail.id,
    conversationId: input.conversationId,
    expectedRevisionId: ready.currentRevision.id,
    runId,
    workspaceId: input.workspaceId,
  };
  const accepted = await acceptPresentationProposal(actor, acceptanceInput, {
    db: testDatabase.db,
    storage,
  });
  const refreshed = await getPresentationDetailForConversation(
    actor,
    {
      artifactId: detail.id,
      conversationId: input.conversationId,
      workspaceId: input.workspaceId,
    },
    testDatabase.db,
  );
  if (!refreshed.artifact) throw new Error("presentation_not_ready_after_accept");
  expect(refreshed.artifact.currentRevision.content).toMatchObject({
    pageCount: 1,
    title: "Refined",
  });
  const replay = await acceptPresentationProposal(actor, acceptanceInput, {
    db: testDatabase.db,
    storage,
  });
  expect(replay.acceptedRevisionId).toBe(accepted.acceptedRevisionId);
});
