import { beforeEach, expect, test, vi } from "vitest";
import { artifactSuggestionRequestFailed } from "./suggestion-dbos";

const { getStatus } = vi.hoisted(() => ({ getStatus: vi.fn() }));
vi.mock("@/features/artifacts/dbos-client.server", () => ({
  artifactDbosClient: vi.fn(async () => ({
    retrieveWorkflow: vi.fn(() => ({ getStatus })),
  })),
}));
beforeEach(() => getStatus.mockReset());
const args = ["workspace", "zh-CN", "presentation", "request"] as const;

test("detects terminal failure with no retry workflow", async () => {
  getStatus
    .mockResolvedValueOnce({ status: "ERROR", updatedAt: 123 })
    .mockResolvedValueOnce(undefined);
  expect(await artifactSuggestionRequestFailed(...args)).toBe(true);
});
test("continues waiting for an existing retry instead of reporting the old error", async () => {
  getStatus
    .mockResolvedValueOnce({ status: "ERROR", updatedAt: 123 })
    .mockResolvedValue({ status: "ENQUEUED" });
  expect(await artifactSuggestionRequestFailed(...args)).toBe(false);
});
test("does not classify a running or missing workflow as failed", async () => {
  getStatus.mockResolvedValueOnce({ status: "PENDING" });
  expect(await artifactSuggestionRequestFailed(...args)).toBe(false);
  getStatus.mockResolvedValueOnce(undefined);
  expect(await artifactSuggestionRequestFailed(...args)).toBe(false);
});
test("ends waiting when a workflow completed without the expected snapshot", async () => {
  getStatus.mockResolvedValueOnce({ status: "SUCCESS" });
  expect(await artifactSuggestionRequestFailed(...args)).toBe(true);
});
