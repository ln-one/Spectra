import { describe, expect, test } from "vitest";
import { formatArtifactHistoryTimestamp, sortArtifactHistory } from "./artifact-history";

describe("artifact history presentation", () => {
  test("sorts by updated time and uses an id tie-breaker", () => {
    expect(
      sortArtifactHistory([
        { id: "z", updatedAt: "2026-07-28T05:00:00.000Z" },
        { id: "b", updatedAt: "2026-07-28T06:00:00.000Z" },
        { id: "a", updatedAt: "2026-07-28T06:00:00.000Z" },
      ]).map(({ id }) => id),
    ).toEqual(["a", "b", "z"]);
  });

  test("includes minutes and adds a year only across years", () => {
    const now = new Date("2026-07-28T14:00:00");
    const sameYear = formatArtifactHistoryTimestamp("2026-07-27T13:04:00", "zh-CN", now);
    const priorYear = formatArtifactHistoryTimestamp("2025-12-27T13:04:00", "zh-CN", now);

    expect(sameYear).toMatch(/7月27日.*13:04/);
    expect(sameYear).not.toContain("2026");
    expect(priorYear).toMatch(/2025年.*12月27日.*13:04/);
  });
});
