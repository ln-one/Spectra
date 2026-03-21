import {
  dedupeGenerationHistory,
  resolvePreferredSessionId,
} from "@/app/projects/[id]/_views/useProjectPanelLayout";
import type { GenerationHistory } from "@/stores/projectStore";

const history = (ids: string[]): GenerationHistory[] =>
  ids.map((id, index) => ({
    id,
    toolId: "ppt",
    toolName: "课件生成",
    status: "completed",
    sessionState: "SUCCESS",
    createdAt: `2026-03-20T00:0${index}:00.000Z`,
    title: `会话 ${id}`,
  }));

describe("resolvePreferredSessionId", () => {
  it("prefers the session from the URL when it exists", () => {
    expect(
      resolvePreferredSessionId("s-2", history(["s-3", "s-2"]), null)
    ).toBe("s-2");
  });

  it("keeps the current active session when it is still available", () => {
    expect(
      resolvePreferredSessionId(null, history(["s-3", "s-2"]), "s-2")
    ).toBe("s-2");
  });

  it("falls back to the latest known session instead of clearing context", () => {
    expect(resolvePreferredSessionId(null, history(["s-3", "s-2"]), null)).toBe(
      "s-3"
    );
  });

  it("returns null when the project has no sessions yet", () => {
    expect(resolvePreferredSessionId(null, [], null)).toBeNull();
  });

  it("keeps active session when history is not loaded yet", () => {
    expect(resolvePreferredSessionId(null, [], "s-active")).toBe("s-active");
  });

  it("keeps query session when history is not loaded yet", () => {
    expect(resolvePreferredSessionId("s-query", [], null)).toBe("s-query");
  });
});

describe("dedupeGenerationHistory", () => {
  it("keeps only the first occurrence for duplicated session ids", () => {
    const items = history(["s-3", "s-2"]);
    const duplicated = [items[0], items[1], { ...items[0], title: "dup" }];
    expect(dedupeGenerationHistory(duplicated)).toEqual([items[0], items[1]]);
  });
});
