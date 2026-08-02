import { beforeEach, expect, test, vi } from "vitest";
import { getPresentationDraftAssets } from "@/features/artifacts/presentations/draft-assets.server";
import { PRESENTATION_EDITOR_MAX_SOURCE_ASSET_PATHS } from "@/features/artifacts/presentations/editor-policy";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";
import { POST } from "./route";

vi.mock("@/features/identity/current", () => ({ getCurrentActor: vi.fn() }));
vi.mock("@/features/artifacts/presentations/draft-assets.server", () => ({
  getPresentationDraftAssets: vi.fn(),
}));

const actor = {
  handle: "alice",
  principalId: "00000000-0000-4000-8000-000000000611",
};
const workspaceId = "00000000-0000-4000-8000-000000000612";
const conversationId = "00000000-0000-4000-8000-000000000613";
const artifactId = "00000000-0000-4000-8000-000000000614";
const attemptId = "00000000-0000-4000-8000-000000000615";
const routeContext = { params: Promise.resolve({ artifactId }) };

function request(body: unknown) {
  const encoded = JSON.stringify(body);
  return new Request(
    `http://localhost/api/artifacts/presentation/${artifactId}/draft-assets?${new URLSearchParams({
      attemptId,
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
  vi.mocked(getPresentationDraftAssets)
    .mockReset()
    .mockResolvedValue(["data:image/png;base64,iVBORw==", undefined]);
});

test("returns current-attempt draft assets in request order", async () => {
  const response = await POST(
    request({ paths: ["/images/cover.png", "/images/missing.png"] }),
    routeContext,
  );

  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  await expect(response.json()).resolves.toEqual({
    assets: ["data:image/png;base64,iVBORw==", null],
  });
  expect(getPresentationDraftAssets).toHaveBeenCalledWith(actor, {
    artifactId,
    attemptId,
    conversationId,
    paths: ["/images/cover.png", "/images/missing.png"],
    workspaceId,
  });
});

test("authenticates before reading the draft asset request body", async () => {
  vi.mocked(getCurrentActor).mockRejectedValue(new IdentityError("authentication_required"));
  const input = request({ paths: ["/images/cover.png"] });
  const text = vi.spyOn(input, "text");

  const response = await POST(input, routeContext);

  expect(response.status).toBe(401);
  expect(text).not.toHaveBeenCalled();
});

test("rejects oversized draft asset batches before reading the body", async () => {
  const input = request({ paths: ["/images/cover.png"] });
  input.headers.set("content-length", String(320 * 1024 + 1));
  const text = vi.spyOn(input, "text");

  const response = await POST(input, routeContext);

  expect(response.status).toBe(400);
  expect(text).not.toHaveBeenCalled();
});

test("rejects repeated and excessive draft paths before calling the runtime", async () => {
  const repeated = await POST(
    request({ paths: ["/images/cover.png", "/images/cover.png"] }),
    routeContext,
  );
  const excessive = await POST(
    request({
      paths: Array.from(
        { length: PRESENTATION_EDITOR_MAX_SOURCE_ASSET_PATHS + 1 },
        (_, index) => `/images/${index}.png`,
      ),
    }),
    routeContext,
  );

  expect(repeated.status).toBe(400);
  expect(excessive.status).toBe(400);
  expect(getPresentationDraftAssets).not.toHaveBeenCalled();
});
