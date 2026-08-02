import { describe, expect, it } from "vitest";
import { scoreAgenticRagTrajectory } from "./agentic-rag-eval";

describe("Mastra Agentic RAG trajectory policy", () => {
  it("accepts retrieval-first Artifact creation", async () => {
    const expected = [
      { name: "search_workspace", stepType: "tool_call" as const },
      { name: "create_artifacts", stepType: "tool_call" as const },
    ];
    await expect(
      scoreAgenticRagTrajectory(
        { id: "artifact-grounded", expected, ordering: "strict" },
        expected,
      ),
    ).resolves.toMatchObject({ score: 1 });
  });

  it("rejects an extra fifth Workspace search", async () => {
    const expected = Array.from({ length: 4 }, (_, index) => ({
      name: "search_workspace",
      stepType: "tool_call" as const,
      toolArgs: { purpose: index === 0 ? "initial" : "verify", round: index + 1 },
    }));
    const result = await scoreAgenticRagTrajectory(
      { id: "four-search-limit", expected, ordering: "strict" },
      [
        ...expected,
        {
          name: "search_workspace",
          stepType: "tool_call",
          toolArgs: { purpose: "verify", round: 5 },
        },
      ],
    );
    expect(result.score).toBeLessThan(1);
  });

  it("does not normalize provider provenance into an executable Agent tool", async () => {
    await expect(
      scoreAgenticRagTrajectory(
        {
          id: "web-provenance",
          expected: [{ name: "web_search", stepType: "provider_tool_call" }],
          ordering: "strict",
        },
        [{ name: "web_search", stepType: "tool_call" }],
      ),
    ).rejects.toThrow("agentic_rag_provenance_mismatch:web_search");
  });
});
