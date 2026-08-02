import { beforeEach, expect, test, vi } from "vitest";
import { publishArtifactSource } from "@/features/artifacts/artifact-source-membership.server";
import { getCurrentActor } from "@/features/identity/current";
import { POST } from "./route";

vi.mock("@/features/artifacts/artifact-source-membership.server", () => ({
  publishArtifactSource: vi.fn(),
}));
vi.mock("@/features/identity/current", () => ({ getCurrentActor: vi.fn() }));

const actor = { handle: "alice", principalId: "00000000-0000-4000-8000-000000000451" };
const workspaceId = "00000000-0000-4000-8000-000000000452";
const conversationId = "00000000-0000-4000-8000-000000000453";
const artifactId = "00000000-0000-4000-8000-000000000454";
const sourceId = "00000000-0000-4000-8000-000000000455";
const source = {
  id: sourceId,
  workspaceId,
  kind: "artifact" as const,
  artifact: {
    id: artifactId,
    kind: "teaching_document" as const,
    title: "贝叶斯分类器教学文档",
    conversationId,
    generationState: "ready" as const,
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
    currentRevision: {
      id: "00000000-0000-4000-8000-000000000457",
      revisionNumber: 1,
    },
  },
  createdAt: "2026-07-28T00:00:00.000Z",
  updatedAt: "2026-07-28T00:00:00.000Z",
};
const generation = {
  generationId: "00000000-0000-4000-8000-000000000456",
  workflowId: "knowledge-index:00000000-0000-4000-8000-000000000456",
};

function request() {
  return new Request(
    `http://localhost/api/artifacts/${artifactId}/source?workspaceId=${workspaceId}&conversationId=${conversationId}`,
    { method: "POST" },
  );
}

beforeEach(() => {
  vi.mocked(getCurrentActor).mockReset().mockResolvedValue(actor);
  vi.mocked(publishArtifactSource).mockReset().mockResolvedValue({ generation, source, sourceId });
});

test("publishes an Artifact Source within its conversation scope", async () => {
  const response = await POST(request(), { params: Promise.resolve({ artifactId }) });

  expect(response.status).toBe(201);
  await expect(response.json()).resolves.toEqual({ source });
  expect(publishArtifactSource).toHaveBeenCalledWith(actor, {
    artifactId,
    conversationId,
    workspaceId,
  });
});
