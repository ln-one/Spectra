import { beforeEach, expect, test, vi } from "vitest";
import {
  dismissCurrentArtifactEditProposal,
  getCurrentArtifactEditProposal,
} from "@/features/artifacts/proposal-service.server";
import { getCurrentActor } from "@/features/identity/current";
import { DELETE, GET } from "./route";

vi.mock("@/features/identity/current", () => ({ getCurrentActor: vi.fn() }));
vi.mock("@/features/artifacts/proposal-service.server", () => ({
  dismissCurrentArtifactEditProposal: vi.fn(),
  getCurrentArtifactEditProposal: vi.fn(),
}));

const actor = { handle: "alice", principalId: "00000000-0000-4000-8000-000000000421" };
const workspaceId = "00000000-0000-4000-8000-000000000422";
const conversationId = "00000000-0000-4000-8000-000000000423";
const artifactId = "00000000-0000-4000-8000-000000000424";
const proposal = {
  artifactId,
  baseRevisionId: "00000000-0000-4000-8000-000000000425",
  edits: [{ blockId: "paragraph", operation: "delete_block" as const }],
  kind: "teaching_document" as const,
  request: "删除这一段",
  runId: "00000000-0000-4000-8000-000000000426",
  summary: "删除重复段落",
  title: "网络基础",
};

function request(method = "GET", includeRunId = method === "DELETE") {
  const runId = includeRunId ? `&runId=${proposal.runId}` : "";
  return new Request(
    `http://localhost/api/artifacts/${artifactId}/proposal?workspaceId=${workspaceId}&conversationId=${conversationId}${runId}`,
    { method },
  );
}

beforeEach(() => {
  vi.mocked(getCurrentActor).mockReset().mockResolvedValue(actor);
  vi.mocked(getCurrentArtifactEditProposal).mockReset().mockResolvedValue(proposal);
  vi.mocked(dismissCurrentArtifactEditProposal).mockReset().mockResolvedValue(undefined);
});

test("restores the current persisted proposal", async () => {
  const response = await GET(request(), { params: Promise.resolve({ artifactId }) });
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ proposal });
  expect(getCurrentArtifactEditProposal).toHaveBeenCalledWith(actor, {
    artifactId,
    conversationId,
    workspaceId,
  });
});

test("dismisses the current persisted proposal", async () => {
  const response = await DELETE(request("DELETE"), { params: Promise.resolve({ artifactId }) });
  expect(response.status).toBe(204);
  expect(dismissCurrentArtifactEditProposal).toHaveBeenCalledWith(actor, {
    artifactId,
    conversationId,
    runId: proposal.runId,
    workspaceId,
  });
});

test("requires a proposal run when dismissing", async () => {
  const response = await DELETE(request("DELETE", false), {
    params: Promise.resolve({ artifactId }),
  });
  expect(response.status).toBe(400);
  expect(getCurrentActor).not.toHaveBeenCalled();
});

test("rejects malformed scope before authentication", async () => {
  const response = await GET(
    new Request(
      `http://localhost/api/artifacts/${artifactId}/proposal?workspaceId=bad&conversationId=${conversationId}`,
    ),
    { params: Promise.resolve({ artifactId }) },
  );
  expect(response.status).toBe(400);
  expect(getCurrentActor).not.toHaveBeenCalled();
});
