import { beforeEach, expect, test, vi } from "vitest";
import { PresentationError } from "@/features/artifacts/presentations/errors";
import {
  getPresentationEditorProject,
  requirePresentationEditorArtifactManage,
  savePresentationEditorProject,
} from "@/features/artifacts/presentations/service";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";
import { GET, POST } from "./route";

vi.mock("@/features/identity/current", () => ({ getCurrentActor: vi.fn() }));
vi.mock("@/features/artifacts/presentations/service", () => ({
  getPresentationEditorProject: vi.fn(),
  requirePresentationEditorArtifactManage: vi.fn(),
  savePresentationEditorProject: vi.fn(),
}));

const actor = { handle: "alice", principalId: "00000000-0000-4000-8000-000000000511" };
const workspaceId = "00000000-0000-4000-8000-000000000512";
const conversationId = "00000000-0000-4000-8000-000000000513";
const artifactId = "00000000-0000-4000-8000-000000000514";
const revisionId = "00000000-0000-4000-8000-000000000515";
const routeContext = { params: Promise.resolve({ artifactId }) };

async function multipartRequest(formData: FormData) {
  const encoded = new Response(formData);
  const body = await encoded.arrayBuffer();
  return new Request(
    `http://localhost/api/artifacts/presentation/${artifactId}/editor-project?workspaceId=${workspaceId}&conversationId=${conversationId}`,
    {
      body,
      headers: {
        "content-length": String(body.byteLength),
        "content-type": encoded.headers.get("content-type") ?? "multipart/form-data",
      },
      method: "POST",
    },
  );
}

beforeEach(() => {
  vi.mocked(getCurrentActor).mockReset().mockResolvedValue(actor);
  vi.mocked(getPresentationEditorProject).mockReset().mockResolvedValue(null);
  vi.mocked(requirePresentationEditorArtifactManage).mockReset().mockResolvedValue(undefined);
  vi.mocked(savePresentationEditorProject)
    .mockReset()
    .mockResolvedValue({ generationState: "ready" } as never);
});

test("POST forwards the recovered project blobs and optimistic revision", async () => {
  const project = new TextEncoder().encode('{"title":"Gravity"}');
  const cover = new Uint8Array([1, 2, 3]);
  const formData = new FormData();
  formData.set("expectedRevisionId", revisionId);
  formData.set("name", "Gravity");
  formData.set("pptJson", new Blob([project], { type: "application/json" }));
  formData.set("coverImage", new Blob([cover], { type: "image/png" }));

  const response = await POST(await multipartRequest(formData), routeContext);

  expect(response.status).toBe(200);
  expect(savePresentationEditorProject).toHaveBeenCalledWith(actor, {
    artifactId,
    conversationId,
    cover: { body: cover, mediaType: "image/png" },
    expectedRevisionId: revisionId,
    name: "Gravity",
    project: { body: project, mediaType: "application/json" },
    workspaceId,
  });
});

test("GET streams the exact versioned editor project", async () => {
  const body = new Uint8Array([4, 5, 6]);
  vi.mocked(getPresentationEditorProject).mockResolvedValue({
    body,
    contentType: "application/json",
  });

  const response = await GET(
    new Request(
      `http://localhost/api/artifacts/presentation/${artifactId}/editor-project?workspaceId=${workspaceId}&conversationId=${conversationId}&revisionId=${revisionId}`,
    ),
    routeContext,
  );

  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("content-type")).toBe("application/json");
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(body);
  expect(getPresentationEditorProject).toHaveBeenCalledWith(actor, {
    artifactId,
    conversationId,
    revisionId,
    workspaceId,
  });
});

test("POST maps optimistic revision conflicts to 409", async () => {
  vi.mocked(savePresentationEditorProject).mockRejectedValue(
    new PresentationError("presentation_revision_conflict"),
  );
  const formData = new FormData();
  formData.set("expectedRevisionId", revisionId);
  formData.set("name", "Gravity");
  formData.set(
    "pptJson",
    new Blob(['{"title":"Gravity"}'], {
      type: "application/json",
    }),
  );

  const response = await POST(await multipartRequest(formData), routeContext);

  expect(response.status).toBe(409);
  await expect(response.json()).resolves.toEqual({
    detail: { code: "presentation_revision_conflict" },
  });
});

test("authenticates before parsing multipart content", async () => {
  vi.mocked(getCurrentActor).mockRejectedValue(new IdentityError("authentication_required"));
  const request = new Request(
    `http://localhost/api/artifacts/presentation/${artifactId}/editor-project?workspaceId=${workspaceId}&conversationId=${conversationId}`,
    {
      body: "not multipart",
      headers: { "content-length": "13" },
      method: "POST",
    },
  );
  const parse = vi.spyOn(request, "formData");

  const response = await POST(request, routeContext);

  expect(response.status).toBe(401);
  expect(parse).not.toHaveBeenCalled();
});

test("authorizes the Artifact creator before parsing multipart content", async () => {
  vi.mocked(requirePresentationEditorArtifactManage).mockRejectedValue(
    new PresentationError("presentation_not_found"),
  );
  const request = new Request(
    `http://localhost/api/artifacts/presentation/${artifactId}/editor-project?workspaceId=${workspaceId}&conversationId=${conversationId}`,
    {
      body: "not multipart",
      headers: { "content-length": "13" },
      method: "POST",
    },
  );
  const parse = vi.spyOn(request, "formData");

  const response = await POST(request, routeContext);

  expect(response.status).toBe(404);
  expect(parse).not.toHaveBeenCalled();
  expect(savePresentationEditorProject).not.toHaveBeenCalled();
});

test("rejects malformed editor fields as a client error", async () => {
  const formData = new FormData();
  formData.set("expectedRevisionId", "not-a-revision");
  formData.set("name", " ");
  formData.set("pptJson", new Blob(["{}"], { type: "application/json" }));

  const response = await POST(await multipartRequest(formData), routeContext);

  expect(response.status).toBe(400);
  expect(savePresentationEditorProject).not.toHaveBeenCalled();
});

test("rejects oversized multipart content before parsing it", async () => {
  const request = new Request(
    `http://localhost/api/artifacts/presentation/${artifactId}/editor-project?workspaceId=${workspaceId}&conversationId=${conversationId}`,
    {
      body: "oversized",
      headers: { "content-length": String(80 * 1024 * 1024 + 1) },
      method: "POST",
    },
  );
  const parse = vi.spyOn(request, "formData");

  const response = await POST(request, routeContext);

  expect(response.status).toBe(413);
  expect(parse).not.toHaveBeenCalled();
  expect(savePresentationEditorProject).not.toHaveBeenCalled();
});

test("rejects malformed scope before authentication", async () => {
  const response = await GET(
    new Request(
      `http://localhost/api/artifacts/presentation/${artifactId}/editor-project?workspaceId=bad&conversationId=${conversationId}&revisionId=${revisionId}`,
    ),
    routeContext,
  );
  expect(response.status).toBe(400);
  expect(getCurrentActor).not.toHaveBeenCalled();
});
