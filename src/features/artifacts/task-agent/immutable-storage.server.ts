import "server-only";

import { createHash } from "node:crypto";
import type { ArtifactRenderStorage } from "@/features/artifacts/render-storage.server";

function sha256(body: Uint8Array) {
  return createHash("sha256").update(body).digest("hex");
}

export async function putImmutableArtifactObject(
  storage: ArtifactRenderStorage,
  input: {
    body: Uint8Array;
    contentType: string;
    key: string;
  },
) {
  const expectedSha256 = sha256(input.body);
  const inspectVersions = async () => {
    const versions = await storage.listVersions({ key: input.key });
    let matchingVersionId: string | null = null;
    for (const versionId of versions) {
      const existing = await storage.get({ key: input.key, versionId });
      if (
        existing.contentType !== input.contentType ||
        sha256(existing.body) !== expectedSha256 ||
        existing.body.byteLength !== input.body.byteLength
      ) {
        throw new Error("artifact_object_identity_conflict");
      }
      matchingVersionId ??= versionId;
    }
    return matchingVersionId;
  };
  const matchingVersionId = await inspectVersions();
  if (matchingVersionId) {
    return {
      sha256: expectedSha256,
      sizeBytes: input.body.byteLength,
      versionId: matchingVersionId,
    };
  }
  let stored: { versionId: string };
  try {
    stored = await storage.put({ ...input, ifNoneMatch: "*" });
  } catch (error) {
    const status =
      error && typeof error === "object" && "$metadata" in error
        ? Number(Reflect.get(Reflect.get(error, "$metadata") ?? {}, "httpStatusCode"))
        : null;
    if (status !== 412) throw error;
    const concurrentVersionId = await inspectVersions();
    if (!concurrentVersionId) throw new Error("artifact_object_identity_conflict");
    return {
      sha256: expectedSha256,
      sizeBytes: input.body.byteLength,
      versionId: concurrentVersionId,
    };
  }
  const persisted = await storage.get({ key: input.key, versionId: stored.versionId });
  if (
    persisted.contentType !== input.contentType ||
    persisted.body.byteLength !== input.body.byteLength ||
    sha256(persisted.body) !== expectedSha256
  ) {
    throw new Error("artifact_object_identity_conflict");
  }
  await inspectVersions();
  return { sha256: expectedSha256, sizeBytes: input.body.byteLength, ...stored };
}
