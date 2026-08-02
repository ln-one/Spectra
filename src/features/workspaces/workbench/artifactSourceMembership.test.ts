import { expect, test } from "vitest";
import type { ArtifactHistoryItem } from "@/features/artifacts/types";
import type { ArtifactSource, Source } from "@/features/sources/types";
import { moveArtifactIntoHistory, moveArtifactIntoSources } from "./artifactSourceMembership";

const revisionId = "0198ebec-17f0-7500-8000-000000000102";
const artifact: ArtifactHistoryItem = {
  id: "0198ebec-17f0-7500-8000-000000000101",
  kind: "teaching_document",
  title: "贝叶斯分类器教学文档",
  generationState: "ready",
  currentRevisionId: revisionId,
  createdAt: "2026-07-15T01:00:00.000Z",
  updatedAt: "2026-07-15T02:00:00.000Z",
};

const artifactSource: ArtifactSource = {
  id: "0198ebec-17f0-7500-8000-000000000103",
  workspaceId: "0198ebec-17f0-7500-8000-000000000104",
  kind: "artifact",
  artifact: {
    id: artifact.id,
    kind: "teaching_document",
    title: artifact.title,
    conversationId: "0198ebec-17f0-7500-8000-000000000105",
    generationState: artifact.generationState,
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
    currentRevision: {
      id: revisionId,
      revisionNumber: 1,
    },
  },
  knowledgeIndex: {
    state: "queued",
    chunkCount: 0,
    failureCode: null,
    retryCount: 0,
    nextRetryAt: null,
    updatedAt: artifact.updatedAt,
  },
  createdAt: artifact.createdAt,
  updatedAt: artifact.updatedAt,
};

const uploadedSource: Source = {
  id: "0198ebec-17f0-7500-8000-000000000106",
  workspaceId: artifactSource.workspaceId,
  kind: "uploadedFile",
  originalFilename: "讲义.pdf",
  sizeBytes: 1024,
  state: "stored",
  failureCode: null,
  uploadGeneration: 1,
  uploadExpiresAt: null,
  ingestion: null,
  createdAt: artifact.createdAt,
  updatedAt: artifact.updatedAt,
};

const workspaceSource: Source = {
  id: "0198ebec-17f0-7500-8000-000000000107",
  workspaceId: artifactSource.workspaceId,
  kind: "workspaceReference",
  accessState: "available",
  targetWorkspace: {
    id: "0198ebec-17f0-7500-8000-000000000108",
    name: "计算机网络",
    ownerHandle: "developer",
    canonicalHref: "/developer/computer-network",
    updatedAt: artifact.updatedAt,
  },
  createdAt: artifact.createdAt,
  updatedAt: artifact.updatedAt,
};

const surroundingSources: Source[] = [uploadedSource, workspaceSource];

test("moves a teaching document from History into Sources as one exclusive Artifact", () => {
  const next = moveArtifactIntoSources([artifact], surroundingSources, artifactSource);

  expect(next.history).not.toContainEqual(expect.objectContaining({ id: artifact.id }));
  expect(next.sources.map((source) => source.kind)).toEqual([
    "workspaceReference",
    "artifact",
    "uploadedFile",
  ]);
  expect(
    next.sources.filter(
      (source) => source.kind === "artifact" && source.artifact.id === artifact.id,
    ),
  ).toHaveLength(1);
});

test("moves an Artifact Source back into History without duplicating the Artifact", () => {
  const newerHistoryItem = {
    ...artifact,
    id: "0198ebec-17f0-7500-8000-000000000109",
    updatedAt: "2026-07-16T02:00:00.000Z",
  };
  const next = moveArtifactIntoHistory(
    [newerHistoryItem],
    [workspaceSource, artifactSource, uploadedSource],
    artifactSource,
  );

  expect(next.sources).not.toContainEqual(expect.objectContaining({ id: artifactSource.id }));
  expect(next.history.map((item) => item.id)).toEqual([newerHistoryItem.id, artifact.id]);
  expect(next.history.filter((item) => item.id === artifact.id)).toHaveLength(1);
});

test.each([
  "mind_map",
  "quiz",
  "game",
] as const)("restores the original %s kind when moving back into History", (kind) => {
  const source = {
    ...artifactSource,
    artifact: { ...artifactSource.artifact, kind },
  };
  const next = moveArtifactIntoHistory([], [source, uploadedSource], source);

  expect(next.history).toMatchObject([{ id: artifact.id, kind }]);
  expect(next.sources).toEqual([uploadedSource]);
});
