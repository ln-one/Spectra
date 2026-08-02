import { QdrantClient } from "@qdrant/js-client-rest";
import type { KnowledgeChunk } from "./contracts";

type KnowledgeIndexPoint = {
  workspaceId: string;
  sourceId: string;
  generationId: string;
  manifestHash: string;
  chunk: KnowledgeChunk;
  dense: number[];
};

export type KnowledgeIndexPort = {
  ensureCollection(input: { collection: string; dimension: number }): Promise<void>;
  stage(input: { collection: string; points: KnowledgeIndexPoint[] }): Promise<void>;
  publish(input: { collection: string; generationId: string }): Promise<void>;
  removeGeneration(input: { collection: string; generationId: string }): Promise<void>;
};

export function createStratumindIndexPort(config: {
  url: string;
  apiKey?: string;
  client?: Pick<
    QdrantClient,
    | "collectionExists"
    | "createCollection"
    | "createPayloadIndex"
    | "getCollection"
    | "upsert"
    | "retrieve"
    | "setPayload"
    | "delete"
  >;
}): KnowledgeIndexPort {
  const client =
    config.client ??
    new QdrantClient({
      url: config.url,
      ...(config.apiKey ? { apiKey: config.apiKey } : {}),
      checkCompatibility: false,
    });
  return {
    async ensureCollection(input) {
      const exists = await client.collectionExists(input.collection);
      if (!exists.exists) {
        await client.createCollection(input.collection, {
          vectors: { dense: { size: input.dimension, distance: "Cosine" } },
          sparse_vectors: { sparse: { modifier: "idf" } },
        });
        for (const field of [
          "workspaceId",
          "sourceId",
          "generationId",
          "manifestHash",
          "indexState",
        ]) {
          await client.createPayloadIndex(input.collection, {
            field_name: field,
            field_schema: "keyword",
            wait: true,
          });
        }
        return;
      }
      const info = await client.getCollection(input.collection);
      const vectors = info.config.params.vectors;
      const dense =
        vectors && !Array.isArray(vectors) && "dense" in vectors ? vectors.dense : undefined;
      const sparse = info.config.params.sparse_vectors?.sparse;
      if (
        !dense ||
        dense.size !== input.dimension ||
        dense.distance !== "Cosine" ||
        sparse?.modifier !== "idf"
      ) {
        throw new Error("knowledge_collection_profile_mismatch");
      }
    },
    async stage(input) {
      if (input.points.length === 0) return;
      for (let offset = 0; offset < input.points.length; offset += 64) {
        const batch = input.points.slice(offset, offset + 64);
        await client.upsert(input.collection, {
          wait: true,
          points: batch.map((point) => ({
            id: point.chunk.id,
            vector: {
              dense: point.dense,
              sparse: { text: point.chunk.indexText, model: "qdrant/bm25" },
            },
            payload: {
              workspaceId: point.workspaceId,
              sourceId: point.sourceId,
              generationId: point.generationId,
              manifestHash: point.manifestHash,
              indexState: "staged",
            },
          })),
        });
        const observed = await client.retrieve(input.collection, {
          ids: batch.map((point) => point.chunk.id),
          with_payload: false,
          with_vector: false,
        });
        if (observed.length !== batch.length) throw new Error("knowledge_staged_points_missing");
      }
    },
    async publish(input) {
      await client.setPayload(input.collection, {
        payload: { indexState: "live" },
        filter: { must: [{ key: "generationId", match: { value: input.generationId } }] },
        wait: true,
      });
    },
    async removeGeneration(input) {
      await client.delete(input.collection, {
        filter: { must: [{ key: "generationId", match: { value: input.generationId } }] },
        wait: true,
      });
    },
  };
}
