import { beforeEach, expect, test, vi } from "vitest";
import { database } from "@/database/client";
import { requireWorkspacePermission } from "@/features/workspaces/access.server";
import { publishArtifactSource } from "./artifact-source-membership.server";

const loggerError = vi.hoisted(() => vi.fn());
const databaseTransaction = vi.hoisted(() => vi.fn());

vi.mock("@/database/client", () => ({
  database: { transaction: databaseTransaction },
  productPool: {},
}));
vi.mock("@/features/knowledge/dbos", () => ({
  enqueueKnowledgeIndexWorkflow: vi.fn(),
}));
vi.mock("@/features/workspaces/access.server", () => ({
  requireWorkspacePermission: vi.fn(),
}));
vi.mock("@/observability/server", () => ({
  safeLogError: (error: Error) => ({ message: error.message, type: error.name }),
  webLogger: { error: loggerError },
}));

const actor = { handle: "alice", principalId: "00000000-0000-4000-8000-000000000461" };
const input = {
  artifactId: "00000000-0000-4000-8000-000000000462",
  conversationId: "00000000-0000-4000-8000-000000000463",
  workspaceId: "00000000-0000-4000-8000-000000000464",
};
const generation = {
  generationId: "00000000-0000-4000-8000-000000000465",
  workflowId: "knowledge-index:00000000-0000-4000-8000-000000000465",
};
const source = { id: "00000000-0000-4000-8000-000000000466" };

beforeEach(() => {
  vi.mocked(requireWorkspacePermission)
    .mockReset()
    .mockResolvedValue({
      id: input.workspaceId,
      ownerId: actor.principalId,
      permissions: ["artifact.publishToSources", "workspace.read"],
      visibility: "private",
    });
  databaseTransaction.mockReset();
  loggerError.mockReset();
});

test("dispatches the staged Knowledge generation returned by the membership transaction", async () => {
  databaseTransaction.mockResolvedValue({ generation, source, sourceId: source.id });
  const enqueueKnowledgeIndex = vi.fn().mockResolvedValue(undefined);

  await expect(
    publishArtifactSource(actor, input, {
      enqueueKnowledgeIndex,
    }),
  ).resolves.toEqual({ generation, source, sourceId: source.id });

  expect(requireWorkspacePermission).toHaveBeenCalledWith(
    actor,
    input.workspaceId,
    "artifact.publishToSources",
    database,
  );
  expect(databaseTransaction).toHaveBeenCalledOnce();
  expect(enqueueKnowledgeIndex).toHaveBeenCalledWith(generation);
});

test("keeps the committed membership when immediate dispatch fails", async () => {
  databaseTransaction.mockResolvedValue({ generation, source, sourceId: source.id });
  const error = new Error("queue unavailable");

  await expect(
    publishArtifactSource(actor, input, {
      enqueueKnowledgeIndex: vi.fn().mockRejectedValue(error),
    }),
  ).resolves.toEqual({ generation, source, sourceId: source.id });

  expect(loggerError).toHaveBeenCalledWith(
    expect.objectContaining({
      artifactId: input.artifactId,
      event: "artifact.source.indexing_dispatch_failed",
      retryable: true,
      workspaceId: input.workspaceId,
    }),
    "Artifact Source indexing dispatch failed",
  );
});
