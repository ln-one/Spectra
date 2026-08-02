import { describe, expect, it } from "vitest";
import { createStratumindExactRrfPort } from "./stratumind";

describe("Stratumind exact-rrf adapter", () => {
  it("sends the native BM25 document and workspace snapshot filter", async () => {
    let capturedInit: RequestInit | undefined;
    const fetchImplementation: typeof fetch = async (_input, init) => {
      capturedInit = init;
      return new Response(
        JSON.stringify({
          result: {
            points: [{ id: "c1", rank: 1, version: 2 }],
            guarantee: {
              scope: "selected-local-shards-frozen-segment-view",
              orderedTopKExact: true,
              tieBreak: "point-identity-ascending",
              channelInput: "native-exact-rank-streams",
            },
            execution: {},
          },
          status: "ok",
          time: 0.001,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    const port = createStratumindExactRrfPort({
      url: "http://127.0.0.1:6333",
      fetch: fetchImplementation,
    });
    await port.query({
      collection: "c",
      dense: [1],
      sparseText: "中文 query",
      manifestHash: "m",
      generationIds: ["g2", "g1"],
      workspaceIds: ["w", "referenced-w"],
      k: 60,
      weights: [1, 1],
      limit: 20,
    });
    const body = JSON.parse(String(capturedInit?.body));
    expect(body.exact_rrf.sparse.query).toEqual({ text: "中文 query", model: "qdrant/bm25" });
    expect(body.filter.must).toEqual(
      expect.arrayContaining([
        { key: "generationId", match: { any: ["g2", "g1"] } },
        { key: "workspaceId", match: { any: ["w", "referenced-w"] } },
        { key: "indexState", match: { value: "live" } },
      ]),
    );
  });

  it("rejects a successful response without the exact guarantee", async () => {
    const port = createStratumindExactRrfPort({
      url: "http://127.0.0.1:6333",
      fetch: async () =>
        new Response(
          JSON.stringify({
            result: { points: [], guarantee: { orderedTopKExact: false } },
            status: "ok",
          }),
        ),
    });
    await expect(
      port.query({
        collection: "c",
        dense: [1],
        sparseText: "q",
        manifestHash: "m",
        generationIds: ["g1"],
        workspaceIds: ["w"],
        k: 60,
        weights: [1, 1],
        limit: 20,
      }),
    ).rejects.toThrow();
  });
});
