import { afterEach, expect, test, vi } from "vitest";
import type { TeachingDocumentDetail } from "./documents/types";
import {
  ArtifactDetailError,
  artifactHasRenderableContent,
  artifactWorkbenchQueryKeys,
  dismissArtifactProposal,
  fetchArtifactDetail,
  fetchArtifactHistory,
  fetchCurrentArtifactProposal,
  parseArtifactStreamEvent,
  upsertArtifactHistory,
} from "./workbench-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

const detail: TeachingDocumentDetail = {
  artifact: null,
  createdAt: "2026-07-18T01:00:00.000Z",
  draft: null,
  failureCode: null,
  generationState: "queued",
  id: "00000000-0000-4000-8000-000000000201",
  kind: "teaching_document",
  generationAttemptId: null,
  generationSequence: 0,
  title: "Document",
  updatedAt: "2026-07-18T01:00:00.000Z",
  workspaceId: "00000000-0000-4000-8000-000000000203",
};

test("uses kind-neutral cache keys for history and details", () => {
  expect(artifactWorkbenchQueryKeys.history("workspace", "conversation")).toEqual([
    "workspace",
    "workspace",
    "conversation",
    "conversation",
    "artifacts",
  ]);
  expect(artifactWorkbenchQueryKeys.detail("workspace", "conversation", "artifact")).toEqual([
    "workspace",
    "workspace",
    "conversation",
    "conversation",
    "artifact",
    "artifact",
  ]);
  expect(artifactWorkbenchQueryKeys.proposal("workspace", "conversation", "artifact")).toEqual([
    "workspace",
    "workspace",
    "conversation",
    "conversation",
    "artifact",
    "artifact",
    "proposal",
  ]);
});

test("normalizes a concrete stream part at the Artifact boundary", () => {
  expect(parseArtifactStreamEvent({ data: detail, type: "data-artifactStarted" })).toEqual({
    detail,
    type: "started",
  });
  expect(parseArtifactStreamEvent({ data: detail, name: "artifactStarted", type: "data" })).toEqual(
    { detail, type: "started" },
  );
  expect(
    parseArtifactStreamEvent({ data: detail, type: "data-obsoleteArtifactStarted" }),
  ).toBeNull();
  expect(parseArtifactStreamEvent({ data: detail, type: "data-unknown" })).toBeNull();
});

test("updates generic History without duplicating an Artifact", () => {
  const history = upsertArtifactHistory(
    [{ ...detail, currentRevisionId: null, title: "Old" }],
    detail,
  );
  expect(history).toHaveLength(1);
  expect(history[0]).toMatchObject({ id: detail.id, kind: detail.kind, title: detail.title });
});

test("updates detail caches without creating a new History membership", () => {
  expect(upsertArtifactHistory([], detail, { insertIfMissing: false })).toEqual([]);
});

test("does not let a persisted started event regress ready History", () => {
  const history = upsertArtifactHistory(
    [
      {
        ...detail,
        currentRevisionId: "00000000-0000-4000-8000-000000000205",
        generationState: "ready",
        updatedAt: "2026-07-18T01:10:00.000Z",
      },
    ],
    detail,
  );

  expect(history).toEqual([
    expect.objectContaining({
      currentRevisionId: "00000000-0000-4000-8000-000000000205",
      generationState: "ready",
    }),
  ]);
});

test("keeps type-specific renderability outside Workbench orchestration", () => {
  expect(artifactHasRenderableContent(detail)).toBe(false);
  const generatingDetail: TeachingDocumentDetail = {
    ...detail,
    artifact: null,
    failureCode: null,
    generationAttemptId: "00000000-0000-4000-8000-000000000204",
    generationState: "generating",
    draft: {
      format: "markdown",
      markdown: "# Streaming document\n\nStreaming",
    },
  };
  expect(artifactHasRenderableContent(generatingDetail)).toBe(true);
});

test("distinguishes a deleted Artifact from a transient detail failure", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 404 })),
  );
  await expect(
    fetchArtifactDetail({
      artifactId: detail.id,
      conversationId: "00000000-0000-4000-8000-000000000202",
      workspaceId: detail.workspaceId,
    }),
  ).rejects.toEqual(new ArtifactDetailError("not_found"));

  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 503 })),
  );
  await expect(
    fetchArtifactDetail({
      artifactId: detail.id,
      conversationId: "00000000-0000-4000-8000-000000000202",
      workspaceId: detail.workspaceId,
    }),
  ).rejects.toEqual(new ArtifactDetailError("unavailable"));
});

test("bypasses browser caches for mutable Artifact reads", async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
    String(input).startsWith("/api/artifacts?")
      ? Response.json({ artifacts: [] })
      : Response.json({ detail }),
  );
  vi.stubGlobal("fetch", fetchMock);

  await fetchArtifactHistory(detail.workspaceId, "00000000-0000-4000-8000-000000000202");
  await fetchArtifactDetail({
    artifactId: detail.id,
    conversationId: "00000000-0000-4000-8000-000000000202",
    workspaceId: detail.workspaceId,
  });

  expect(fetchMock).toHaveBeenNthCalledWith(1, expect.stringContaining("/api/artifacts?"), {
    cache: "no-store",
  });
  expect(fetchMock).toHaveBeenNthCalledWith(
    2,
    expect.stringContaining(`/api/artifacts/${detail.id}?`),
    { cache: "no-store" },
  );
});

test("loads and dismisses the persisted Artifact proposal through the generic boundary", async () => {
  const proposal = {
    artifactId: detail.id,
    baseRevisionId: "00000000-0000-4000-8000-000000000204",
    edits: [{ blockId: "paragraph", operation: "delete_block" as const }],
    kind: "teaching_document" as const,
    request: "删除这一段",
    runId: "00000000-0000-4000-8000-000000000205",
    summary: "删除重复段落",
    title: "Document",
  };
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
    init?.method === "DELETE" ? new Response(null, { status: 204 }) : Response.json({ proposal }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const input = {
    artifactId: detail.id,
    conversationId: "00000000-0000-4000-8000-000000000202",
    workspaceId: detail.workspaceId,
  };

  await expect(fetchCurrentArtifactProposal(input)).resolves.toEqual(proposal);
  await expect(
    dismissArtifactProposal({ ...input, runId: proposal.runId }),
  ).resolves.toBeUndefined();
  expect(fetchMock).toHaveBeenNthCalledWith(
    1,
    expect.stringContaining(`/api/artifacts/${detail.id}/proposal?`),
    { cache: "no-store" },
  );
  expect(fetchMock).toHaveBeenNthCalledWith(
    2,
    expect.stringMatching(
      new RegExp(`/api/artifacts/${detail.id}/proposal\\?.*runId=${proposal.runId}`),
    ),
    { method: "DELETE" },
  );
});
