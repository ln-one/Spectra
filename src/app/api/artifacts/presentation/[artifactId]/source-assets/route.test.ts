import { beforeEach, expect, test, vi } from "vitest";
import { PRESENTATION_EDITOR_MAX_SOURCE_ASSET_PATHS } from "@/features/artifacts/presentations/editor-policy";
import { getPresentationPptdAssets } from "@/features/artifacts/presentations/service";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";
import { POST } from "./route";

vi.mock("@/features/identity/current", () => ({ getCurrentActor: vi.fn() }));
vi.mock("@/features/artifacts/presentations/service", () => ({
  getPresentationPptdAssets: vi.fn(),
}));
const actor = {
  handle: "alice",
  principalId: "00000000-0000-4000-8000-000000000611",
};
const workspaceId = "00000000-0000-4000-8000-000000000612";
const conversationId = "00000000-0000-4000-8000-000000000613";
const artifactId = "00000000-0000-4000-8000-000000000614";
const revisionId = "00000000-0000-4000-8000-000000000615";
const routeContext = { params: Promise.resolve({ artifactId }) };

function request(body: unknown) {
  const encoded = JSON.stringify(body);
  return new Request(
    `http://localhost/api/artifacts/presentation/${artifactId}/source-assets?${new URLSearchParams({
      revisionId,
      conversationId,
      workspaceId,
    })}`,
    {
      body: encoded,
      headers: {
        "content-length": String(new TextEncoder().encode(encoded).byteLength),
        "content-type": "application/json",
      },
      method: "POST",
    },
  );
}

beforeEach(() => {
  vi.mocked(getCurrentActor).mockReset().mockResolvedValue(actor);
  vi.mocked(getPresentationPptdAssets)
    .mockReset()
    .mockResolvedValue(["data:image/png;base64,iVBORw==", undefined]);
});

test("returns authenticated PPTD assets in request order", async () => {
  const response = await POST(
    request({ paths: ["/images/cover.png", "/images/missing.png"] }),
    routeContext,
  );

  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  await expect(response.json()).resolves.toEqual({
    assets: ["data:image/png;base64,iVBORw==", null],
  });
  expect(getPresentationPptdAssets).toHaveBeenCalledWith(actor, {
    artifactId,
    conversationId,
    paths: ["/images/cover.png", "/images/missing.png"],
    revisionId,
    workspaceId,
  });
});

test("authenticates before reading the asset request body", async () => {
  vi.mocked(getCurrentActor).mockRejectedValue(new IdentityError("authentication_required"));
  const input = request({ paths: ["/images/cover.png"] });
  const text = vi.spyOn(input, "text");

  const response = await POST(input, routeContext);

  expect(response.status).toBe(401);
  expect(text).not.toHaveBeenCalled();
});

test("rejects oversized asset batches before reading the body", async () => {
  const input = request({ paths: ["/images/cover.png"] });
  input.headers.set("content-length", String(320 * 1024 + 1));
  const text = vi.spyOn(input, "text");

  const response = await POST(input, routeContext);

  expect(response.status).toBe(400);
  expect(text).not.toHaveBeenCalled();
});

test("rejects decks over the unique source-asset path budget", async () => {
  const response = await POST(
    request({
      paths: Array.from(
        { length: PRESENTATION_EDITOR_MAX_SOURCE_ASSET_PATHS + 1 },
        (_, index) => `/images/${index}.png`,
      ),
    }),
    routeContext,
  );

  expect(response.status).toBe(400);
  expect(getPresentationPptdAssets).not.toHaveBeenCalled();
});

test("rejects repeated asset paths without loading the source archive", async () => {
  const response = await POST(
    request({ paths: ["/images/cover.png", "/images/cover.png"] }),
    routeContext,
  );

  expect(response.status).toBe(400);
  expect(getPresentationPptdAssets).not.toHaveBeenCalled();
});
