import { beforeEach, expect, test, vi } from "vitest";
import { waitForTaskAgentTerminal } from "./executor";

const sleep = vi.fn(async () => undefined);

beforeEach(() => {
  sleep.mockClear();
});

test("waits for the existing conversation to finish", async () => {
  const inspect = vi
    .fn()
    .mockResolvedValueOnce({ found: true, status: "running" })
    .mockResolvedValueOnce({ found: true, status: "finished" });
  const result = await waitForTaskAgentTerminal({
    budget: { pollIntervalMs: 5_000 },
    inspect,
    remainingPolls: 10,
    sleep,
  });
  expect(result.status).toBe("finished");
  expect(inspect).toHaveBeenCalledTimes(2);
});

test("treats a stuck conversation as a terminal attempt failure", async () => {
  const inspect = vi.fn().mockResolvedValueOnce({ found: true, status: "stuck" });
  const result = await waitForTaskAgentTerminal({
    budget: { pollIntervalMs: 5_000 },
    inspect,
    remainingPolls: 10,
    sleep,
  });
  expect(result.status).toBe("stuck");
  expect(sleep).not.toHaveBeenCalled();
});

test("does not recreate a missing conversation", async () => {
  const result = await waitForTaskAgentTerminal({
    budget: { pollIntervalMs: 5_000 },
    inspect: vi.fn(async () => ({ found: false, status: null })),
    remainingPolls: 10,
    sleep,
  });
  expect(result.status).toBe("missing");
});
