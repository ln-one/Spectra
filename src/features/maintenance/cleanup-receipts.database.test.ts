import { randomUUID } from "node:crypto";
import { createMigratedTestDatabase } from "@tests/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupScopeHasFailure, recordCleanupReceipt } from "./cleanup-receipts";

let testDatabase: Awaited<ReturnType<typeof createMigratedTestDatabase>>;

beforeAll(async () => {
  testDatabase = await createMigratedTestDatabase();
});

afterAll(async () => {
  await testDatabase.destroy();
});

describe("cleanup receipts", () => {
  it("retries one owned resource by replacing failure with a successful receipt", async () => {
    const scopeId = randomUUID();
    const resource = {
      owner: "artifact_task_agent",
      resourceId: "artifacts/example/source/final.tar.gz",
      resourceType: "versioned_object_key",
      scopeId,
      scopeType: "artifact" as const,
    };
    const failed = await recordCleanupReceipt(testDatabase.db, {
      ...resource,
      failureCode: "storage_unavailable",
      outcome: "failed",
    });
    expect(failed).toMatchObject({ attemptNumber: 1, outcome: "failed" });
    expect(await cleanupScopeHasFailure(testDatabase.db, { scopeId, scopeType: "artifact" })).toBe(
      true,
    );

    const recovered = await recordCleanupReceipt(testDatabase.db, {
      ...resource,
      outcome: "deleted",
    });
    expect(recovered).toMatchObject({ attemptNumber: 2, failureCode: null, outcome: "deleted" });
    expect(await cleanupScopeHasFailure(testDatabase.db, { scopeId, scopeType: "artifact" })).toBe(
      false,
    );
  });
});
