import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import {
  createMinerUProvider,
  MINERU_FORCE_KILL_AFTER_MS,
  MINERU_POLL_CALL_TIMEOUT_MS,
  runMinerUChild,
} from "./mineru";

const fixtureUrl = new URL("./mineru-process.fixture.ts", import.meta.url);

test("bounds every supervised MinerU poll", () => {
  expect(MINERU_POLL_CALL_TIMEOUT_MS).toBe(2 * 60 * 1_000);
  expect(MINERU_FORCE_KILL_AFTER_MS).toBe(1_000);
});

test("rejects an explicitly empty MinerU credential", () => {
  expect(() => createMinerUProvider("  ")).toThrow();
});

test("terminates a MinerU subprocess that exceeds its wall-clock budget", async () => {
  await expect(
    runMinerUChild(
      { operation: "submit", filePath: "/tmp/source.pdf", ingestionId: randomUUID() },
      "test-token",
      { childUrl: fixtureUrl, timeoutMs: 100 },
    ),
  ).rejects.toMatchObject({ errorCode: "mineru_timeout", retryable: true });
});

test("terminates an active MinerU subprocess during worker shutdown", async () => {
  const controller = new AbortController();
  const running = runMinerUChild(
    { operation: "submit", filePath: "/tmp/source.pdf", ingestionId: randomUUID() },
    "test-token",
    { cancelSignal: controller.signal, childUrl: fixtureUrl, timeoutMs: 10_000 },
  );
  controller.abort();

  await expect(running).rejects.toMatchObject({
    errorCode: "mineru_unavailable",
    retryable: true,
  });
});

test("contains a MinerU subprocess that aborts under its resource boundary", async () => {
  await expect(
    runMinerUChild({ operation: "poll", batchId: "batch" }, "test-token", {
      childUrl: fixtureUrl,
    }),
  ).rejects.toMatchObject({ errorCode: "mineru_resource_limit", retryable: false });
}, 15_000);
