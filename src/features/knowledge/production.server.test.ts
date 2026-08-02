import { beforeEach, describe, expect, test, vi } from "vitest";
import { searchWorkspaceKnowledgeWithDependencies } from "./search";

const tracing = vi.hoisted(() => {
  const span = {
    end: vi.fn(),
    setAttribute: vi.fn(),
    setAttributes: vi.fn(),
    setStatus: vi.fn(),
  };
  return {
    span,
    startActiveSpan: vi.fn(
      async (
        _name: string,
        _options: unknown,
        callback: (activeSpan: {
          end: () => void;
          setAttribute: (name: string, value: unknown) => void;
          setAttributes: (attributes: Record<string, unknown>) => void;
          setStatus: (status: { code: number; message?: string }) => void;
        }) => unknown,
      ) => callback(span),
    ),
  };
});

vi.mock("@/observability/tracing.server", () => ({
  applicationTracer: { startActiveSpan: tracing.startActiveSpan },
}));
vi.mock("./bailian", () => ({
  createBailianEmbeddingPort: vi.fn(() => ({})),
  createBailianRerankPort: vi.fn(() => ({})),
}));
vi.mock("./config", () => ({
  knowledgeEnvironment: vi.fn(() => ({
    dashscope: { apiKey: "secret", baseUrl: "https://dashscope.invalid" },
    embedding: { dimension: 512, model: "embedding-model" },
    indexingEnabled: true,
    rerank: {
      model: "rerank-model",
      timeoutMs: 1_000,
      url: "https://dashscope.invalid/rerank",
    },
    stratumind: { apiKey: "secret", url: "http://127.0.0.1:6333" },
  })),
}));
vi.mock("./search", () => ({
  searchWorkspaceKnowledgeWithDependencies: vi.fn(),
}));
vi.mock("./store.server", () => ({
  createKnowledgeStore: vi.fn(() => ({})),
}));
vi.mock("./stratumind", () => ({
  createStratumindExactRrfPort: vi.fn(() => ({})),
}));

import { searchWorkspaceKnowledge } from "./production.server";

const workspaceId = "20000000-0000-4000-8000-000000000001";

beforeEach(() => {
  tracing.span.end.mockReset();
  tracing.span.setAttribute.mockReset();
  tracing.span.setAttributes.mockReset();
  tracing.span.setStatus.mockReset();
  tracing.startActiveSpan.mockClear();
  vi.mocked(searchWorkspaceKnowledgeWithDependencies).mockReset();
});

describe("production knowledge tracing", () => {
  test("records stable counts and ends a successful search span", async () => {
    vi.mocked(searchWorkspaceKnowledgeWithDependencies).mockResolvedValue({
      candidates: [],
      degradedReasons: [],
      diagnostics: { candidateCount: 3, packedCapacityUnits: 0 },
      evidence: [{ evidenceId: "evidence-1" }],
      guarantee: null,
      status: "ready",
    } as never);

    await searchWorkspaceKnowledge({
      actor: {} as never,
      query: "private search text",
      workspaceId,
    });

    expect(tracing.startActiveSpan).toHaveBeenCalledWith(
      "knowledge.workspace.search",
      {
        attributes: {
          "gen_ai.provider.name": "dashscope",
          "spectra.knowledge.embedding_model": "embedding-model",
          "spectra.knowledge.rerank_model": "rerank-model",
          "spectra.workspace.id": workspaceId,
        },
      },
      expect.any(Function),
    );
    expect(tracing.span.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        "spectra.knowledge.candidate_count": 3,
        "spectra.knowledge.evidence_count": 1,
        "spectra.knowledge.status": "ready",
      }),
    );
    expect(JSON.stringify(tracing.startActiveSpan.mock.calls)).not.toContain("private search text");
    expect(tracing.span.setStatus).toHaveBeenCalledWith({ code: 1 });
    expect(tracing.span.end).toHaveBeenCalledOnce();
  });

  test("marks and ends an unexpected search failure", async () => {
    vi.mocked(searchWorkspaceKnowledgeWithDependencies).mockRejectedValue(
      new Error("provider secret response"),
    );

    await expect(
      searchWorkspaceKnowledge({
        actor: {} as never,
        query: "private search text",
        workspaceId,
      }),
    ).rejects.toThrow("provider secret response");

    expect(tracing.span.setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        "spectra.failure.code": "knowledge_search_failed",
      }),
    );
    expect(tracing.span.setStatus).toHaveBeenCalledWith({
      code: 2,
      message: "knowledge_search_failed",
    });
    expect(JSON.stringify(tracing.span.setAttributes.mock.calls)).not.toContain(
      "provider secret response",
    );
    expect(tracing.span.end).toHaveBeenCalledOnce();
  });
});
