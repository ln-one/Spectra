import { beforeEach, expect, test, vi } from "vitest";
import { z } from "zod";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";
import { createArtifactProposalAcceptanceRoute } from "./proposal-acceptance-route";

vi.mock("@/features/identity/current", () => ({ getCurrentActor: vi.fn() }));

const actor = { handle: "alice", principalId: "00000000-0000-4000-8000-000000000411" };
const artifactId = "00000000-0000-4000-8000-000000000412";
const runId = "00000000-0000-4000-8000-000000000413";
const workspaceId = "00000000-0000-4000-8000-000000000414";
const conversationId = "00000000-0000-4000-8000-000000000415";
const expectedRevisionId = "00000000-0000-4000-8000-000000000416";
const accept = vi.fn();

class DomainError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

const POST = createArtifactProposalAcceptanceRoute({
  accept,
  bodySchema: z.object({ expectedRevisionId: z.string().uuid() }).strict(),
  conflictCodes: ["proposal_stale", "artifact_conflict"],
  domainErrorCode: (error) => (error instanceof DomainError ? error.code : null),
  invalidCodes: ["proposal_invalid"],
  invalidRequestCode: "request_invalid",
  unavailableCode: "proposal_unavailable",
});

function request(body: unknown = { expectedRevisionId }) {
  return new Request(
    `http://localhost/api/artifacts/${artifactId}/proposals/${runId}?workspaceId=${workspaceId}&conversationId=${conversationId}`,
    { body: JSON.stringify(body), method: "POST" },
  );
}

beforeEach(() => {
  vi.mocked(getCurrentActor).mockReset().mockResolvedValue(actor);
  accept.mockReset().mockResolvedValue({ acceptedRevisionId: expectedRevisionId });
});

test("validates and forwards the complete proposal scope", async () => {
  const response = await POST(request(), { params: Promise.resolve({ artifactId, runId }) });
  expect(response.status).toBe(200);
  expect(accept).toHaveBeenCalledWith(actor, {
    artifactId,
    conversationId,
    expectedRevisionId,
    runId,
    workspaceId,
  });
});

test("rejects malformed input before authentication", async () => {
  const response = await POST(request({ expectedRevisionId: "bad" }), {
    params: Promise.resolve({ artifactId, runId }),
  });
  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({ detail: { code: "request_invalid" } });
  expect(getCurrentActor).not.toHaveBeenCalled();
});

test.each([
  ["authentication_required", 401],
  ["principal_disabled", 403],
] as const)("maps the %s identity error to %s", async (code, status) => {
  vi.mocked(getCurrentActor).mockRejectedValue(new IdentityError(code));
  const response = await POST(request(), { params: Promise.resolve({ artifactId, runId }) });
  expect(response.status).toBe(status);
  await expect(response.json()).resolves.toEqual({ detail: { code } });
});

test.each([
  ["proposal_stale", 409],
  ["artifact_conflict", 409],
  ["proposal_invalid", 400],
  ["artifact_not_found", 404],
] as const)("maps the %s domain error to %s", async (code, status) => {
  accept.mockRejectedValue(new DomainError(code));
  const response = await POST(request(), { params: Promise.resolve({ artifactId, runId }) });
  expect(response.status).toBe(status);
  await expect(response.json()).resolves.toEqual({ detail: { code } });
});

test("hides unexpected failures behind the unavailable contract", async () => {
  accept.mockRejectedValue(new Error("database credentials"));
  const response = await POST(request(), { params: Promise.resolve({ artifactId, runId }) });
  expect(response.status).toBe(503);
  await expect(response.json()).resolves.toEqual({
    detail: { code: "proposal_unavailable" },
  });
});
