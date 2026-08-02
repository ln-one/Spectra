import { beforeEach, expect, test, vi } from "vitest";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";
import {
  KnowledgeEvidenceContextUnavailableError,
  readAuthorizedKnowledgeEvidenceContext,
} from "@/features/knowledge/evidence-context.server";
import { webLogger } from "@/observability/server";
import { GET } from "./route";

vi.mock("@/features/identity/current", () => ({ getCurrentActor: vi.fn() }));
vi.mock("@/features/knowledge/evidence-context.server", () => ({
  KnowledgeEvidenceContextUnavailableError: class extends Error {},
  readAuthorizedKnowledgeEvidenceContext: vi.fn(),
}));
vi.mock("@/observability/server", () => ({
  safeLogError: vi.fn(() => ({ message: "safe", type: "Error" })),
  webLogger: { error: vi.fn() },
}));

const actor = { handle: "alice", principalId: "00000000-0000-4000-8000-000000000401" };
const workspaceId = "00000000-0000-4000-8000-000000000402";
const evidenceId = "00000000-0000-4000-8000-000000000403";
const context = {
  evidenceId,
  contextText: "前文\n\n真正命中\n\n后文",
  exactExcerpt: "真正命中",
  highlight: { start: 4, end: 8 },
};

beforeEach(() => {
  vi.mocked(getCurrentActor).mockReset().mockResolvedValue(actor);
  vi.mocked(readAuthorizedKnowledgeEvidenceContext).mockReset().mockResolvedValue(context);
  vi.mocked(webLogger.error).mockReset();
});

test("returns authorized evidence context without public caching", async () => {
  const response = await GET(new Request("http://localhost"), {
    params: Promise.resolve({ workspaceId, evidenceId }),
  });

  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual(context);
  expect(readAuthorizedKnowledgeEvidenceContext).toHaveBeenCalledWith({
    actor,
    workspaceId,
    evidenceId,
  });
});

test("rejects invalid identifiers before authentication", async () => {
  const response = await GET(new Request("http://localhost"), {
    params: Promise.resolve({ workspaceId: "invalid", evidenceId }),
  });

  expect(response.status).toBe(404);
  expect(getCurrentActor).not.toHaveBeenCalled();
});

test("preserves authentication status and hides unavailable evidence", async () => {
  vi.mocked(getCurrentActor).mockRejectedValueOnce(new IdentityError("authentication_required"));
  const unauthenticated = await GET(new Request("http://localhost"), {
    params: Promise.resolve({ workspaceId, evidenceId }),
  });
  expect(unauthenticated.status).toBe(401);

  vi.mocked(readAuthorizedKnowledgeEvidenceContext).mockRejectedValueOnce(
    new KnowledgeEvidenceContextUnavailableError(),
  );
  const unavailable = await GET(new Request("http://localhost"), {
    params: Promise.resolve({ workspaceId, evidenceId }),
  });
  expect(unavailable.status).toBe(404);
});

test("reports unexpected failures as unavailable instead of hiding them as missing", async () => {
  vi.mocked(readAuthorizedKnowledgeEvidenceContext).mockRejectedValueOnce(
    new Error("database unavailable"),
  );

  const response = await GET(new Request("http://localhost"), {
    params: Promise.resolve({ workspaceId, evidenceId }),
  });

  expect(response.status).toBe(503);
  expect(webLogger.error).toHaveBeenCalledWith(
    expect.objectContaining({
      event: "knowledge.evidence_context.failed",
      failureCode: "knowledge_evidence_context_failed",
      workspaceId,
    }),
    "Knowledge evidence context request failed",
  );
});
