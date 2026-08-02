import { expect, test, vi } from "vitest";
import { deleteArtifactForConversationWithCleanup } from "@/features/artifacts/workbench-server";
import { createArtifactCleanupQueue } from "@/features/maintenance/cleanup-dbos";
import { deleteWorkbenchArtifact } from "./artifact-deletion.server";

vi.mock("@/database/client", () => ({ database: { kind: "database" } }));
vi.mock("@/features/artifacts/workbench-server", () => ({
  deleteArtifactForConversationWithCleanup: vi.fn(),
}));
vi.mock("@/features/maintenance/cleanup-dbos", () => ({
  createArtifactCleanupQueue: vi.fn(),
}));

test("owns the Maintenance adapter outside the Artifact module", async () => {
  const actor = { handle: "alice", principalId: "00000000-0000-4000-8000-000000000411" };
  const input = {
    artifactId: "00000000-0000-4000-8000-000000000412",
    conversationId: "00000000-0000-4000-8000-000000000413",
    workspaceId: "00000000-0000-4000-8000-000000000414",
  };
  const queue = { enqueue: vi.fn().mockResolvedValue(undefined) };
  vi.mocked(createArtifactCleanupQueue).mockReturnValue(queue);

  await deleteWorkbenchArtifact(actor, input);

  expect(deleteArtifactForConversationWithCleanup).toHaveBeenCalledWith(actor, input, queue, {
    kind: "database",
  });
});
