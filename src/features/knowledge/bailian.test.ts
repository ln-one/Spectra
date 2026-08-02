import { describe, expect, it } from "vitest";
import { createBailianEmbeddingPort, createBailianRerankPort } from "./bailian";

describe("Bailian knowledge adapters", () => {
  it("restores embedding order and enforces the frozen dimension", async () => {
    const port = createBailianEmbeddingPort({
      apiKey: "key",
      baseUrl: "https://example.com/v1",
      model: "text-embedding-v4",
      dimension: 2,
      transport: {
        create: async () => ({
          object: "list",
          model: "text-embedding-v4",
          usage: { prompt_tokens: 1, total_tokens: 1 },
          data: [
            { object: "embedding", index: 1, embedding: [0, 1] },
            { object: "embedding", index: 0, embedding: [1, 0] },
          ],
        }),
      },
    });
    await expect(port.embed(["a", "b"])).resolves.toEqual([
      [1, 0],
      [0, 1],
    ]);
  });

  it("maps qwen3-rerank indices back to stable Chunk identities", async () => {
    const port = createBailianRerankPort({
      apiKey: "key",
      url: "https://example.com/rerank",
      model: "qwen3-rerank",
      timeoutMs: 1_000,
      fetch: async () =>
        new Response(
          JSON.stringify({
            output: {
              results: [
                { index: 1, relevance_score: 0.9 },
                { index: 0, relevance_score: 0.4 },
              ],
            },
          }),
          { status: 200 },
        ),
    });
    await expect(
      port.rerank({
        query: "q",
        documents: [
          { id: "c1", text: "one" },
          { id: "c2", text: "two" },
        ],
      }),
    ).resolves.toEqual([
      { id: "c2", score: 0.9 },
      { id: "c1", score: 0.4 },
    ]);
  });
});
