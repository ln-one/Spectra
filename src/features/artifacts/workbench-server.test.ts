import { beforeEach, expect, test, vi } from "vitest";
import type { Database } from "@/database/client";
import { TeachingDocumentError } from "./documents/errors";
import {
  deleteTeachingDocumentForConversation,
  getTeachingDocumentDetailForConversation,
} from "./documents/service";
import { ArtifactError } from "./errors";
import {
  getArtifactDetailForConversation,
  listArtifactHistory,
  listWorkspaceArtifactHistory,
} from "./workbench-server";

vi.mock("@/features/workspaces/access.server", () => ({
  requireWorkspacePermission: vi.fn().mockResolvedValue({ permissions: ["workspace.read"] }),
}));

vi.mock("./documents/service", () => ({
  deleteTeachingDocumentForConversation: vi.fn(),
  getTeachingDocumentDetailForConversation: vi.fn(),
  startTeachingDocumentGeneration: vi.fn(),
}));

vi.mock("./task-agent/config.server", () => ({
  animationExecutionEnabled: () => false,
  openHandsExecutionEnabled: () => true,
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

test("lists workspace Artifact navigation with its owning conversation", async () => {
  const timestamp = new Date("2026-07-19T10:00:00.000Z");
  await expect(
    listWorkspaceArtifactHistory(
      actor,
      { workspaceId: scope.workspaceId },
      databaseReturning([
        {
          conversationId: scope.conversationId,
          createdAt: timestamp,
          currentRevisionId: "00000000-0000-4000-8000-000000000405",
          generationState: "queued",
          id: "00000000-0000-4000-8000-000000000404",
          kind: "mind_map",
          title: "Machine learning map",
          updatedAt: timestamp,
        },
      ]),
    ),
  ).resolves.toEqual([
    expect.objectContaining({
      conversationId: scope.conversationId,
      generationState: "ready",
      kind: "mind_map",
    }),
  ]);
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

test("returns source and failure information with retry capability from permissions and runtime", async () => {
  const timestamp = new Date("2026-07-19T10:00:00.000Z");
  const row = {
    createdAt: timestamp,
    currentRevisionId: null,
    failureCode: "presentation_generation_timeout",
    generationState: "failed",
    id: "00000000-0000-4000-8000-000000000404",
    kind: "presentation",
    sourceUserMessageId: "user:123",
    title: "Presentation",
    updatedAt: timestamp,
  };
  const manageAccess = {
    workspaceId: scope.workspaceId,
    permissions: ["workspace.read", "artifact.private.manage"] as const,
  };
  await expect(
    listArtifactHistory(actor, scope, databaseReturning([row]), manageAccess),
  ).resolves.toMatchObject([
    {
      canRetryGeneration: true,
      failureCode: row.failureCode,
      sourceUserMessageId: row.sourceUserMessageId,
    },
  ]);
  await expect(
    listArtifactHistory(
      actor,
      scope,
      databaseReturning([{ ...row, kind: "animation" }]),
      manageAccess,
    ),
  ).resolves.toMatchObject([{ canRetryGeneration: false }]);
  await expect(
    listArtifactHistory(actor, scope, databaseReturning([row]), {
      workspaceId: scope.workspaceId,
      permissions: ["workspace.read"],
    }),
  ).resolves.toMatchObject([{ canRetryGeneration: false }]);
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
