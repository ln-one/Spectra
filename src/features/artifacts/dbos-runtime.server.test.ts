import { expect, test } from "vitest";
import { testServerEnvironment } from "@/environment/test";
import { assertDbosQueuesRegistered, DBOS_QUEUE_NAMES } from "@/worker/dbos-queues.server";
import { artifactDbosExecutorId } from "./executor-identity";

test("uses an explicit DBOS executor identity", () => {
  expect(
    artifactDbosExecutorId(
      testServerEnvironment({ DBOS__VMID: " artifact-2 ", NODE_ENV: "production" }),
    ),
  ).toBe("artifact-2");
  expect(artifactDbosExecutorId(testServerEnvironment())).toBe("spectra-artifacts-local");
  expect(() => artifactDbosExecutorId(testServerEnvironment({ NODE_ENV: "production" }))).toThrow(
    "DBOS__VMID",
  );
});

test("refuses to advertise a ready worker when a configured queue is missing", async () => {
  const missing = DBOS_QUEUE_NAMES.at(-1);
  expect(missing).toBeDefined();
  const pool = {
    query: async () => ({
      rows: DBOS_QUEUE_NAMES.filter((name) => name !== missing).map((name) => ({ name })),
    }),
  };
  await expect(assertDbosQueuesRegistered(pool)).rejects.toThrow(String(missing));
});
