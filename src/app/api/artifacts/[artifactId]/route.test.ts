import { beforeEach, expect, test, vi } from "vitest";
import { getArtifactDetailForConversation } from "@/features/artifacts/workbench-server";
import { getCurrentActor } from "@/features/identity/current";
import { deleteWorkbenchArtifact } from "@/features/workspaces/artifact-deletion.server";
import { DELETE, GET } from "./route";

vi.mock("@/features/identity/current", () => ({ getCurrentActor: vi.fn() }));
vi.mock("@/features/artifacts/workbench-server", () => ({
  getArtifactDetailForConversation: vi.fn(),
}));
vi.mock("@/features/workspaces/artifact-deletion.server", () => ({
  deleteWorkbenchArtifact: vi.fn(),
}));

const actor = { handle: "alice", principalId: "00000000-0000-4000-8000-000000000411" };
const workspaceId = "00000000-0000-4000-8000-000000000412";
const conversationId = "00000000-0000-4000-8000-000000000413";
const artifactId = "00000000-0000-4000-8000-000000000414";

beforeEach(() => {
  vi.mocked(getCurrentActor).mockReset().mockResolvedValue(actor);
  vi.mocked(getArtifactDetailForConversation).mockReset().mockResolvedValue({
    artifact: null,
    createdAt: "2026-07-18T00:00:00.000Z",
    draft: null,
    failureCode: null,
    generationState: "queued",
    id: artifactId,
    kind: "teaching_document",
    generationAttemptId: null,
    generationSequence: 0,
    title: "Doc",
    updatedAt: "2026-07-18T00:00:00.000Z",
    workspaceId,
  });
  vi.mocked(deleteWorkbenchArtifact).mockReset().mockResolvedValue(undefined);
});

test("deletes an Artifact within its conversation scope", async () => {
  const response = await DELETE(
    new Request(
      `http://localhost/api/artifacts/${artifactId}?workspaceId=${workspaceId}&conversationId=${conversationId}`,
      { method: "DELETE" },
    ),
    { params: Promise.resolve({ artifactId }) },
  );
  expect(response.status).toBe(204);
  expect(deleteWorkbenchArtifact).toHaveBeenCalledWith(actor, {
    artifactId,
    conversationId,
    workspaceId,
  });
});

test("reads an Artifact without exposing its concrete route to Workbench", async () => {
  const response = await GET(
    new Request(
      `http://localhost/api/artifacts/${artifactId}?workspaceId=${workspaceId}&conversationId=${conversationId}`,
    ),
    { params: Promise.resolve({ artifactId }) },
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(getArtifactDetailForConversation).toHaveBeenCalledWith(actor, {
    artifactId,
    conversationId,
    workspaceId,
  });
});

test("rejects a malformed generic detail scope before authentication", async () => {
  const response = await GET(
    new Request(
      `http://localhost/api/artifacts/${artifactId}?workspaceId=bad&conversationId=${conversationId}`,
    ),
    { params: Promise.resolve({ artifactId }) },
  );
  expect(response.status).toBe(400);
  expect(getCurrentActor).not.toHaveBeenCalled();
});
