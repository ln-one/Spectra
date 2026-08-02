import { expect, test } from "vitest";
import { shouldPublishMindMapSnapshot } from "./realtime";

test("keeps Mind Map snapshots capped at four publications per second", () => {
  let lastPublishedAt: number | null = null;
  const publishedAt: number[] = [];
  for (let now = 1_000; now < 2_000; now += 25) {
    if (!shouldPublishMindMapSnapshot(lastPublishedAt, now)) continue;
    publishedAt.push(now);
    lastPublishedAt = now;
  }

  expect(publishedAt).toEqual([1_000, 1_250, 1_500, 1_750]);
});
