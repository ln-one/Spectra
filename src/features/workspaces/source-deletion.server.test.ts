import { expect, test, vi } from "vitest";
import { createSourceCleanupQueue } from "@/features/maintenance/cleanup-dbos";
import { deleteSource } from "@/features/sources/service";
import { deleteWorkspaceSource } from "./source-deletion.server";

vi.mock("@/database/client", () => ({ database: { kind: "database" } }));
vi.mock("@/features/maintenance/cleanup-dbos", () => ({
  createSourceCleanupQueue: vi.fn(),
}));
vi.mock("@/features/sources/service", () => ({ deleteSource: vi.fn() }));

test("owns the Maintenance adapter outside the Sources module", async () => {
  const actor = { handle: "alice", principalId: "00000000-0000-4000-8000-000000000421" };
  const queue = { enqueue: vi.fn().mockResolvedValue(undefined) };
  vi.mocked(createSourceCleanupQueue).mockReturnValue(queue);
  vi.mocked(deleteSource).mockResolvedValue({ cleanupPending: true });

  await expect(
    deleteWorkspaceSource(actor, "00000000-0000-4000-8000-000000000422"),
  ).resolves.toEqual({ cleanupPending: true });

  expect(deleteSource).toHaveBeenCalledWith(
    actor,
    "00000000-0000-4000-8000-000000000422",
    expect.objectContaining({
      cleanupQueue: queue,
      db: { kind: "database" },
      now: expect.any(Function),
    }),
  );
});
