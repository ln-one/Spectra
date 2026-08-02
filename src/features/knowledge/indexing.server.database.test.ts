import { createMigratedTestDatabase } from "@tests/database";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  artifactRevisions,
  artifactSources,
  artifacts,
  fileSources,
  principals,
  retrievalChunks,
  retrievalEvidenceUnits,
  retrievalIndexGenerations,
  retrievalRepresentationBlocks,
  sourceIngestions,
  sources,
  workspacePermissionGrants,
  workspaces,
} from "@/database/schema";
import type { ArtifactSourceKind } from "@/features/artifacts/types";
import { addWorkspaceReference } from "@/features/sources/service";
import type { SourceStorage } from "@/features/sources/storage";
import { createKnowledgeSourceCleanupOperations } from "./cleanup.server";
import type { KnowledgeIndexPort } from "./index-writer";
import {
  buildKnowledgeIndexGeneration,
  collectObsoleteKnowledgeIndexGenerations,
  createKnowledgeIndexGeneration,
  stageArtifactKnowledgeIndexGeneration,
} from "./indexing.server";
import { createKnowledgeStore } from "./store.server";

let testDatabase: Awaited<ReturnType<typeof createMigratedTestDatabase>>;

beforeAll(async () => {
  testDatabase = await createMigratedTestDatabase();
});

afterAll(async () => {
  await testDatabase.destroy();
});

async function readyIngestion(
  existingPrincipal?: typeof principals.$inferSelect,
  workspaceName = "Knowledge",
) {
  const [createdPrincipal] = existingPrincipal
    ? [existingPrincipal]
    : await testDatabase.db
        .insert(principals)
        .values({ authUserId: crypto.randomUUID(), handle: `u-${crypto.randomUUID()}` })
        .returning();
  const principal = createdPrincipal;
  if (!principal) throw new Error("principal fixture failed");
  const [workspace] = await testDatabase.db
    .insert(workspaces)
    .values({ ownerId: principal.id, name: workspaceName, referenceable: true })
    .returning();
  if (!workspace) throw new Error("workspace fixture failed");
  const [source] = await testDatabase.db
    .insert(sources)
    .values({ workspaceId: workspace.id, kind: "uploaded_file" })
    .returning();
  if (!source) throw new Error("source fixture failed");
  await testDatabase.db.insert(fileSources).values({
    sourceId: source.id,
    originalFilename: "fixture.md",
    sizeBytes: 1,
    state: "stored",
    storageKey: `sources/${source.id}.md`,
    storageVersionId: "v1",
  });
  const body = new TextEncoder().encode(
    JSON.stringify({
      schemaVersion: 1,
      kind: "text",
      format: "md",
      content: "# H\n\nSentence one. Sentence two.",
    }),
  );
  const now = new Date();
  const [ingestion] = await testDatabase.db
    .insert(sourceIngestions)
    .values({
      sourceId: source.id,
      sourceRevision: 1,
      provider: "native_text",
      state: "ready",
      resultStorageKey: `results/${source.id}.json`,
      resultStorageVersionId: "v1",
      resultSha256: "a".repeat(64),
      resultSizeBytes: body.byteLength,
      startedAt: now,
      finishedAt: now,
    })
    .returning();
  if (!ingestion) throw new Error("ingestion fixture failed");
  return { principal, workspace, source, ingestion, body };
}

function storageReturning(body: Uint8Array): SourceStorage {
  const unsupported = async () => {
    throw new Error("unsupported test storage operation");
  };
  return {
    createUploadUrl: unsupported,
    createDownloadUrl: unsupported,
    headObject: unsupported,
    readObjectRange: async () => body,
    copyObjectConditionally: unsupported,
    downloadObjectToFile: unsupported,
    putObject: unsupported,
    deleteObjectVersion: unsupported,
  };
}

async function teachingDocumentSourceFixture() {
  const { principal, workspace } = await readyIngestion(undefined, "Artifact Knowledge");
  const conversationId = crypto.randomUUID();
  const [artifact] = await testDatabase.db
    .insert(artifacts)
    .values({
      workspaceId: workspace.id,
      conversationId,
      createdByPrincipalId: principal.id,
      kind: "teaching_document",
      title: "Artifact handbook",
      generationState: "ready",
    })
    .returning();
  if (!artifact) throw new Error("artifact fixture failed");
  const content = {
    document: {
      content: [
        {
          attrs: { id: "heading", level: 2 },
          content: [{ text: "Artifact section", type: "text" as const }],
          type: "heading" as const,
        },
        {
          attrs: { id: "paragraph" },
          content: [{ text: "Artifact knowledge body.", type: "text" as const }],
          type: "paragraph" as const,
        },
      ],
      type: "doc" as const,
    },
    generation: { outcome: "complete" as const, rawOutput: "Artifact handbook", warnings: [] },
    schemaVersion: 2 as const,
    sourceMarkdown: "## Artifact section\n\nArtifact knowledge body.",
    title: "Artifact handbook",
  };
  const [revision] = await testDatabase.db
    .insert(artifactRevisions)
    .values({
      artifactId: artifact.id,
      createdByPrincipalId: principal.id,
      revisionNumber: 1,
      content,
      contentSha256: "d".repeat(64),
    })
    .returning();
  if (!revision) throw new Error("artifact revision fixture failed");
  await testDatabase.db
    .update(artifacts)
    .set({ currentRevisionId: revision.id })
    .where(eq(artifacts.id, artifact.id));
  const [source] = await testDatabase.db
    .insert(sources)
    .values({ workspaceId: workspace.id, kind: "artifact" })
    .returning();
  if (!source) throw new Error("artifact Source fixture failed");
  await testDatabase.db
    .insert(artifactSources)
    .values({ sourceId: source.id, artifactId: artifact.id });
  return { artifact, content, conversationId, principal, revision, source, workspace };
}

async function structuredArtifactSourceFixture(
  kind: Exclude<ArtifactSourceKind, "teaching_document">,
) {
  const { principal, workspace } = await readyIngestion(undefined, `${kind} Knowledge`);
  const title = kind === "mind_map" ? "Bayesian map" : "Bayesian quiz";
  const content =
    kind === "mind_map"
      ? {
          nodes: [
            { id: "root", label: "Bayes", order: 0, parentId: null },
            {
              id: "child",
              label: "Naive Bayes",
              note: "Conditional independence",
              order: 0,
              parentId: "root",
            },
          ],
          rootId: "root",
          generation: { outcome: "complete", rawOutput: "{}", warnings: [] },
          schemaVersion: 2,
        }
      : {
          descriptionMarkdown: "",
          questions: [
            {
              correctAnswer: true,
              difficulty: "easy",
              explanationMarkdown: "Bayes updates prior beliefs.",
              points: 1,
              promptMarkdown: "Does evidence update a prior?",
              questionId: crypto.randomUUID(),
              type: "true_false",
            },
          ],
          schemaVersion: 1,
          settings: { feedbackMode: "after_submission", navigationMode: "free" },
          title,
        };
  const [artifact] = await testDatabase.db
    .insert(artifacts)
    .values({
      workspaceId: workspace.id,
      conversationId: crypto.randomUUID(),
      createdByPrincipalId: principal.id,
      kind,
      title,
      generationState: "ready",
    })
    .returning();
  if (!artifact) throw new Error("structured artifact fixture failed");
  const [revision] = await testDatabase.db
    .insert(artifactRevisions)
    .values({
      artifactId: artifact.id,
      createdByPrincipalId: principal.id,
      revisionNumber: 1,
      content,
      contentSha256: kind === "mind_map" ? "f".repeat(64) : "9".repeat(64),
    })
    .returning();
  if (!revision) throw new Error("structured revision fixture failed");
  await testDatabase.db
    .update(artifacts)
    .set({ currentRevisionId: revision.id })
    .where(eq(artifacts.id, artifact.id));
  const [source] = await testDatabase.db
    .insert(sources)
    .values({ workspaceId: workspace.id, kind: "artifact" })
    .returning();
  if (!source) throw new Error("structured Source fixture failed");
  await testDatabase.db
    .insert(artifactSources)
    .values({ sourceId: source.id, artifactId: artifact.id });
  return { principal, workspace, artifact, revision, source };
}

describe("knowledge indexing", () => {
  it("indexes teaching document Markdown without an upload and exposes its title", async () => {
    const fixture = await teachingDocumentSourceFixture();
    const base = {
      collection: "knowledge-test",
      embeddingModel: "embedding-test",
      embeddingDimension: 2,
      now: () => new Date(),
    };
    const generation = await testDatabase.db.transaction((transaction) =>
      stageArtifactKnowledgeIndexGeneration(
        transaction,
        { artifactRevisionId: fixture.revision.id, sourceId: fixture.source.id },
        base,
      ),
    );
    if (!generation) throw new Error("artifact generation fixture failed");
    await expect(
      buildKnowledgeIndexGeneration(generation.generationId, {
        ...base,
        db: testDatabase.db,
        storage: storageReturning(new Uint8Array()),
        embedding: { embed: async (texts) => texts.map(() => [1, 0]) },
        index: {
          ensureCollection: async () => undefined,
          stage: async () => undefined,
          publish: async () => undefined,
          removeGeneration: async () => undefined,
        },
      }),
    ).resolves.toEqual({ status: "completed" });
    const store = createKnowledgeStore(testDatabase.db);
    const snapshot = await store.authorizeAndSnapshot(
      { principalId: fixture.principal.id, handle: fixture.principal.handle },
      fixture.workspace.id,
    );
    const [chunk] = await testDatabase.db
      .select({ id: retrievalChunks.id })
      .from(retrievalChunks)
      .where(eq(retrievalChunks.indexGenerationId, generation.generationId))
      .limit(1);
    if (!chunk) throw new Error("artifact chunk fixture failed");
    const materials = await store.loadMaterials({
      chunkIds: [chunk.id],
      generationIds: snapshot.generationIds,
      rootWorkspaceId: fixture.workspace.id,
    });
    expect(materials.get(chunk.id)?.sourceName).toBe("Artifact handbook");
  });

  it.each([
    "mind_map",
    "quiz",
  ] as const)("indexes %s knowledge directly from its current revision", async (kind) => {
    const fixture = await structuredArtifactSourceFixture(kind);
    const base = {
      collection: "knowledge-test",
      embeddingModel: "embedding-test",
      embeddingDimension: 2,
      now: () => new Date(),
    };
    const generation = await testDatabase.db.transaction((transaction) =>
      stageArtifactKnowledgeIndexGeneration(
        transaction,
        { artifactRevisionId: fixture.revision.id, sourceId: fixture.source.id },
        base,
      ),
    );
    if (!generation) throw new Error("structured generation fixture failed");
    await buildKnowledgeIndexGeneration(generation.generationId, {
      ...base,
      db: testDatabase.db,
      storage: storageReturning(new Uint8Array()),
      embedding: { embed: async (texts) => texts.map(() => [1, 0]) },
      index: {
        ensureCollection: async () => undefined,
        stage: async () => undefined,
        publish: async () => undefined,
        removeGeneration: async () => undefined,
      },
    });
    const excerpts = await testDatabase.db
      .select({ exactExcerpt: retrievalEvidenceUnits.exactExcerpt })
      .from(retrievalEvidenceUnits)
      .where(eq(retrievalEvidenceUnits.indexGenerationId, generation.generationId));
    const joined = excerpts.map((item) => item.exactExcerpt).join("\n");

    expect(joined).toContain(
      kind === "mind_map" ? "Conditional independence" : "Does evidence update a prior?",
    );
    expect(joined).toContain(
      kind === "mind_map" ? "Bayes > Naive Bayes" : "Bayes updates prior beliefs.",
    );
  });

  it("stages the same revision again after it moves to a new Source membership", async () => {
    const fixture = await teachingDocumentSourceFixture();
    const base = {
      collection: "knowledge-test",
      embeddingModel: "embedding-test",
      embeddingDimension: 2,
      now: () => new Date(),
    };
    const first = await testDatabase.db.transaction((transaction) =>
      stageArtifactKnowledgeIndexGeneration(
        transaction,
        { artifactRevisionId: fixture.revision.id, sourceId: fixture.source.id },
        base,
      ),
    );
    if (!first) throw new Error("first artifact generation fixture failed");

    await testDatabase.db
      .delete(artifactSources)
      .where(eq(artifactSources.sourceId, fixture.source.id));
    await testDatabase.db
      .update(sources)
      .set({ deletedAt: new Date() })
      .where(eq(sources.id, fixture.source.id));
    const [nextSource] = await testDatabase.db
      .insert(sources)
      .values({ workspaceId: fixture.workspace.id, kind: "artifact" })
      .returning();
    if (!nextSource) throw new Error("replacement artifact Source fixture failed");
    await testDatabase.db
      .insert(artifactSources)
      .values({ sourceId: nextSource.id, artifactId: fixture.artifact.id });

    const second = await testDatabase.db.transaction((transaction) =>
      stageArtifactKnowledgeIndexGeneration(
        transaction,
        { artifactRevisionId: fixture.revision.id, sourceId: nextSource.id },
        base,
      ),
    );
    expect(second?.generationId).not.toBe(first.generationId);
  });

  it("does not publish a stale teaching document revision", async () => {
    const fixture = await teachingDocumentSourceFixture();
    const base = {
      collection: "knowledge-test",
      embeddingModel: "embedding-test",
      embeddingDimension: 2,
      now: () => new Date(),
    };
    const generation = await testDatabase.db.transaction((transaction) =>
      stageArtifactKnowledgeIndexGeneration(
        transaction,
        { artifactRevisionId: fixture.revision.id, sourceId: fixture.source.id },
        base,
      ),
    );
    if (!generation) throw new Error("artifact generation fixture failed");
    const [newRevision] = await testDatabase.db
      .insert(artifactRevisions)
      .values({
        artifactId: fixture.artifact.id,
        parentRevisionId: fixture.revision.id,
        createdByPrincipalId: fixture.principal.id,
        revisionNumber: 2,
        content: fixture.content,
        contentSha256: "e".repeat(64),
      })
      .returning();
    if (!newRevision) throw new Error("new revision fixture failed");
    await testDatabase.db
      .update(artifacts)
      .set({ currentRevisionId: newRevision.id })
      .where(eq(artifacts.id, fixture.artifact.id));
    const publish = vi.fn(async () => undefined);
    await buildKnowledgeIndexGeneration(generation.generationId, {
      ...base,
      db: testDatabase.db,
      storage: storageReturning(new Uint8Array()),
      embedding: { embed: async (texts) => texts.map(() => [1, 0]) },
      index: {
        ensureCollection: async () => undefined,
        stage: async () => undefined,
        publish,
        removeGeneration: async () => undefined,
      },
    });
    expect(publish).not.toHaveBeenCalled();
    const [stored] = await testDatabase.db
      .select({ state: retrievalIndexGenerations.state })
      .from(retrievalIndexGenerations)
      .where(eq(retrievalIndexGenerations.id, generation.generationId));
    expect(stored?.state).toBe("obsolete");
  });

  it("snapshots only ready Knowledge generations and keeps authorization failures hard", async () => {
    const fixture = await readyIngestion();
    const base = {
      db: testDatabase.db,
      collection: "knowledge-test",
      embeddingModel: "embedding-test",
      embeddingDimension: 2,
      now: () => new Date(),
    };
    const generation = await createKnowledgeIndexGeneration(fixture.ingestion.id, base);
    if (!generation) throw new Error("generation fixture failed");
    await buildKnowledgeIndexGeneration(generation.generationId, {
      ...base,
      storage: storageReturning(fixture.body),
      embedding: { embed: async (texts) => texts.map(() => [1, 0]) },
      index: {
        ensureCollection: async () => undefined,
        stage: async () => undefined,
        publish: async () => undefined,
        removeGeneration: async () => undefined,
      },
    });

    const [unindexedSource] = await testDatabase.db
      .insert(sources)
      .values({ workspaceId: fixture.workspace.id, kind: "uploaded_file" })
      .returning();
    if (!unindexedSource) throw new Error("unindexed source fixture failed");
    await testDatabase.db.insert(fileSources).values({
      sourceId: unindexedSource.id,
      originalFilename: "historical.md",
      sizeBytes: 1,
      state: "stored",
      storageKey: `sources/${unindexedSource.id}.md`,
      storageVersionId: "v1",
    });
    await testDatabase.db.insert(sourceIngestions).values({
      sourceId: unindexedSource.id,
      sourceRevision: 1,
      provider: "native_text",
      state: "ready",
      resultStorageKey: `results/${unindexedSource.id}.json`,
      resultStorageVersionId: "v1",
      resultSha256: "b".repeat(64),
      resultSizeBytes: 1,
      startedAt: new Date(),
      finishedAt: new Date(),
    });

    const store = createKnowledgeStore(testDatabase.db);
    await expect(
      store.authorizeAndSnapshot(
        { principalId: fixture.principal.id, handle: fixture.principal.handle },
        fixture.workspace.id,
      ),
    ).resolves.toEqual({
      collection: "knowledge-test",
      generationIds: [generation.generationId],
      manifestHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      referenceSourceIds: [],
      rootWorkspaceId: fixture.workspace.id,
      workspaceIds: [fixture.workspace.id],
    });
    await expect(
      store.authorizeAndSnapshot(
        { principalId: crypto.randomUUID(), handle: "not-the-owner" },
        fixture.workspace.id,
      ),
    ).rejects.toThrow("knowledge_workspace_not_found");
  });

  it("reports unavailable when a workspace has no ready Knowledge generation", async () => {
    const fixture = await readyIngestion();
    await expect(
      createKnowledgeStore(testDatabase.db).authorizeAndSnapshot(
        { principalId: fixture.principal.id, handle: fixture.principal.handle },
        fixture.workspace.id,
      ),
    ).rejects.toThrow("knowledge_index_not_ready");
  });

  it("snapshots ready generations across the reachable Workspace network", async () => {
    const fixture = await readyIngestion();
    const actor = { principalId: fixture.principal.id, handle: fixture.principal.handle };
    const [rootWorkspace] = await testDatabase.db
      .insert(workspaces)
      .values({ ownerId: fixture.principal.id, name: "Root Workspace" })
      .returning();
    if (!rootWorkspace) throw new Error("root Workspace fixture failed");
    const reference = await addWorkspaceReference(actor, rootWorkspace.id, fixture.workspace.id, {
      db: testDatabase.db,
    });
    const base = {
      db: testDatabase.db,
      collection: "knowledge-test",
      embeddingModel: "embedding-test",
      embeddingDimension: 2,
      now: () => new Date(),
    };
    const generation = await createKnowledgeIndexGeneration(fixture.ingestion.id, base);
    if (!generation) throw new Error("generation fixture failed");
    await buildKnowledgeIndexGeneration(generation.generationId, {
      ...base,
      storage: storageReturning(fixture.body),
      embedding: { embed: async (texts) => texts.map(() => [1, 0]) },
      index: {
        ensureCollection: async () => undefined,
        stage: async () => undefined,
        publish: async () => undefined,
        removeGeneration: async () => undefined,
      },
    });

    const store = createKnowledgeStore(testDatabase.db);
    await expect(store.authorizeAndSnapshot(actor, rootWorkspace.id)).resolves.toEqual({
      collection: "knowledge-test",
      generationIds: [generation.generationId],
      manifestHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      referenceSourceIds: [reference.id],
      rootWorkspaceId: rootWorkspace.id,
      workspaceIds: [rootWorkspace.id, fixture.workspace.id].sort(),
    });
    const chunks = await testDatabase.db
      .select()
      .from(retrievalChunks)
      .where(eq(retrievalChunks.indexGenerationId, generation.generationId));
    const materials = await store.loadMaterials({
      chunkIds: chunks.map((chunk) => chunk.id),
      generationIds: [generation.generationId],
      rootWorkspaceId: rootWorkspace.id,
    });
    expect([...materials.values()]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workspaceId: fixture.workspace.id,
          workspaceName: "Knowledge",
          workspaceRelation: "referenced",
        }),
      ]),
    );
  });

  it("excludes a referenced Workspace immediately after read access is revoked", async () => {
    const target = await readyIngestion();
    const [rootOwner] = await testDatabase.db
      .insert(principals)
      .values({ authUserId: crypto.randomUUID(), handle: `u-${crypto.randomUUID()}` })
      .returning();
    if (!rootOwner) throw new Error("root owner fixture failed");
    const [rootWorkspace] = await testDatabase.db
      .insert(workspaces)
      .values({ ownerId: rootOwner.id, name: "Root Workspace" })
      .returning();
    if (!rootWorkspace) throw new Error("root Workspace fixture failed");
    const actor = { principalId: rootOwner.id, handle: rootOwner.handle };
    await testDatabase.db.insert(workspacePermissionGrants).values({
      workspaceId: target.workspace.id,
      principalId: rootOwner.id,
      permission: "workspace.read",
      grantedByPrincipalId: target.principal.id,
    });
    await addWorkspaceReference(actor, rootWorkspace.id, target.workspace.id, {
      db: testDatabase.db,
    });
    const generation = await createKnowledgeIndexGeneration(target.ingestion.id, {
      db: testDatabase.db,
      collection: "knowledge-test",
      embeddingModel: "embedding-test",
      embeddingDimension: 2,
      now: () => new Date(),
    });
    if (!generation) throw new Error("generation fixture failed");
    await buildKnowledgeIndexGeneration(generation.generationId, {
      db: testDatabase.db,
      collection: "knowledge-test",
      embeddingModel: "embedding-test",
      embeddingDimension: 2,
      now: () => new Date(),
      storage: storageReturning(target.body),
      embedding: { embed: async (texts) => texts.map(() => [1, 0]) },
      index: {
        ensureCollection: async () => undefined,
        stage: async () => undefined,
        publish: async () => undefined,
        removeGeneration: async () => undefined,
      },
    });
    await testDatabase.db
      .delete(workspacePermissionGrants)
      .where(
        and(
          eq(workspacePermissionGrants.workspaceId, target.workspace.id),
          eq(workspacePermissionGrants.principalId, rootOwner.id),
        ),
      );

    await expect(
      createKnowledgeStore(testDatabase.db).authorizeAndSnapshot(actor, rootWorkspace.id),
    ).rejects.toThrow("knowledge_index_not_ready");
  });

  it("fails closed when reachable Workspaces expose incompatible index manifests", async () => {
    const first = await readyIngestion();
    const second = await readyIngestion(first.principal, "Different Knowledge");
    const actor = { principalId: first.principal.id, handle: first.principal.handle };
    const [rootWorkspace] = await testDatabase.db
      .insert(workspaces)
      .values({ ownerId: first.principal.id, name: "Root Workspace" })
      .returning();
    if (!rootWorkspace) throw new Error("root Workspace fixture failed");
    await addWorkspaceReference(actor, rootWorkspace.id, first.workspace.id, {
      db: testDatabase.db,
    });
    await addWorkspaceReference(actor, rootWorkspace.id, second.workspace.id, {
      db: testDatabase.db,
    });
    const firstGeneration = await createKnowledgeIndexGeneration(first.ingestion.id, {
      db: testDatabase.db,
      collection: "knowledge-test",
      embeddingModel: "embedding-a",
      embeddingDimension: 2,
      now: () => new Date(),
    });
    const secondGeneration = await createKnowledgeIndexGeneration(second.ingestion.id, {
      db: testDatabase.db,
      collection: "knowledge-test",
      embeddingModel: "embedding-b",
      embeddingDimension: 2,
      now: () => new Date(),
    });
    if (!firstGeneration || !secondGeneration) throw new Error("generation fixture failed");
    const index: KnowledgeIndexPort = {
      ensureCollection: async () => undefined,
      stage: async () => undefined,
      publish: async () => undefined,
      removeGeneration: async () => undefined,
    };
    await buildKnowledgeIndexGeneration(firstGeneration.generationId, {
      db: testDatabase.db,
      collection: "knowledge-test",
      embeddingModel: "embedding-a",
      embeddingDimension: 2,
      now: () => new Date(),
      storage: storageReturning(first.body),
      embedding: { embed: async (texts) => texts.map(() => [1, 0]) },
      index,
    });
    await buildKnowledgeIndexGeneration(secondGeneration.generationId, {
      db: testDatabase.db,
      collection: "knowledge-test",
      embeddingModel: "embedding-b",
      embeddingDimension: 2,
      now: () => new Date(),
      storage: storageReturning(second.body),
      embedding: { embed: async (texts) => texts.map(() => [1, 0]) },
      index,
    });

    await expect(
      createKnowledgeStore(testDatabase.db).authorizeAndSnapshot(actor, rootWorkspace.id),
    ).rejects.toThrow("knowledge_index_inconsistent");
  });

  it("excludes a tombstoned Source before asynchronous Knowledge cleanup completes", async () => {
    const fixture = await readyIngestion();
    const base = {
      db: testDatabase.db,
      collection: "knowledge-test",
      embeddingModel: "embedding-test",
      embeddingDimension: 2,
      now: () => new Date(),
    };
    const generation = await createKnowledgeIndexGeneration(fixture.ingestion.id, base);
    if (!generation) throw new Error("generation fixture failed");
    await buildKnowledgeIndexGeneration(generation.generationId, {
      ...base,
      storage: storageReturning(fixture.body),
      embedding: { embed: async (texts) => texts.map(() => [1, 0]) },
      index: {
        ensureCollection: async () => undefined,
        stage: async () => undefined,
        publish: async () => undefined,
        removeGeneration: async () => undefined,
      },
    });
    await testDatabase.db
      .update(sources)
      .set({ deletedAt: new Date() })
      .where(eq(sources.id, fixture.source.id));

    await expect(
      createKnowledgeStore(testDatabase.db).authorizeAndSnapshot(
        { principalId: fixture.principal.id, handle: fixture.principal.handle },
        fixture.workspace.id,
      ),
    ).rejects.toThrow("knowledge_index_not_ready");
  });

  it("purges Stratumind points before deleting Knowledge generations", async () => {
    const fixture = await readyIngestion();
    const generation = await createKnowledgeIndexGeneration(fixture.ingestion.id, {
      db: testDatabase.db,
      collection: "knowledge-test",
      embeddingModel: "embedding-test",
      embeddingDimension: 2,
      now: () => new Date(),
    });
    if (!generation) throw new Error("generation fixture failed");
    const removeGeneration = vi.fn(async () => undefined);
    const cleanup = createKnowledgeSourceCleanupOperations(testDatabase.db, {
      ensureCollection: async () => undefined,
      stage: async () => undefined,
      publish: async () => undefined,
      removeGeneration,
    });

    await expect(cleanup.listWorkflowIds(fixture.source.id)).resolves.toEqual([
      generation.workflowId,
    ]);
    await cleanup.purgeDeletedSourceIndex(fixture.source.id);

    expect(removeGeneration).toHaveBeenCalledWith({
      collection: "knowledge-test",
      generationId: generation.generationId,
    });
    await expect(
      testDatabase.db
        .select({ id: retrievalIndexGenerations.id })
        .from(retrievalIndexGenerations)
        .where(eq(retrievalIndexGenerations.sourceId, fixture.source.id)),
    ).resolves.toEqual([]);
  });

  it("compensates an in-flight publish when Source cleanup wins the race", async () => {
    const fixture = await readyIngestion();
    const base = {
      db: testDatabase.db,
      collection: "knowledge-test",
      embeddingModel: "embedding-test",
      embeddingDimension: 2,
      now: () => new Date(),
    };
    const generation = await createKnowledgeIndexGeneration(fixture.ingestion.id, base);
    if (!generation) throw new Error("generation fixture failed");
    let enterPublish: (() => void) | undefined;
    const publishEntered = new Promise<void>((resolve) => {
      enterPublish = resolve;
    });
    let resumePublish: (() => void) | undefined;
    const publishResumed = new Promise<void>((resolve) => {
      resumePublish = resolve;
    });
    const liveGenerations = new Set<string>();
    const removeGeneration = vi.fn(async ({ generationId }: { generationId: string }) => {
      liveGenerations.delete(generationId);
    });
    const index: KnowledgeIndexPort = {
      ensureCollection: async () => undefined,
      stage: async () => undefined,
      publish: async ({ generationId }) => {
        enterPublish?.();
        await publishResumed;
        liveGenerations.add(generationId);
      },
      removeGeneration,
    };
    const build = buildKnowledgeIndexGeneration(generation.generationId, {
      ...base,
      storage: storageReturning(fixture.body),
      embedding: { embed: async (texts) => texts.map(() => [1, 0]) },
      index,
    });
    await publishEntered;
    await testDatabase.db
      .update(sources)
      .set({ deletedAt: new Date() })
      .where(eq(sources.id, fixture.source.id));
    await createKnowledgeSourceCleanupOperations(testDatabase.db, index).purgeDeletedSourceIndex(
      fixture.source.id,
    );
    resumePublish?.();
    await expect(build).resolves.toEqual({ reason: "artifact_superseded", status: "obsolete" });

    expect(liveGenerations).not.toContain(generation.generationId);
    expect(removeGeneration).toHaveBeenCalledTimes(3);
    await expect(
      testDatabase.db
        .select({ id: retrievalIndexGenerations.id })
        .from(retrievalIndexGenerations)
        .where(eq(retrievalIndexGenerations.id, generation.generationId)),
    ).resolves.toEqual([]);
  });

  it("creates one generation per ingestion manifest and publishes independent projection identities", async () => {
    const fixture = await readyIngestion();
    const base = {
      db: testDatabase.db,
      collection: "knowledge-test",
      embeddingModel: "embedding-test",
      embeddingDimension: 2,
      now: () => new Date(),
    };
    const generation = await createKnowledgeIndexGeneration(fixture.ingestion.id, base);
    expect(generation).toBeTruthy();
    await expect(createKnowledgeIndexGeneration(fixture.ingestion.id, base)).resolves.toEqual(
      generation,
    );
    if (!generation) throw new Error("generation fixture failed");
    const generationId = generation.generationId;

    const index: KnowledgeIndexPort = {
      ensureCollection: vi.fn(async () => undefined),
      stage: vi.fn(async () => undefined),
      publish: vi.fn(async () => undefined),
      removeGeneration: vi.fn(async () => undefined),
    };
    await buildKnowledgeIndexGeneration(generationId, {
      ...base,
      storage: storageReturning(fixture.body),
      embedding: { embed: async (texts) => texts.map(() => [1, 0]) },
      index,
    });

    const [generationRecord] = await testDatabase.db
      .select()
      .from(retrievalIndexGenerations)
      .where(eq(retrievalIndexGenerations.id, generationId));
    const blocks = await testDatabase.db
      .select()
      .from(retrievalRepresentationBlocks)
      .where(eq(retrievalRepresentationBlocks.indexGenerationId, generationId));
    const chunks = await testDatabase.db
      .select()
      .from(retrievalChunks)
      .where(eq(retrievalChunks.indexGenerationId, generationId));
    const evidence = await testDatabase.db
      .select()
      .from(retrievalEvidenceUnits)
      .where(eq(retrievalEvidenceUnits.indexGenerationId, generationId));
    expect(generationRecord?.state).toBe("ready");
    expect(blocks.length).toBeGreaterThan(1);
    expect(chunks).toHaveLength(1);
    expect(evidence.length).toBeGreaterThan(1);
    expect(new Set(evidence.map((unit) => unit.id))).not.toContain(chunks[0]?.id);
    expect(index.stage).toHaveBeenCalledOnce();
    expect(index.publish).toHaveBeenCalledOnce();

    await buildKnowledgeIndexGeneration(generationId, {
      ...base,
      storage: storageReturning(fixture.body),
      embedding: {
        embed: async () => {
          throw new Error("must not rerun");
        },
      },
      index,
    });
    expect(index.stage).toHaveBeenCalledOnce();
    expect(index.publish).toHaveBeenCalledTimes(2);

    await testDatabase.db
      .update(sourceIngestions)
      .set({
        state: "obsolete",
        resultStorageKey: null,
        resultStorageVersionId: null,
        resultSha256: null,
        resultSizeBytes: null,
      })
      .where(eq(sourceIngestions.id, fixture.ingestion.id));
    const [nextIngestion] = await testDatabase.db
      .insert(sourceIngestions)
      .values({
        sourceId: fixture.ingestion.sourceId,
        sourceRevision: 2,
        provider: "native_text",
        state: "ready",
        resultStorageKey: `results/${fixture.ingestion.sourceId}-v2.json`,
        resultStorageVersionId: "v2",
        resultSha256: "b".repeat(64),
        resultSizeBytes: fixture.body.byteLength,
        startedAt: new Date(),
        finishedAt: new Date(),
      })
      .returning();
    if (!nextIngestion) throw new Error("next ingestion fixture failed");
    const nextGeneration = await createKnowledgeIndexGeneration(nextIngestion.id, base);
    if (!nextGeneration) throw new Error("next generation fixture failed");
    await buildKnowledgeIndexGeneration(nextGeneration.generationId, {
      ...base,
      storage: storageReturning(fixture.body),
      embedding: { embed: async (texts) => texts.map(() => [1, 0]) },
      index,
    });
    const generations = await testDatabase.db
      .select({ id: retrievalIndexGenerations.id, state: retrievalIndexGenerations.state })
      .from(retrievalIndexGenerations)
      .where(eq(retrievalIndexGenerations.sourceId, fixture.ingestion.sourceId));
    expect(generations).toEqual(
      expect.arrayContaining([
        { id: generationId, state: "obsolete" },
        { id: nextGeneration.generationId, state: "ready" },
      ]),
    );
    const oldSnapshotMaterials = await createKnowledgeStore(testDatabase.db).loadMaterials({
      chunkIds: chunks.map((chunk) => chunk.id),
      generationIds: [generationId],
      rootWorkspaceId: fixture.workspace.id,
    });
    expect(oldSnapshotMaterials.size).toBe(chunks.length);
    for (const [table, id] of [
      ["retrieval_representation_blocks", blocks[0]?.id],
      ["retrieval_chunks", chunks[0]?.id],
      ["retrieval_evidence_units", evidence[0]?.id],
    ] as const) {
      if (!id) throw new Error("locator constraint fixture failed");
      await expect(
        testDatabase.pool.query(
          `UPDATE ${table} SET locator_start = NULL, locator_end = 10 WHERE id = $1`,
          [id],
        ),
      ).rejects.toThrow();
    }
    await collectObsoleteKnowledgeIndexGenerations(
      { db: testDatabase.db, index, now: () => new Date(Date.now() + 1) },
      { retentionMs: 0 },
    );
    expect(index.removeGeneration).toHaveBeenCalledWith({
      collection: "knowledge-test",
      generationId,
    });
    await expect(
      testDatabase.db
        .select({ id: retrievalIndexGenerations.id })
        .from(retrievalIndexGenerations)
        .where(eq(retrievalIndexGenerations.id, generationId)),
    ).resolves.toEqual([]);
  });

  it("cleans staged points and assigns a fresh workflow identity after failure", async () => {
    const fixture = await readyIngestion();
    let now = new Date("2026-07-23T00:00:00.000Z");
    const base = {
      db: testDatabase.db,
      collection: "knowledge-test",
      embeddingModel: "embedding-test",
      embeddingDimension: 2,
      now: () => now,
    };
    const generation = await createKnowledgeIndexGeneration(fixture.ingestion.id, base);
    if (!generation) throw new Error("generation fixture failed");
    const removeGeneration = vi.fn(async () => undefined);
    await expect(
      buildKnowledgeIndexGeneration(generation.generationId, {
        ...base,
        storage: storageReturning(fixture.body),
        embedding: { embed: async (texts) => texts.map(() => [1, 0]) },
        index: {
          ensureCollection: async () => undefined,
          stage: async () => undefined,
          publish: async () => {
            throw new Error("publish failed");
          },
          removeGeneration,
        },
      }),
    ).rejects.toThrow("publish failed");
    const [failed] = await testDatabase.db
      .select()
      .from(retrievalIndexGenerations)
      .where(eq(retrievalIndexGenerations.id, generation.generationId));
    expect(failed?.state).toBe("failed");
    expect(removeGeneration).toHaveBeenCalled();

    await expect(createKnowledgeIndexGeneration(fixture.ingestion.id, base)).resolves.toBeNull();
    now = new Date(now.getTime() + 60_001);
    const retried = await createKnowledgeIndexGeneration(fixture.ingestion.id, base);
    expect(retried?.generationId).toBe(generation.generationId);
    expect(retried?.workflowId).not.toBe(generation.workflowId);
  });

  it("does not retry permanent indexing failures", async () => {
    const fixture = await readyIngestion();
    const base = {
      db: testDatabase.db,
      collection: "knowledge-test",
      embeddingModel: "embedding-test",
      embeddingDimension: 2,
      now: () => new Date("2026-07-23T00:00:00.000Z"),
    };
    const generation = await createKnowledgeIndexGeneration(fixture.ingestion.id, base);
    if (!generation) throw new Error("generation fixture failed");
    await expect(
      buildKnowledgeIndexGeneration(generation.generationId, {
        ...base,
        storage: storageReturning(fixture.body),
        embedding: { embed: async (texts) => texts.map(() => [Number.NaN, 0]) },
        index: {
          ensureCollection: async () => undefined,
          stage: async () => undefined,
          publish: async () => undefined,
          removeGeneration: async () => undefined,
        },
      }),
    ).rejects.toThrow("knowledge_embedding_invalid");
    const [failed] = await testDatabase.db
      .select()
      .from(retrievalIndexGenerations)
      .where(eq(retrievalIndexGenerations.id, generation.generationId));
    expect(failed).toMatchObject({
      state: "failed",
      failureCode: "knowledge_indexing_permanent",
      nextRetryAt: null,
    });
    await expect(createKnowledgeIndexGeneration(fixture.ingestion.id, base)).resolves.toBeNull();
  });

  it("terminally fails a queued generation whose ingestion is superseded", async () => {
    const fixture = await readyIngestion();
    const base = {
      db: testDatabase.db,
      collection: "knowledge-test",
      embeddingModel: "embedding-test",
      embeddingDimension: 2,
      now: () => new Date("2026-07-23T00:00:00.000Z"),
    };
    const generation = await createKnowledgeIndexGeneration(fixture.ingestion.id, base);
    if (!generation) throw new Error("generation fixture failed");
    await testDatabase.db
      .update(sourceIngestions)
      .set({
        state: "obsolete",
        resultStorageKey: null,
        resultStorageVersionId: null,
        resultSha256: null,
        resultSizeBytes: null,
      })
      .where(eq(sourceIngestions.id, fixture.ingestion.id));
    await expect(
      buildKnowledgeIndexGeneration(generation.generationId, {
        ...base,
        storage: storageReturning(fixture.body),
        embedding: { embed: async () => [[1, 0]] },
        index: {
          ensureCollection: async () => undefined,
          stage: async () => undefined,
          publish: async () => undefined,
          removeGeneration: async () => undefined,
        },
      }),
    ).rejects.toThrow("knowledge_ingestion_not_ready");
    const [failed] = await testDatabase.db
      .select()
      .from(retrievalIndexGenerations)
      .where(eq(retrievalIndexGenerations.id, generation.generationId));
    expect(failed).toMatchObject({
      state: "failed",
      failureCode: "knowledge_indexing_permanent",
      nextRetryAt: null,
    });
  });

  it("continues obsolete collection after one physical deletion fails", async () => {
    const firstFixture = await readyIngestion();
    const secondFixture = await readyIngestion();
    const base = {
      db: testDatabase.db,
      collection: "knowledge-test",
      embeddingModel: "embedding-test",
      embeddingDimension: 2,
      now: () => new Date("2026-07-23T00:00:00.000Z"),
    };
    const first = await createKnowledgeIndexGeneration(firstFixture.ingestion.id, base);
    const second = await createKnowledgeIndexGeneration(secondFixture.ingestion.id, base);
    if (!first || !second) throw new Error("generation fixture failed");
    await testDatabase.db
      .update(retrievalIndexGenerations)
      .set({ state: "obsolete", publishedAt: base.now(), updatedAt: base.now() })
      .where(eq(retrievalIndexGenerations.id, first.generationId));
    await testDatabase.db
      .update(retrievalIndexGenerations)
      .set({ state: "obsolete", publishedAt: base.now(), updatedAt: base.now() })
      .where(eq(retrievalIndexGenerations.id, second.generationId));
    const removeGeneration = vi.fn(async ({ generationId }: { generationId: string }) => {
      if (generationId === first.generationId) throw new Error("physical delete failed");
    });
    await expect(
      collectObsoleteKnowledgeIndexGenerations(
        {
          db: testDatabase.db,
          index: {
            ensureCollection: async () => undefined,
            stage: async () => undefined,
            publish: async () => undefined,
            removeGeneration,
          },
          now: () => new Date("2026-07-23T00:00:01.000Z"),
        },
        { retentionMs: 0 },
      ),
    ).resolves.toEqual({ removed: 1, failed: 1 });
    const remaining = await testDatabase.db
      .select({ id: retrievalIndexGenerations.id })
      .from(retrievalIndexGenerations)
      .where(eq(retrievalIndexGenerations.id, first.generationId));
    expect(remaining).toEqual([{ id: first.generationId }]);
    await expect(
      testDatabase.db
        .select({ id: retrievalIndexGenerations.id })
        .from(retrievalIndexGenerations)
        .where(eq(retrievalIndexGenerations.id, second.generationId)),
    ).resolves.toEqual([]);
  });
});
