import { describe, expect, it, vi } from "vitest";
import { createStratumindIndexPort } from "./index-writer";
import { projectMarkdownRepresentation } from "./projection";

describe("Stratumind index writer", () => {
  it("stages one native BM25 point per Dense Chunk identity then publishes", async () => {
    const projection = projectMarkdownRepresentation({
      representationId: "r1",
      text: "# H\n\nbody",
    });
    const chunk = projection.chunks[0];
    if (!chunk) throw new Error("Chunk was not projected");
    const upsert = vi.fn(async () => ({ operation_id: 1, status: "completed" as const }));
    const setPayload = vi.fn(async () => ({ operation_id: 2, status: "completed" as const }));
    const port = createStratumindIndexPort({
      url: "http://127.0.0.1:6333",
      client: {
        collectionExists: async () => ({ exists: true }),
        createCollection: async () => true,
        createPayloadIndex: async () => ({ operation_id: 1, status: "completed" }),
        getCollection: async () => ({
          status: "green",
          optimizer_status: "ok",
          indexed_vectors_count: 0,
          points_count: 0,
          segments_count: 1,
          config: {
            params: {
              vectors: { dense: { size: 1024, distance: "Cosine" } },
              sparse_vectors: { sparse: { modifier: "idf" } },
              shard_number: 1,
              replication_factor: 1,
              write_consistency_factor: 1,
              on_disk_payload: false,
            },
            hnsw_config: {
              m: 16,
              ef_construct: 100,
              full_scan_threshold: 10_000,
              max_indexing_threads: 0,
              on_disk: false,
            },
            optimizer_config: {
              deleted_threshold: 0.2,
              vacuum_min_vector_number: 1000,
              default_segment_number: 0,
              max_segment_size: null,
              memmap_threshold: null,
              indexing_threshold: 20_000,
              flush_interval_sec: 5,
              max_optimization_threads: null,
            },
            wal_config: { wal_capacity_mb: 32, wal_segments_ahead: 0, wal_retain_closed: 1 },
          },
          payload_schema: {},
        }),
        upsert,
        retrieve: async () => [{ id: chunk.id, payload: null, vector: null }],
        setPayload,
        delete: async () => ({ operation_id: 3, status: "completed" }),
      },
    });
    await port.ensureCollection({ collection: "c", dimension: 1024 });
    await port.stage({
      collection: "c",
      points: [
        {
          workspaceId: "w",
          sourceId: "s",
          generationId: "g",
          manifestHash: "m",
          chunk,
          dense: [1],
        },
      ],
    });
    await port.publish({ collection: "c", generationId: "g" });

    expect(upsert).toHaveBeenCalledWith(
      "c",
      expect.objectContaining({
        points: [
          expect.objectContaining({
            id: chunk.id,
            vector: { dense: [1], sparse: { text: chunk.indexText, model: "qdrant/bm25" } },
            payload: expect.objectContaining({ indexState: "staged" }),
          }),
        ],
      }),
    );
    expect(setPayload).toHaveBeenCalledWith(
      "c",
      expect.objectContaining({ payload: { indexState: "live" } }),
    );
  });
});
