import { expect, test, vi } from "vitest";
import type { ArtifactRenderStorage } from "@/features/artifacts/render-storage.server";
import { putImmutableArtifactObject } from "./immutable-storage.server";

function storageWith(
  objects: Record<string, { body: Uint8Array; contentType: string }>,
): ArtifactRenderStorage {
  return {
    delete: vi.fn(async () => undefined),
    get: vi.fn(async ({ versionId }) => {
      const object = objects[versionId];
      if (!object) throw new Error("missing");
      return object;
    }),
    listVersions: vi.fn(async () => Object.keys(objects)),
    put: vi.fn(async () => ({ versionId: "new" })),
  };
}

test("checks every existing version before reusing an immutable key", async () => {
  const body = new TextEncoder().encode("same");
  const storage = storageWith({
    corrupt: { body: new TextEncoder().encode("different"), contentType: "application/gzip" },
    valid: { body, contentType: "application/gzip" },
  });
  await expect(
    putImmutableArtifactObject(storage, {
      body,
      contentType: "application/gzip",
      key: "source.tar.gz",
    }),
  ).rejects.toThrow("artifact_object_identity_conflict");
});

test("includes content type in immutable object identity", async () => {
  const body = new TextEncoder().encode("same");
  const storage = storageWith({
    valid: { body, contentType: "application/octet-stream" },
  });
  await expect(
    putImmutableArtifactObject(storage, {
      body,
      contentType: "application/gzip",
      key: "source.tar.gz",
    }),
  ).rejects.toThrow("artifact_object_identity_conflict");
});

test("uses conditional creation to reject concurrent writes with different identities", async () => {
  const objects = new Map<string, { body: Uint8Array; contentType: string }>();
  const storage: ArtifactRenderStorage = {
    delete: vi.fn(async () => undefined),
    get: vi.fn(async ({ versionId }) => {
      const object = objects.get(versionId);
      if (!object) throw new Error("missing");
      return object;
    }),
    listVersions: vi.fn(async () => [...objects.keys()]),
    put: vi.fn(async ({ body, contentType, ifNoneMatch }) => {
      expect(ifNoneMatch).toBe("*");
      if (objects.size > 0) {
        throw Object.assign(new Error("precondition_failed"), {
          $metadata: { httpStatusCode: 412 },
        });
      }
      objects.set("winner", { body, contentType });
      return { versionId: "winner" };
    }),
  };
  const results = await Promise.allSettled([
    putImmutableArtifactObject(storage, {
      body: new TextEncoder().encode("first"),
      contentType: "application/gzip",
      key: "source.tar.gz",
    }),
    putImmutableArtifactObject(storage, {
      body: new TextEncoder().encode("second"),
      contentType: "application/gzip",
      key: "source.tar.gz",
    }),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toEqual([
    expect.objectContaining({
      reason: expect.objectContaining({ message: "artifact_object_identity_conflict" }),
    }),
  ]);
});
