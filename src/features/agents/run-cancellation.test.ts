import { afterEach, describe, expect, it } from "vitest";
import {
  abortAiRun,
  registerAiRunCancellation,
  unregisterAiRunCancellation,
} from "./run-cancellation";

const runId = "10000000-0000-4000-8000-000000000099";

afterEach(() => {
  unregisterAiRunCancellation(runId, registerAiRunCancellation(runId));
});

describe("AI run cancellation", () => {
  it("aborts the registered provider signal and is idempotent", () => {
    const controller = registerAiRunCancellation(runId);

    expect(controller.signal.aborted).toBe(false);
    expect(abortAiRun(runId)).toBe(true);
    expect(controller.signal.aborted).toBe(true);
    expect(abortAiRun(runId)).toBe(true);

    unregisterAiRunCancellation(runId, controller);
    expect(abortAiRun(runId)).toBe(false);
  });

  it("reuses the same signal when execution registration is repeated", () => {
    const first = registerAiRunCancellation(runId);
    const second = registerAiRunCancellation(runId);

    expect(second).toBe(first);
    unregisterAiRunCancellation(runId, first);
    expect(abortAiRun(runId)).toBe(false);
  });
});
