import { createMigratedTestDatabase } from "@tests/database";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  fileSources,
  principals,
  retrievalEvidenceUnits,
  retrievalIndexGenerations,
  retrievalRepresentationBlocks,
  sourceIngestions,
  sources,
  workspacePermissionGrants,
  workspaces,
} from "@/database/schema";
import { addWorkspaceReference } from "@/features/sources/service";
import { readAuthorizedKnowledgeEvidenceContext } from "./evidence-context.server";

let testDatabase: Awaited<ReturnType<typeof createMigratedTestDatabase>>;

beforeAll(async () => {
  testDatabase = await createMigratedTestDatabase();
});

afterAll(async () => {
  await testDatabase.destroy();
});

async function principal(handle: string) {
  const [created] = await testDatabase.db
    .insert(principals)
    .values({
      authUserId: crypto.randomUUID(),
      handle: `${handle}-${crypto.randomUUID().slice(0, 12)}`,
    })
    .returning();
  if (!created) throw new Error("principal fixture failed");
  return created;
}

async function evidenceFixture() {
  const owner = await principal("owner");
  const [workspace] = await testDatabase.db
    .insert(workspaces)
    .values({ ownerId: owner.id, name: "Evidence", referenceable: true })
    .returning();
  if (!workspace) throw new Error("workspace fixture failed");
  const [source] = await testDatabase.db
    .insert(sources)
    .values({ workspaceId: workspace.id, kind: "uploaded_file" })
    .returning();
  if (!source) throw new Error("source fixture failed");
  await testDatabase.db.insert(fileSources).values({
    sourceId: source.id,
    originalFilename: "manual.md",
    sizeBytes: 64,
    state: "stored",
    storageKey: `sources/${source.id}.md`,
    storageVersionId: "v1",
  });
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
      resultSizeBytes: 64,
      startedAt: now,
      finishedAt: now,
    })
    .returning();
  if (!ingestion) throw new Error("ingestion fixture failed");
  const representationId = `representation-${crypto.randomUUID()}`;
  const [generation] = await testDatabase.db
    .insert(retrievalIndexGenerations)
    .values({
      sourceId: source.id,
      workspaceId: workspace.id,
      sourceIngestionId: ingestion.id,
      sourceRevision: 1,
      sourceRevisionId: `source-revision-${crypto.randomUUID()}`,
      representationId,
      representationFamily: "prose",
      representationAdapterId: "test",
      representationAdapterVersion: "1",
      representationHash: "b".repeat(64),
      collectionName: "evidence-context-test",
      embeddingModelId: "embedding-test",
      embeddingDimension: 2,
      chunkProfileId: "chunk-test",
      sparseProfileId: "sparse-test",
      manifestHash: "c".repeat(64),
      sourcePolicyHash: "d".repeat(64),
      workflowId: `workflow-${crypto.randomUUID()}`,
      state: "ready",
      publishedAt: now,
    })
    .returning();
  if (!generation) throw new Error("generation fixture failed");

  const texts = ["拆卸前先清理周围区域。", "维修前需要先拆下气缸头盖。", "随后按顺序松开螺栓。"];
  await testDatabase.db.insert(retrievalRepresentationBlocks).values(
    texts.map((text, ordinal) => ({
      id: crypto.randomUUID(),
      indexGenerationId: generation.id,
      sourceId: source.id,
      representationId,
      ordinal,
      kind: "paragraph",
      headingPath: ["维修"],
      exactText: text,
      indexText: text,
      locator: { kind: "text_range", start: ordinal * 20, end: ordinal * 20 + text.length },
      content: { kind: "exact_text", text },
      fidelity: "source",
      contentHash: `${ordinal + 1}`.repeat(64),
      capacityUnits: text.length,
    })),
  );
  const [evidence] = await testDatabase.db
    .insert(retrievalEvidenceUnits)
    .values({
      id: crypto.randomUUID(),
      indexGenerationId: generation.id,
      sourceId: source.id,
      representationId,
      ordinal: 0,
      blockOrdinal: 1,
      kind: "exact_text",
      exactExcerpt: "拆下气缸头盖。",
      locator: { kind: "text_range", start: 20, end: 34 },
      content: { kind: "exact_text", text: "拆下气缸头盖。" },
      fidelity: "source",
      contentHash: "e".repeat(64),
      capacityUnits: 8,
    })
    .returning();
  if (!evidence) throw new Error("evidence fixture failed");
  return { evidence, generation, owner, workspace };
}

describe("authorized Knowledge evidence context", () => {
  it("allows the owner and an explicitly readable member but hides a private workspace", async () => {
    const fixture = await evidenceFixture();
    const member = await principal("member");
    const outsider = await principal("outsider");
    await testDatabase.db.insert(workspacePermissionGrants).values({
      workspaceId: fixture.workspace.id,
      principalId: member.id,
      permission: "workspace.read",
      grantedByPrincipalId: fixture.owner.id,
    });

    const input = {
      workspaceId: fixture.workspace.id,
      evidenceId: fixture.evidence.id,
      db: testDatabase.db,
    };
    await expect(
      readAuthorizedKnowledgeEvidenceContext({
        ...input,
        actor: { principalId: fixture.owner.id, handle: fixture.owner.handle },
      }),
    ).resolves.toMatchObject({ exactExcerpt: "拆下气缸头盖。" });
    await expect(
      readAuthorizedKnowledgeEvidenceContext({
        ...input,
        actor: { principalId: member.id, handle: member.handle },
      }),
    ).resolves.toMatchObject({ exactExcerpt: "拆下气缸头盖。" });
    await expect(
      readAuthorizedKnowledgeEvidenceContext({
        ...input,
        actor: { principalId: outsider.id, handle: outsider.handle },
      }),
    ).rejects.toThrow("knowledge_evidence_context_unavailable");
  });

  it("allows a public reader and a reachable referenced workspace", async () => {
    const fixture = await evidenceFixture();
    const publicReader = await principal("public");
    await testDatabase.db
      .update(workspaces)
      .set({ visibility: "public" })
      .where(eq(workspaces.id, fixture.workspace.id));

    await expect(
      readAuthorizedKnowledgeEvidenceContext({
        actor: { principalId: publicReader.id, handle: publicReader.handle },
        workspaceId: fixture.workspace.id,
        evidenceId: fixture.evidence.id,
        db: testDatabase.db,
      }),
    ).resolves.toMatchObject({ exactExcerpt: "拆下气缸头盖。" });

    const [rootWorkspace] = await testDatabase.db
      .insert(workspaces)
      .values({ ownerId: fixture.owner.id, name: "Root" })
      .returning();
    if (!rootWorkspace) throw new Error("root workspace fixture failed");
    await addWorkspaceReference(
      { principalId: fixture.owner.id, handle: fixture.owner.handle },
      rootWorkspace.id,
      fixture.workspace.id,
      { db: testDatabase.db },
    );
    await expect(
      readAuthorizedKnowledgeEvidenceContext({
        actor: { principalId: fixture.owner.id, handle: fixture.owner.handle },
        workspaceId: rootWorkspace.id,
        evidenceId: fixture.evidence.id,
        db: testDatabase.db,
      }),
    ).resolves.toMatchObject({ exactExcerpt: "拆下气缸头盖。" });
  });
});
