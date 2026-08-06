import { beforeEach, expect, test, vi } from "vitest";
import {
  ensureTeachingDocumentRenderJob,
  getArtifactRenderDownload,
  getTeachingDocumentRenderJob,
} from "@/features/artifacts/render-service.server";
import { getCurrentActor } from "@/features/identity/current";
import { GET, POST } from "./route";

vi.mock("@/features/identity/current", () => ({ getCurrentActor: vi.fn() }));
vi.mock("@/features/artifacts/render-service.server", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/features/artifacts/render-service.server")>();
  return {
    ...original,
    ensureTeachingDocumentRenderJob: vi.fn(),
    getArtifactRenderDownload: vi.fn(),
    getTeachingDocumentRenderJob: vi.fn(),
  };
});

const actor = { handle: "alice", principalId: "00000000-0000-4000-8000-000000000411" };
const artifactId = "00000000-0000-4000-8000-000000000414";
const revisionId = "00000000-0000-4000-8000-000000000415";
const job = {
  artifactId,
  artifactRevisionId: revisionId,
  attemptNumber: 1,
  failureCode: null,
  format: "docx" as const,
  id: "00000000-0000-4000-8000-000000000416",
  state: "queued" as const,
};

beforeEach(() => {
  vi.mocked(getCurrentActor).mockReset().mockResolvedValue(actor);
  vi.mocked(ensureTeachingDocumentRenderJob)
    .mockReset()
    .mockResolvedValue(job as never);
  vi.mocked(getTeachingDocumentRenderJob)
    .mockReset()
    .mockResolvedValue(job as never);
  vi.mocked(getArtifactRenderDownload).mockReset().mockResolvedValue(null);
});

test("POST creates or replays one render job", async () => {
  const response = await POST(
    new Request(
      `http://localhost/api/artifacts/teaching-document/${artifactId}/export?revisionId=${revisionId}`,
      { method: "POST" },
    ),
    { params: Promise.resolve({ artifactId }) },
  );

  expect(response.status).toBe(202);
  expect(ensureTeachingDocumentRenderJob).toHaveBeenCalledWith(actor, {
    artifactId,
    revisionId,
  });
  expect(getTeachingDocumentRenderJob).not.toHaveBeenCalled();
});

test("GET is read-only and never creates a render job", async () => {
  const response = await GET(
    new Request(
      `http://localhost/api/artifacts/teaching-document/${artifactId}/export?revisionId=${revisionId}`,
    ),
    { params: Promise.resolve({ artifactId }) },
  );

  expect(response.status).toBe(202);
  expect(getTeachingDocumentRenderJob).toHaveBeenCalledWith(actor, { artifactId, revisionId });
  expect(ensureTeachingDocumentRenderJob).not.toHaveBeenCalled();
});

test("GET returns the fixed-revision download only after the job is ready", async () => {
  vi.mocked(getTeachingDocumentRenderJob).mockResolvedValue({ ...job, state: "ready" } as never);

  const response = await GET(
    new Request(
      `http://localhost/api/artifacts/teaching-document/${artifactId}/export?revisionId=${revisionId}`,
    ),
    { params: Promise.resolve({ artifactId }) },
  );

  expect(response.status).toBe(200);
  const payload = await response.json();
  expect(payload).toMatchObject({
    job: { artifactRevisionId: revisionId, state: "ready" },
  });
  expect(payload.downloadUrl).toBe(
    `/api/artifacts/teaching-document/${artifactId}/export?download=1&revisionId=${revisionId}`,
  );
  expect(getArtifactRenderDownload).not.toHaveBeenCalled();
});

test("GET streams the fixed-revision document through the authenticated API", async () => {
  vi.mocked(getTeachingDocumentRenderJob).mockResolvedValue({ ...job, state: "ready" } as never);
  vi.mocked(getArtifactRenderDownload).mockResolvedValue({
    body: new Uint8Array([1, 2, 3]),
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    filename: "教学文档.docx",
    job: {} as never,
  });

  const response = await GET(
    new Request(
      `http://localhost/api/artifacts/teaching-document/${artifactId}/export?revisionId=${revisionId}&download=1`,
    ),
    { params: Promise.resolve({ artifactId }) },
  );

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe(
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
  expect(response.headers.get("content-disposition")).toBe(
    "attachment; filename*=UTF-8''%E6%95%99%E5%AD%A6%E6%96%87%E6%A1%A3.docx",
  );
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  expect(getArtifactRenderDownload).toHaveBeenCalledWith(actor, { artifactId, revisionId });
});
