import { describe, expect, it } from "vitest";
import { testServerEnvironment } from "@/environment/test";
import { knowledgeEnvironment } from "./config";

const base = testServerEnvironment({
  KNOWLEDGE_INDEXING_ENABLED: "true" as const,
  DASHSCOPE_API_KEY: "key",
  DASHSCOPE_BASE_URL: "https://example.com/v1",
});

describe("knowledge configuration", () => {
  it("uses the frozen V1 profile defaults on loopback", () => {
    const result = knowledgeEnvironment(base);
    expect(result.stratumind).toMatchObject({
      url: "http://127.0.0.1:6333",
      collection: "spectra-knowledge-v1-512",
    });
    expect(result.embedding).toEqual({ model: "text-embedding-v4", dimension: 512 });
    expect(result.indexingEnabled).toBe(true);
  });

  it("does not validate Knowledge credentials while indexing is disabled", () => {
    expect(
      knowledgeEnvironment(testServerEnvironment({ KNOWLEDGE_INDEXING_ENABLED: "false" })),
    ).toEqual({ indexingEnabled: false });
  });

  it("requires authentication for a non-loopback Stratumind", () => {
    expect(() =>
      knowledgeEnvironment(
        testServerEnvironment({
          DASHSCOPE_API_KEY: "key",
          DASHSCOPE_BASE_URL: "https://example.com/v1",
          KNOWLEDGE_INDEXING_ENABLED: "true",
          STRATUMIND_URL: "https://stratumind.example.com",
        }),
      ),
    ).toThrow("STRATUMIND_API_KEY");
    expect(() =>
      knowledgeEnvironment(
        testServerEnvironment({
          DASHSCOPE_API_KEY: "key",
          DASHSCOPE_BASE_URL: "https://example.com/v1",
          KNOWLEDGE_INDEXING_ENABLED: "true",
          STRATUMIND_URL: "https://stratumind.example.com",
          STRATUMIND_API_KEY: "secret",
        }),
      ),
    ).not.toThrow();
  });
});
