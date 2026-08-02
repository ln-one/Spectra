import { describe, expect, it } from "vitest";
import { shouldScheduleKnowledgeIndexing } from "./dbos-worker";

describe("Source ingestion Knowledge scheduling", () => {
  it("indexes only ready ingestions while Knowledge indexing is enabled", () => {
    expect(shouldScheduleKnowledgeIndexing(true, true)).toBe(true);
    expect(shouldScheduleKnowledgeIndexing(false, true)).toBe(false);
    expect(shouldScheduleKnowledgeIndexing(true, false)).toBe(false);
  });
});
