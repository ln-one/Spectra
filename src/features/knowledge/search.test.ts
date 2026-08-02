import { describe, expect, it, vi } from "vitest";
import { projectMarkdownRepresentation } from "./projection";
import { searchWorkspaceKnowledgeWithDependencies } from "./search";

const guarantee = {
  scope: "selected-local-shards-frozen-segment-view",
  orderedTopKExact: true as const,
  tieBreak: "point-identity-ascending" as const,
  channelInput: "native-exact-rank-streams",
};

function fixture() {
  const projection = projectMarkdownRepresentation({
    representationId: "r1",
    text: "# H\n\none. two.",
  });
  const chunk = projection.chunks[0];
  if (!chunk) throw new Error("Chunk was not projected");
  return { projection, chunk };
}

describe("searchWorkspaceKnowledge", () => {
  it("mixes Dense queries, validates exact ranks, reranks and packs", async () => {
    const { projection, chunk } = fixture();
    const exactQuery = vi.fn(async () => ({
      points: [{ id: chunk.id, rank: 1, version: 1 }],
      guarantee,
    }));
    const loadMaterials = vi.fn(
      async () =>
        new Map([
          [
            chunk.id,
            {
              sourceId: "s1",
              workspaceId: "w2",
              workspaceName: "Referenced Workspace",
              workspaceRelation: "referenced" as const,
              sourceRevision: 1,
              representationHash: "a".repeat(64),
              chunk,
              blocks: projection.blocks,
              evidence: projection.evidenceUnits,
            },
          ],
        ]),
    );
    const result = await searchWorkspaceKnowledgeWithDependencies(
      {
        actor: { principalId: "p1", handle: "u" },
        workspaceId: "w1",
        query: {
          intentQuery: "intent",
          denseQuery: "dense",
          sparseQuery: "sparse",
          rerankQuery: "rerank",
        },
      },
      {
        embedding: {
          embed: async () => [
            [1, 0],
            [0, 1],
          ],
        },
        exactRrf: { query: exactQuery },
        rerank: {
          rerank: async ({ documents }) =>
            documents.map((document) => ({ id: document.id, score: 0.9 })),
        },
        store: {
          authorizeAndSnapshot: async () => ({
            collection: "c",
            manifestHash: "m",
            generationIds: ["g1"],
            referenceSourceIds: ["ref1"],
            rootWorkspaceId: "w1",
            workspaceIds: ["w1", "w2"],
          }),
          loadMaterials,
        },
      },
    );

    expect(exactQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        dense: [0.5, 0.5],
        sparseText: "sparse",
        generationIds: ["g1"],
        workspaceIds: ["w1", "w2"],
        limit: 20,
        k: 60,
      }),
    );
    expect(loadMaterials).toHaveBeenCalledWith({
      chunkIds: [chunk.id],
      generationIds: ["g1"],
      rootWorkspaceId: "w1",
    });
    expect(result.status).toBe("ok");
    expect(result.candidates[0]?.rerankScore).toBe(0.9);
    expect(result.candidates[0]).toMatchObject({
      workspaceId: "w2",
      workspaceName: "Referenced Workspace",
      workspaceRelation: "referenced",
    });
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.evidence[0]).toMatchObject({
      workspaceId: "w2",
      workspaceName: "Referenced Workspace",
      workspaceRelation: "referenced",
    });
  });

  it("uses a raw query for every channel and preserves exact order when rerank fails", async () => {
    const { projection, chunk } = fixture();
    const result = await searchWorkspaceKnowledgeWithDependencies(
      { actor: { principalId: "p1", handle: "u" }, workspaceId: "w1", query: "raw" },
      {
        embedding: {
          embed: async (texts) => {
            expect(texts).toEqual(["raw", "raw"]);
            return [[1], [1]];
          },
        },
        exactRrf: {
          query: async ({ sparseText }) => {
            expect(sparseText).toBe("raw");
            return { points: [{ id: chunk.id, rank: 1, version: 1 }], guarantee };
          },
        },
        rerank: {
          rerank: async () => {
            throw new Error("timeout");
          },
        },
        store: {
          authorizeAndSnapshot: async () => ({
            collection: "c",
            manifestHash: "m",
            generationIds: ["g1"],
            referenceSourceIds: [],
            rootWorkspaceId: "w1",
            workspaceIds: ["w1"],
          }),
          loadMaterials: async () =>
            new Map([
              [
                chunk.id,
                {
                  sourceId: "s1",
                  workspaceId: "w1",
                  workspaceName: "Current Workspace",
                  workspaceRelation: "current",
                  sourceRevision: 1,
                  representationHash: "a".repeat(64),
                  chunk,
                  blocks: projection.blocks,
                  evidence: projection.evidenceUnits,
                },
              ],
            ]),
        },
      },
    );
    expect(result.status).toBe("degraded");
    expect(result.degradedReasons).toEqual(["rerank_failed"]);
    expect(result.candidates[0]?.rerankScore).toBeNull();
  });

  it("reauthorizes while reusing a pinned ready-generation snapshot", async () => {
    const { projection, chunk } = fixture();
    const authorizeAndSnapshot = vi.fn(async () => ({
      collection: "current",
      manifestHash: "current-manifest",
      generationIds: ["current-generation"],
      referenceSourceIds: ["pinned-ref"],
      rootWorkspaceId: "w1",
      workspaceIds: ["w1", "w2"],
    }));
    const exactQuery = vi.fn(async () => ({
      points: [{ id: chunk.id, rank: 1, version: 1 }],
      guarantee,
    }));
    await searchWorkspaceKnowledgeWithDependencies(
      {
        actor: { principalId: "p1", handle: "u" },
        workspaceId: "w1",
        query: "raw",
        snapshot: {
          collection: "pinned",
          manifestHash: "pinned-manifest",
          generationIds: ["pinned-generation"],
          referenceSourceIds: ["pinned-ref"],
          rootWorkspaceId: "w1",
          workspaceIds: ["w1", "w2"],
        },
      },
      {
        embedding: { embed: async () => [[1], [1]] },
        exactRrf: { query: exactQuery },
        rerank: {
          rerank: async ({ documents }) =>
            documents.map((document) => ({ id: document.id, score: 1 })),
        },
        store: {
          authorizeAndSnapshot,
          loadMaterials: async () =>
            new Map([
              [
                chunk.id,
                {
                  sourceId: "s1",
                  workspaceId: "w2",
                  workspaceName: "Pinned Workspace",
                  workspaceRelation: "referenced",
                  sourceRevision: 1,
                  representationHash: "a".repeat(64),
                  chunk,
                  blocks: projection.blocks,
                  evidence: projection.evidenceUnits,
                },
              ],
            ]),
        },
      },
    );

    expect(authorizeAndSnapshot).toHaveBeenCalledOnce();
    expect(exactQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "pinned",
        generationIds: ["pinned-generation"],
        manifestHash: "pinned-manifest",
        workspaceIds: ["w1", "w2"],
      }),
    );
  });

  it("fails closed when the exact guarantee is invalid", async () => {
    await expect(
      searchWorkspaceKnowledgeWithDependencies(
        { actor: { principalId: "p1", handle: "u" }, workspaceId: "w1", query: "raw" },
        {
          embedding: { embed: async () => [[1], [1]] },
          exactRrf: {
            query: async () => ({
              points: [],
              guarantee: { ...guarantee, orderedTopKExact: false as true },
            }),
          },
          rerank: { rerank: async () => [] },
          store: {
            authorizeAndSnapshot: async () => ({
              collection: "c",
              manifestHash: "m",
              generationIds: ["g1"],
              referenceSourceIds: [],
              rootWorkspaceId: "w1",
              workspaceIds: ["w1"],
            }),
            loadMaterials: async () => new Map(),
          },
        },
      ),
    ).rejects.toThrow("knowledge_exact_rrf_contract");
  });

  it("rejects a pinned network member after its reference is no longer authorized", async () => {
    await expect(
      searchWorkspaceKnowledgeWithDependencies(
        {
          actor: { principalId: "p1", handle: "u" },
          workspaceId: "w1",
          query: "raw",
          snapshot: {
            collection: "c",
            manifestHash: "m",
            generationIds: ["g1"],
            referenceSourceIds: ["removed-ref"],
            rootWorkspaceId: "w1",
            workspaceIds: ["w1", "w2"],
          },
        },
        {
          embedding: { embed: async () => [[1], [1]] },
          exactRrf: { query: async () => ({ points: [], guarantee }) },
          rerank: { rerank: async () => [] },
          store: {
            authorizeAndSnapshot: async () => ({
              collection: "c",
              manifestHash: "m",
              generationIds: ["g1"],
              referenceSourceIds: [],
              rootWorkspaceId: "w1",
              workspaceIds: ["w1"],
            }),
            loadMaterials: async () => new Map(),
          },
        },
      ),
    ).rejects.toThrow("knowledge_search_scope_stale");
  });

  it("does not turn caller cancellation into a degraded success", async () => {
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));
    await expect(
      searchWorkspaceKnowledgeWithDependencies(
        {
          actor: { principalId: "p1", handle: "u" },
          workspaceId: "w1",
          query: "raw",
          signal: controller.signal,
        },
        {
          embedding: { embed: async () => [[1], [1]] },
          exactRrf: { query: async () => ({ points: [], guarantee }) },
          rerank: {
            rerank: async () => {
              throw new Error("aborted");
            },
          },
          store: {
            authorizeAndSnapshot: async () => ({
              collection: "c",
              manifestHash: "m",
              generationIds: ["g1"],
              referenceSourceIds: [],
              rootWorkspaceId: "w1",
              workspaceIds: ["w1"],
            }),
            loadMaterials: async () => new Map(),
          },
        },
      ),
    ).rejects.toThrow("cancelled");
  });
});
