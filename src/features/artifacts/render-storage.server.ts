import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { createStorageClient } from "@/storage/client";
import { type StorageConfig, storageConfig } from "@/storage/config";

export type ArtifactRenderStorage = {
  delete(input: { key: string; versionId: string }): Promise<void>;
  get(input: { key: string; versionId: string }): Promise<{
    body: Uint8Array;
    contentType: string;
  }>;
  getRange?(input: { end: number; key: string; start: number; versionId: string }): Promise<{
    body: Uint8Array;
    contentType: string;
  }>;
  listVersions(input: { key: string }): Promise<string[]>;
  put(input: {
    body: Uint8Array;
    contentType: string;
    ifNoneMatch?: "*";
    key: string;
  }): Promise<{ versionId: string }>;
};

function supportsConditionalPut(config: StorageConfig) {
  return !new URL(config.endpoint).hostname.endsWith(".aliyuncs.com");
}

export function createArtifactRenderStorage(
  config: StorageConfig = storageConfig(),
  client: S3Client = createStorageClient(config),
): ArtifactRenderStorage {
  return {
    async get({ key, versionId }) {
      const response = await client.send(
        new GetObjectCommand({ Bucket: config.bucket, Key: key, VersionId: versionId }),
      );
      if (!response.Body) throw new Error("Artifact render object has no body");
      return {
        body: await response.Body.transformToByteArray(),
        contentType:
          response.ContentType ??
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };
    },
    async getRange({ end, key, start, versionId }) {
      const response = await client.send(
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Range: `bytes=${start}-${end}`,
          VersionId: versionId,
        }),
      );
      if (!response.Body) throw new Error("Artifact render object has no body");
      return {
        body: await response.Body.transformToByteArray(),
        contentType:
          response.ContentType ??
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };
    },
    async delete({ key, versionId }) {
      await client.send(
        new DeleteObjectCommand({ Bucket: config.bucket, Key: key, VersionId: versionId }),
      );
    },
    async listVersions({ key }) {
      const versionIds: string[] = [];
      let keyMarker: string | undefined;
      let versionIdMarker: string | undefined;
      do {
        const page = await client.send(
          new ListObjectVersionsCommand({
            Bucket: config.bucket,
            KeyMarker: keyMarker,
            Prefix: key,
            VersionIdMarker: versionIdMarker,
          }),
        );
        for (const version of page.Versions ?? []) {
          if (version.Key === key && version.VersionId) versionIds.push(version.VersionId);
        }
        keyMarker = page.IsTruncated ? page.NextKeyMarker : undefined;
        versionIdMarker = page.IsTruncated ? page.NextVersionIdMarker : undefined;
      } while (keyMarker || versionIdMarker);
      return versionIds;
    },
    async put({ body, contentType, ifNoneMatch, key }) {
      const response = await client.send(
        new PutObjectCommand({
          Body: body,
          Bucket: config.bucket,
          ContentLength: body.byteLength,
          ContentType: contentType,
          ...(supportsConditionalPut(config) ? { IfNoneMatch: ifNoneMatch } : {}),
          Key: key,
        }),
      );
      if (!response.VersionId) throw new Error("Artifact render object has no version id");
      return { versionId: response.VersionId };
    },
  };
}
