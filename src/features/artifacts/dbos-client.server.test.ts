import { expect, test, vi } from "vitest";
import { cancelArtifactDbosExecution } from "./dbos-client.server";

test("retains the durable cancellation fence after cancelling an Artifact workflow", async () => {
  const calls: string[] = [];
  const cancelWorkflow = vi.fn(async () => {
    calls.push("cancel");
  });
  const deleteWorkflow = vi.fn(async () => {
    calls.push("delete");
  });
  await cancelArtifactDbosExecution("00000000-0000-4000-8000-000000000901", async () => ({
    cancelWorkflow,
  }));
  expect(calls).toEqual(["cancel"]);
  expect(cancelWorkflow).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000901", {
    cancelChildren: true,
  });
  expect(deleteWorkflow).not.toHaveBeenCalled();
});

test("reports cancellation failure for a later cleanup retry", async () => {
  await expect(
    cancelArtifactDbosExecution("00000000-0000-4000-8000-000000000902", async () => ({
      cancelWorkflow: vi.fn(async () => {
        throw new Error("cancel failed");
      }),
    })),
  ).rejects.toThrow("cancel failed");
});
