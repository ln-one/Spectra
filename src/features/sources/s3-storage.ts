import "server-only";

import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createStorageClient } from "@/storage/client";
import { type StorageConfig, storageConfig } from "@/storage/config";
import type { InspectedObject, SourceStorage, VersionedObject } from "./storage";

function errorName(error: unknown) {
  if (typeof error !== "object" || error === null) return undefined;
  return "name" in error ? error.name : undefined;
}

function isAmbiguousNotFound(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const status =
    "$metadata" in error
      ? (error.$metadata as { httpStatusCode?: number } | undefined)?.httpStatusCode
      : undefined;
  return errorName(error) === "NotFound" || status === 404;
}

function encodedCopySource(bucket: string, reference: VersionedObject) {
  const key = reference.key.split("/").map(encodeURIComponent).join("/");
  return `${bucket}/${key}?versionId=${encodeURIComponent(reference.versionId)}`;
}

function inspectedObject(
  key: string,
  response: {
    ContentLength?: number | undefined;
    ETag?: string | undefined;
    VersionId?: string | undefined;
  },
): InspectedObject {
  if (
    response.ContentLength === undefined ||
    response.ETag === undefined ||
    response.VersionId === undefined
  ) {
    throw new Error("Versioned object metadata is incomplete");
  }
  return {
    key,
    versionId: response.VersionId,
    etag: response.ETag,
    sizeBytes: response.ContentLength,
  };
}

export function createS3SourceStorage(
  config: StorageConfig = storageConfig(),
  client: S3Client = createStorageClient(config),
): SourceStorage {
  return {
    async createUploadUrl({ key, expiresInSeconds }) {
      const url = await getSignedUrl(
        client,
        new PutObjectCommand({ Bucket: config.bucket, Key: key }),
        { expiresIn: expiresInSeconds },
      );
      return { url };
    },

    async createDownloadUrl({ reference, expiresInSeconds }) {
      const url = await getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: reference.key,
          VersionId: reference.versionId,
        }),
        { expiresIn: expiresInSeconds },
      );
      return { url };
    },

    async headObject({ key, versionId }) {
      try {
        const response = await client.send(
          new HeadObjectCommand({ Bucket: config.bucket, Key: key, VersionId: versionId }),
        );
        return inspectedObject(key, response);
      } catch (error) {
        const name = errorName(error);
        if (name === "NoSuchKey" || name === "NoSuchVersion") return null;
        if (isAmbiguousNotFound(error)) {
          // HEAD may use the same 404 for a missing object and a missing bucket.
          await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
          return null;
        }
        throw error;
      }
    },

    async readObjectRange(reference, range) {
      const response = await client.send(
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: reference.key,
          VersionId: reference.versionId,
          Range: `bytes=${range.start}-${range.end}`,
        }),
      );
      const body = await response.Body?.transformToByteArray();
      if (!body) throw new Error("Object range response has no body");
      return body;
    },

    async copyObjectConditionally({ source, destinationKey }) {
      const response = await client.send(
        new CopyObjectCommand({
          Bucket: config.bucket,
          Key: destinationKey,
          CopySource: encodedCopySource(config.bucket, source),
          CopySourceIfMatch: source.etag,
        }),
      );
      if (!response.VersionId) throw new Error("Copied object has no version id");
      return { key: destinationKey, versionId: response.VersionId };
    },

    async downloadObjectToFile(reference, destinationPath) {
      const response = await client.send(
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: reference.key,
          VersionId: reference.versionId,
        }),
      );
      if (!response.Body) throw new Error("Source object response has no body");
      await pipeline(response.Body.transformToWebStream(), createWriteStream(destinationPath));
    },

    async putObject({ key, body, contentType }) {
      const response = await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: body,
          ContentLength: body.byteLength,
          ContentType: contentType,
        }),
      );
      if (!response.VersionId) throw new Error("Stored object has no version id");
      return { key, versionId: response.VersionId };
    },

    async deleteObjectVersion(reference) {
      await client.send(
        new DeleteObjectCommand({
          Bucket: config.bucket,
          Key: reference.key,
          VersionId: reference.versionId,
        }),
      );
      const remaining = await this.headObject(reference);
      if (remaining) throw new Error("Exact object version still exists after deletion");
    },
  };
}
