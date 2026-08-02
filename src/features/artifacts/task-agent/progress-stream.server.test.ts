import { expect, test } from "vitest";
import { serializeTaskAgentProgressEvent } from "./progress-stream.server";

test("measures progress events as serialized UTF-8 bytes", () => {
  const serialized = serializeTaskAgentProgressEvent({ page: "演示" }, 10, {
    maxEventBytes: 100,
    maxTotalBytes: 100,
  });

  expect(serialized.totalBytes).toBe(10 + new TextEncoder().encode(serialized.body).byteLength);
});

test("rejects a single oversized progress event", () => {
  expect(() =>
    serializeTaskAgentProgressEvent({ page: "oversized" }, 0, {
      maxEventBytes: 4,
      maxTotalBytes: 100,
    }),
  ).toThrow("task_agent_progress_stream_size");
});

test("rejects a progress stream that exceeds its aggregate budget", () => {
  expect(() =>
    serializeTaskAgentProgressEvent({ page: "delta" }, 90, {
      maxEventBytes: 100,
      maxTotalBytes: 100,
    }),
  ).toThrow("task_agent_progress_stream_size");
});
