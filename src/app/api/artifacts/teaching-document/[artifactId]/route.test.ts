import { beforeEach, expect, test, vi } from "vitest";
import { saveTeachingDocumentRevision } from "@/features/artifacts/documents/service";
import { getCurrentActor } from "@/features/identity/current";
import { POST } from "./route";

vi.mock("@/features/identity/current", () => ({ getCurrentActor: vi.fn() }));
vi.mock("@/features/artifacts/documents/service", () => ({
  saveTeachingDocumentRevision: vi.fn(),
}));

const actor = { handle: "alice", principalId: "00000000-0000-4000-8000-000000000411" };
const workspaceId = "00000000-0000-4000-8000-000000000412";
const conversationId = "00000000-0000-4000-8000-000000000413";
const artifactId = "00000000-0000-4000-8000-000000000414";
const revisionId = "00000000-0000-4000-8000-000000000415";
const artifact = {
  createdAt: "2026-07-18T00:00:00.000Z",
  currentRevision: {
    artifactId,
    content: {
      document: {
        content: [
          {
            attrs: { id: "paragraph-1" },
            content: [{ text: "Body", type: "text" as const }],
            type: "paragraph" as const,
          },
        ],
        type: "doc" as const,
      },
      generation: { outcome: "complete" as const, rawOutput: "Body", warnings: [] },
      schemaVersion: 2 as const,
      sourceMarkdown: "Body",
      title: "Doc",
    },
    contentSha256: "a".repeat(64),
    createdAt: "2026-07-18T00:00:00.000Z",
    id: revisionId,
    parentRevisionId: null,
    revisionNumber: 1,
  },
  id: artifactId,
  title: "Doc",
  updatedAt: "2026-07-18T00:00:00.000Z",
  workspaceId,
};

beforeEach(() => {
  vi.mocked(getCurrentActor).mockReset().mockResolvedValue(actor);
  vi.mocked(saveTeachingDocumentRevision).mockReset().mockResolvedValue(artifact);
});

test("writes a revision through the same authorized conversation scope", async () => {
  const response = await POST(
    new Request(
      `http://localhost/api/artifacts/teaching-document/${artifactId}?workspaceId=${workspaceId}&conversationId=${conversationId}`,
      {
        body: JSON.stringify({
          content: artifact.currentRevision.content,
          expectedRevisionId: revisionId,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    ),
    { params: Promise.resolve({ artifactId }) },
  );
  expect(response.status).toBe(200);
  expect(saveTeachingDocumentRevision).toHaveBeenCalledWith(actor, {
    artifactId,
    content: artifact.currentRevision.content,
    conversationId,
    expectedRevisionId: revisionId,
    workspaceId,
  });
});

test("rejects a revision write without conversation scope before authentication", async () => {
  const response = await POST(
    new Request(`http://localhost/api/artifacts/teaching-document/${artifactId}`, {
      body: JSON.stringify({
        content: artifact.currentRevision.content,
        expectedRevisionId: revisionId,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
    { params: Promise.resolve({ artifactId }) },
  );
  expect(response.status).toBe(400);
  expect(getCurrentActor).not.toHaveBeenCalled();
  expect(saveTeachingDocumentRevision).not.toHaveBeenCalled();
});
