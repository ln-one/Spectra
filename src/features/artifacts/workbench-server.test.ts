import { beforeEach, expect, test, vi } from "vitest";
import type { Database } from "@/database/client";
import { TeachingDocumentError } from "./documents/errors";
import {
  deleteTeachingDocumentForConversation,
  getTeachingDocumentDetailForConversation,
} from "./documents/service";
import { ArtifactError } from "./errors";
import { getArtifactDetailForConversation, listArtifactHistory } from "./workbench-server";

vi.mock("@/features/workspaces/access.server", () => ({
  requireWorkspacePermission: vi.fn().mockResolvedValue({ permissions: ["workspace.read"] }),
}));

vi.mock("./documents/service", () => ({
  deleteTeachingDocumentForConversation: vi.fn(),
  getTeachingDocumentDetailForConversation: vi.fn(),
  startTeachingDocumentGeneration: vi.fn(),
}));

const actor = { handle: "alice", principalId: "00000000-0000-4000-8000-000000000401" };
const scope = {
  conversationId: "00000000-0000-4000-8000-000000000402",
  workspaceId: "00000000-0000-4000-8000-000000000403",
};

beforeEach(() => {
  vi.mocked(deleteTeachingDocumentForConversation).mockReset();
  vi.mocked(getTeachingDocumentDetailForConversation).mockReset();
});

function databaseReturning(rows: readonly unknown[]) {
  const limit = vi.fn(async () => rows);
  const query = {
    limit,
    orderBy: () => ({ limit }),
  };
  const from = {
    innerJoin: () => ({ where: () => query }),
    where: () => query,
  };
  return {
    select: () => ({ from: () => from }),
  } as unknown as Database;
}

test("lists generic Artifact history without a per-kind registration", async () => {
  await expect(listArtifactHistory(actor, scope, databaseReturning([]))).resolves.toEqual([]);
});

test("projects an Artifact with a current revision as ready", async () => {
  const timestamp = new Date("2026-07-19T10:00:00.000Z");
  await expect(
    listArtifactHistory(
      actor,
      scope,
      databaseReturning([
        {
          createdAt: timestamp,
          currentRevisionId: "00000000-0000-4000-8000-000000000405",
          generationState: "queued",
          id: "00000000-0000-4000-8000-000000000404",
          kind: "teaching_document",
          title: "Completed document",
          updatedAt: timestamp,
        },
      ]),
    ),
  ).resolves.toEqual([
    expect.objectContaining({
      currentRevisionId: "00000000-0000-4000-8000-000000000405",
      generationState: "ready",
    }),
  ]);
});

test("normalizes concrete detail authorization failures", async () => {
  vi.mocked(getTeachingDocumentDetailForConversation).mockRejectedValue(
    new TeachingDocumentError("teaching_document_not_found"),
  );
  await expect(
    getArtifactDetailForConversation(
      actor,
      {
        ...scope,
        artifactId: "00000000-0000-4000-8000-000000000404",
      },
      databaseReturning([
        {
          conversationId: scope.conversationId,
          createdByPrincipalId: actor.principalId,
          id: "00000000-0000-4000-8000-000000000404",
          kind: "teaching_document",
        },
      ]),
    ),
  ).rejects.toEqual(new ArtifactError("artifact_not_found"));
});
