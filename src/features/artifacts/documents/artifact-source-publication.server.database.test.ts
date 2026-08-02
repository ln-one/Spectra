import { createMigratedTestDatabase } from "@tests/database";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  artifactRevisions,
  artifactSources,
  artifacts,
  retrievalIndexGenerations,
  sources,
} from "@/database/schema";
import { tombstoneArtifact } from "@/features/artifacts/lifecycle.server";
import { listArtifactHistory } from "@/features/artifacts/workbench-server";
import { ensurePrincipalForAuthUser } from "@/features/identity/service";
import { deleteSource, listWorkspaceSources } from "@/features/sources/service";
import { createWorkspace } from "@/features/workspaces/service";
import { publishArtifactSource } from "../artifact-source-membership.server";
import { publishArtifactSourceRevision } from "../artifact-source-publication.server";
import type { ArtifactKind } from "../types";

let testDatabase: Awaited<ReturnType<typeof createMigratedTestDatabase>>;

function publishArtifactSourceForTest(
  actor: Parameters<typeof publishArtifactSource>[0],
  input: Parameters<typeof publishArtifactSource>[1],
) {
  return publishArtifactSource(actor, input, {
    db: testDatabase.db,
    enqueueKnowledgeIndex: async () => undefined,
  });
}

beforeAll(async () => {
  testDatabase = await createMigratedTestDatabase();
});

beforeEach(async () => {
  vi.stubEnv("KNOWLEDGE_INDEXING_ENABLED", "false");
  await testDatabase.pool.query(
    "TRUNCATE TABLE public.artifact_sources, public.artifact_revisions, public.artifacts, public.sources, public.workspaces, public.principals CASCADE",
  );
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await testDatabase.destroy();
});

function revisionContent(kind: ArtifactKind, title: string) {
  if (kind === "mind_map") {
    return {
      nodes: [{ id: "root", label: title, order: 0, parentId: null }],
      rootId: "root",
      schemaVersion: 1,
    };
  }
  if (kind === "quiz") {
    return {
      descriptionMarkdown: "",
      questions: [
        {
          correctAnswer: true,
          difficulty: "easy",
          explanationMarkdown: "Because it is true.",
          points: 1,
          promptMarkdown: "True or false?",
          questionId: crypto.randomUUID(),
          type: "true_false",
        },
      ],
      schemaVersion: 1,
      settings: { feedbackMode: "after_submission", navigationMode: "free" },
      title,
    };
  }
  return {
    document: { content: [], type: "doc" },
    schemaVersion: 1,
    title,
  };
}

async function teachingDocumentFixture(kind: ArtifactKind = "teaching_document") {
  const actor = await ensurePrincipalForAuthUser(
    `auth-${crypto.randomUUID()}`,
    `user-${crypto.randomUUID().slice(0, 8)}`,
    testDatabase.db,
  );
  const workspace = await createWorkspace(actor, { name: "Documents" }, testDatabase.db);
  const [artifact] = await testDatabase.db
    .insert(artifacts)
    .values({
      workspaceId: workspace.id,
      conversationId: crypto.randomUUID(),
      createdByPrincipalId: actor.principalId,
      kind,
      title: "New handbook",
      generationState: "ready",
    })
    .returning();
  if (!artifact) throw new Error("artifact fixture failed");
  const [revision] = await testDatabase.db
    .insert(artifactRevisions)
    .values({
      artifactId: artifact.id,
      createdByPrincipalId: actor.principalId,
      revisionNumber: 1,
      content: revisionContent(kind, artifact.title),
      contentSha256: "a".repeat(64),
    })
    .returning();
  if (!revision) throw new Error("revision fixture failed");
  await testDatabase.db
    .update(artifacts)
    .set({ currentRevisionId: revision.id })
    .where(eq(artifacts.id, artifact.id));
  return { actor, artifact, revision, workspace };
}

describe("Artifact Sources", () => {
  it("keeps a newly published teaching document in History until the user adds it", async () => {
    const fixture = await teachingDocumentFixture();
    if (!fixture.artifact.conversationId) throw new Error("conversation fixture failed");
    await testDatabase.db.transaction((transaction) =>
      publishArtifactSourceRevision(transaction, fixture),
    );
    await expect(testDatabase.db.select().from(artifactSources)).resolves.toHaveLength(0);
    await expect(
      listArtifactHistory(
        fixture.actor,
        {
          conversationId: fixture.artifact.conversationId,
          workspaceId: fixture.workspace.id,
        },
        testDatabase.db,
      ),
    ).resolves.toMatchObject([{ id: fixture.artifact.id }]);
    await expect(
      listWorkspaceSources(fixture.actor, fixture.workspace.id, { db: testDatabase.db }),
    ).resolves.toEqual([]);
  });

  it("moves the Artifact from History to Sources only after the explicit add action", async () => {
    const fixture = await teachingDocumentFixture();
    if (!fixture.artifact.conversationId) throw new Error("conversation fixture failed");
    await publishArtifactSourceForTest(fixture.actor, {
      artifactId: fixture.artifact.id,
      conversationId: fixture.artifact.conversationId,
      workspaceId: fixture.workspace.id,
    });
    await expect(
      listArtifactHistory(
        fixture.actor,
        {
          conversationId: fixture.artifact.conversationId,
          workspaceId: fixture.workspace.id,
        },
        testDatabase.db,
      ),
    ).resolves.toEqual([]);
    await expect(
      listWorkspaceSources(fixture.actor, fixture.workspace.id, { db: testDatabase.db }),
    ).resolves.toMatchObject([
      {
        kind: "artifact",
        artifact: {
          id: fixture.artifact.id,
          title: "New handbook",
          conversationId: fixture.artifact.conversationId,
        },
      },
    ]);
  });

  it.each([
    "mind_map",
    "presentation",
    "quiz",
  ] as const)("moves a ready %s Artifact from History to Sources with its original kind", async (kind) => {
    const fixture = await teachingDocumentFixture(kind);
    if (!fixture.artifact.conversationId) throw new Error("conversation fixture failed");

    const membership = await publishArtifactSourceForTest(fixture.actor, {
      artifactId: fixture.artifact.id,
      conversationId: fixture.artifact.conversationId,
      workspaceId: fixture.workspace.id,
    });

    expect(membership.source.artifact.kind).toBe(kind);
    await expect(
      listArtifactHistory(
        fixture.actor,
        {
          conversationId: fixture.artifact.conversationId,
          workspaceId: fixture.workspace.id,
        },
        testDatabase.db,
      ),
    ).resolves.toEqual([]);
  });

  it("rejects a presentation that is not ready", async () => {
    const fixture = await teachingDocumentFixture("presentation");
    if (!fixture.artifact.conversationId) throw new Error("conversation fixture failed");
    await testDatabase.db
      .update(artifacts)
      .set({ generationFailureCode: "presentation_remote_error", generationState: "failed" })
      .where(eq(artifacts.id, fixture.artifact.id));

    await expect(
      publishArtifactSourceForTest(fixture.actor, {
        artifactId: fixture.artifact.id,
        conversationId: fixture.artifact.conversationId,
        workspaceId: fixture.workspace.id,
      }),
    ).rejects.toMatchObject({ code: "artifact_not_found" });
  });

  it("does not let the Workspace owner publish another creator's private presentation", async () => {
    const fixture = await teachingDocumentFixture("presentation");
    if (!fixture.artifact.conversationId) throw new Error("conversation fixture failed");
    const creator = await ensurePrincipalForAuthUser(
      `auth-${crypto.randomUUID()}`,
      `user-${crypto.randomUUID().slice(0, 8)}`,
      testDatabase.db,
    );
    await testDatabase.db
      .update(artifacts)
      .set({ createdByPrincipalId: creator.principalId })
      .where(eq(artifacts.id, fixture.artifact.id));

    await expect(
      publishArtifactSourceForTest(fixture.actor, {
        artifactId: fixture.artifact.id,
        conversationId: fixture.artifact.conversationId,
        workspaceId: fixture.workspace.id,
      }),
    ).rejects.toMatchObject({ code: "artifact_not_found" });
  });

  it("allows a document with a usable revision even when its latest attempt failed", async () => {
    const fixture = await teachingDocumentFixture();
    if (!fixture.artifact.conversationId) throw new Error("conversation fixture failed");
    await testDatabase.db
      .update(artifacts)
      .set({
        generationFailureCode: "provider_failed",
        generationState: "failed",
      })
      .where(eq(artifacts.id, fixture.artifact.id));

    await expect(
      publishArtifactSourceForTest(fixture.actor, {
        artifactId: fixture.artifact.id,
        conversationId: fixture.artifact.conversationId,
        workspaceId: fixture.workspace.id,
      }),
    ).resolves.toMatchObject({ sourceId: expect.any(String) });
  });

  it("moves the Artifact back to History when it is removed from Sources", async () => {
    const fixture = await teachingDocumentFixture();
    if (!fixture.artifact.conversationId) throw new Error("conversation fixture failed");
    const membership = await publishArtifactSourceForTest(fixture.actor, {
      artifactId: fixture.artifact.id,
      conversationId: fixture.artifact.conversationId,
      workspaceId: fixture.workspace.id,
    });
    const queuedCleanup: string[] = [];
    await deleteSource(fixture.actor, membership.sourceId, {
      cleanupQueue: {
        async enqueue(_transaction, sourceId) {
          queuedCleanup.push(sourceId);
        },
      },
      db: testDatabase.db,
      now: () => new Date("2026-07-28T10:00:00.000Z"),
    });
    await testDatabase.db.transaction((transaction) =>
      publishArtifactSourceRevision(transaction, fixture),
    );
    expect(queuedCleanup).toEqual([membership.sourceId]);
    await expect(testDatabase.db.select().from(artifactSources)).resolves.toHaveLength(0);
    await expect(
      listWorkspaceSources(fixture.actor, fixture.workspace.id, { db: testDatabase.db }),
    ).resolves.toEqual([]);
    await expect(
      listArtifactHistory(
        fixture.actor,
        {
          conversationId: fixture.artifact.conversationId,
          workspaceId: fixture.workspace.id,
        },
        testDatabase.db,
      ),
    ).resolves.toMatchObject([{ id: fixture.artifact.id }]);
  });

  it("tombstones the linked Source when the teaching document is deleted", async () => {
    const fixture = await teachingDocumentFixture();
    if (!fixture.artifact.conversationId) throw new Error("conversation fixture failed");
    await publishArtifactSourceForTest(fixture.actor, {
      artifactId: fixture.artifact.id,
      conversationId: fixture.artifact.conversationId,
      workspaceId: fixture.workspace.id,
    });
    const [link] = await testDatabase.db.select().from(artifactSources);
    if (!link) throw new Error("Artifact Source link fixture failed");
    await testDatabase.db.insert(retrievalIndexGenerations).values({
      sourceId: link.sourceId,
      workspaceId: fixture.workspace.id,
      artifactRevisionId: fixture.revision.id,
      sourceRevision: 1,
      sourceRevisionId: fixture.revision.id,
      representationId: `${link.sourceId}:${fixture.revision.contentSha256}`,
      collectionName: "knowledge-test",
      embeddingModelId: "embedding-test",
      embeddingDimension: 2,
      chunkProfileId: "spectra-knowledge-v3",
      sparseProfileId: "qdrant/bm25-native-v1",
      manifestHash: "b".repeat(64),
      sourcePolicyHash: "c".repeat(64),
      workflowId: crypto.randomUUID(),
      state: "ready",
      publishedAt: new Date(),
    });
    await tombstoneArtifact({
      actorId: fixture.actor.principalId,
      artifactId: fixture.artifact.id,
      conversationId: fixture.artifact.conversationId,
      db: testDatabase.db,
      kind: "teaching_document",
      workspaceId: fixture.workspace.id,
    });
    const [source] = await testDatabase.db
      .select()
      .from(sources)
      .where(eq(sources.id, link.sourceId));
    expect(source?.deletedAt).not.toBeNull();
    await expect(
      listWorkspaceSources(fixture.actor, fixture.workspace.id, { db: testDatabase.db }),
    ).resolves.toEqual([]);
  });
});
