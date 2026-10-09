import { beforeEach, expect, test, vi } from "vitest";
import { getCurrentActor } from "@/features/identity/current";
import { IdentityError } from "@/features/identity/errors";
import { SourceError } from "@/features/sources/errors";
import { uploadSourceObject } from "@/features/sources/upload-proxy.server";
import { PUT } from "./route";

vi.mock("@/features/identity/current", () => ({ getCurrentActor: vi.fn() }));
vi.mock("@/features/sources/upload-proxy.server", () => ({ uploadSourceObject: vi.fn() }));

const actor = {
  handle: "alice",
  principalId: "00000000-0000-4000-8000-000000000611",
};
const sourceId = "00000000-0000-4000-8000-000000000612";
const context = { params: Promise.resolve({ sourceId }) };

function request(body = new TextEncoder().encode("%PDF-1.7"), generation = "1") {
  return new Request(`http://localhost/api/sources/${sourceId}/upload?generation=${generation}`, {
    body,
    headers: { "content-length": String(body.byteLength), "content-type": "application/pdf" },
    method: "PUT",
  });
}

beforeEach(() => {
  vi.mocked(getCurrentActor).mockReset().mockResolvedValue(actor);
  vi.mocked(uploadSourceObject).mockReset().mockResolvedValue(undefined);
});

test("stores an authenticated same-origin source upload", async () => {
  const input = request();
  const response = await PUT(input, context);

  expect(response.status).toBe(204);
  expect(response.headers.get("etag")).toBe('"spectra-upload-proxy"');
  expect(uploadSourceObject).toHaveBeenCalledWith(
    actor,
    sourceId,
    1,
    new TextEncoder().encode("%PDF-1.7"),
    "application/pdf",
  );
});

test("authenticates before reading the upload body", async () => {
  vi.mocked(getCurrentActor).mockRejectedValue(new IdentityError("authentication_required"));
  const input = request();
  const arrayBuffer = vi.spyOn(input, "arrayBuffer");

  const response = await PUT(input, context);

  expect(response.status).toBe(401);
  expect(arrayBuffer).not.toHaveBeenCalled();
});

test("returns a conflict when the pending upload no longer matches", async () => {
  vi.mocked(uploadSourceObject).mockRejectedValue(new SourceError("source_upload_mismatch"));

  const response = await PUT(request(), context);

  expect(response.status).toBe(409);
});

test("rejects an invalid upload generation before storing bytes", async () => {
  const response = await PUT(request(undefined, "invalid"), context);

  expect(response.status).toBe(400);
  expect(uploadSourceObject).not.toHaveBeenCalled();
});
