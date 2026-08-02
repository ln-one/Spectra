import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  CopyObjectCommand,
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetBucketCorsCommand,
  GetBucketVersioningCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListBucketsCommand,
  ListObjectVersionsCommand,
  PutBucketCorsCommand,
  PutBucketLifecycleConfigurationCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { type Browser, chromium, type Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createS3SourceStorage } from "@/features/sources/s3-storage";
import type { SourceStorage } from "@/features/sources/storage";
import { createStorageClient } from "@/storage/client";
import { storageConfig } from "@/storage/config";

const config = storageConfig();
const endpoint = new URL(config.endpoint);
if (endpoint.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(endpoint.hostname)) {
  throw new Error("The local storage contract refuses non-loopback endpoints");
}
const bucket = `spectra-contract-${randomUUID()}`;
const contentType = "application/pdf";
const firstBody = new TextEncoder().encode("first-pdf-body");
const secondBody = new TextEncoder().encode("second-pdf-body");
const thirdBody = new TextEncoder().encode("third-pdf-body");

let client: S3Client;
let browser: Browser | undefined;
let page: Page;
let originServer: Server | undefined;
let origin: string;
let stagingKey: string;
let finalKey: string;
let uploadUrl: string;
let finalVersionId: string;
let bucketCreated = false;
let sourceStorage: SourceStorage;

async function waitUntilReady() {
  const deadline = Date.now() + 30_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await client.send(new ListBucketsCommand({}));
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error("Object storage did not become ready within 30 seconds", {
    cause: lastError,
  });
}

async function browserPut(url: string, body: Uint8Array) {
  return page.evaluate(
    async ({ signedUrl, bytes, type }) => {
      try {
        const response = await fetch(signedUrl, {
          method: "PUT",
          headers: { "content-type": type },
          body: Uint8Array.from(bytes),
        });
        return { ok: response.ok, status: response.status };
      } catch {
        return { ok: false, status: 0 };
      }
    },
    { signedUrl: url, bytes: [...body], type: contentType },
  );
}

function copySource(key: string) {
  return `${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

async function expectHttpStatus(promise: Promise<unknown>, status: number) {
  try {
    await promise;
    throw new Error(`Expected HTTP ${status}, but the request succeeded`);
  } catch (error) {
    const actual = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    expect(actual).toBe(status);
  }
}

async function readBody(key: string, versionId?: string) {
  const response = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key, VersionId: versionId }),
  );
  return response.Body?.transformToByteArray();
}

async function emptyBucket(storageClient: S3Client) {
  let keyMarker: string | undefined;
  let versionIdMarker: string | undefined;
  let isTruncated: boolean;
  do {
    const listed = await storageClient.send(
      new ListObjectVersionsCommand({
        Bucket: bucket,
        KeyMarker: keyMarker,
        VersionIdMarker: versionIdMarker,
      }),
    );
    const objects = [
      ...(listed.Versions ?? []).map(({ Key, VersionId }) => ({ Key, VersionId })),
      ...(listed.DeleteMarkers ?? []).map(({ Key, VersionId }) => ({ Key, VersionId })),
    ].filter((object): object is { Key: string; VersionId: string } =>
      Boolean(object.Key && object.VersionId),
    );
    if (objects.length > 0) {
      await storageClient.send(
        new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects, Quiet: true } }),
      );
    }
    keyMarker = listed.NextKeyMarker;
    versionIdMarker = listed.NextVersionIdMarker;
    isTruncated = listed.IsTruncated ?? false;
  } while (isTruncated);
}

describe.sequential("local object storage contract", () => {
  beforeAll(async () => {
    client = createStorageClient(config);
    await waitUntilReady();

    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<!doctype html><title>storage contract</title>");
    });
    originServer = server;
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address() as AddressInfo;
    origin = `http://127.0.0.1:${address.port}`;

    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    bucketCreated = true;
    await client.send(
      new PutBucketVersioningCommand({
        Bucket: bucket,
        VersioningConfiguration: { Status: "Enabled" },
      }),
    );
    sourceStorage = createS3SourceStorage({ ...config, bucket }, client);
    await client.send(
      new PutBucketCorsCommand({
        Bucket: bucket,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedHeaders: ["content-type"],
              AllowedMethods: ["GET", "HEAD", "PUT"],
              AllowedOrigins: [origin],
              ExposeHeaders: ["etag", "x-amz-version-id"],
              MaxAgeSeconds: 300,
            },
          ],
        },
      }),
    );

    browser = await chromium.launch();
    page = await browser.newPage();
    await page.goto(origin);
  });

  afterAll(async () => {
    await browser?.close();
    if (originServer) {
      await new Promise<void>((resolve) => originServer?.close(() => resolve()));
    }
    try {
      if (bucketCreated) {
        await emptyBucket(client);
        await client.send(new DeleteBucketCommand({ Bucket: bucket }));
      }
    } finally {
      client?.destroy();
    }
  });

  it("configures private versioned storage with CORS", async () => {
    const versioning = await client.send(new GetBucketVersioningCommand({ Bucket: bucket }));
    expect(versioning.Status).toBe("Enabled");

    const cors = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
    expect(cors.CORSRules).toContainEqual(expect.objectContaining({ AllowedOrigins: [origin] }));
  });

  it("documents the missing local bucket lifecycle capability", async () => {
    await expectHttpStatus(
      client.send(
        new PutBucketLifecycleConfigurationCommand({
          Bucket: bucket,
          LifecycleConfiguration: {
            Rules: [
              {
                ID: "expire-staging",
                Filter: { Prefix: "staging/" },
                Status: "Enabled",
                Expiration: { Days: 1 },
              },
            ],
          },
        }),
      ),
      501,
    );
  });

  it("allows a browser to upload only to the signed key", async () => {
    stagingKey = `staging/${randomUUID()}`;
    uploadUrl = await getSignedUrl(
      client,
      new PutObjectCommand({ Bucket: bucket, Key: stagingKey, ContentType: contentType }),
      { expiresIn: 300 },
    );

    await expect(browserPut(uploadUrl, firstBody)).resolves.toEqual({ ok: true, status: 200 });

    const tampered = new URL(uploadUrl);
    tampered.pathname = `${tampered.pathname}-tampered`;
    const rejected = await browserPut(tampered.toString(), firstBody);
    expect(rejected.ok).toBe(false);
  });

  it("rejects expired upload URLs", async () => {
    const expiredUrl = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: `staging/${randomUUID()}`,
        ContentType: contentType,
      }),
      { expiresIn: 1 },
    );
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    const result = await browserPut(expiredUrl, firstBody);
    expect(result.ok).toBe(false);
  });

  it("returns actual metadata and bounded ranges", async () => {
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: stagingKey }));
    expect(head.ContentLength).toBe(firstBody.byteLength);
    expect(head.ETag).toBeTruthy();
    expect(head.VersionId).toBeTruthy();

    const ranged = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: stagingKey, Range: "bytes=0-4" }),
    );
    expect(ranged.ContentRange).toBe(`bytes 0-4/${firstBody.byteLength}`);
    expect(await ranged.Body?.transformToString()).toBe("first");
  });

  it("freezes verified bytes with conditional copy", async () => {
    const verified = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: stagingKey }));
    expect(verified.ETag).toBeTruthy();

    await expect(browserPut(uploadUrl, secondBody)).resolves.toEqual({ ok: true, status: 200 });
    finalKey = `sources/${randomUUID()}`;
    await expectHttpStatus(
      client.send(
        new CopyObjectCommand({
          Bucket: bucket,
          Key: finalKey,
          CopySource: copySource(stagingKey),
          CopySourceIfMatch: verified.ETag,
        }),
      ),
      412,
    );

    const current = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: stagingKey }));
    const copied = await client.send(
      new CopyObjectCommand({
        Bucket: bucket,
        Key: finalKey,
        CopySource: copySource(stagingKey),
        CopySourceIfMatch: current.ETag,
      }),
    );
    finalVersionId = copied.VersionId ?? "";
    expect(finalVersionId).not.toBe("");

    await expect(browserPut(uploadUrl, thirdBody)).resolves.toEqual({ ok: true, status: 200 });
    expect(await readBody(finalKey, finalVersionId)).toEqual(secondBody);
  });

  it("keeps objects private and deletes an exact version idempotently", async () => {
    const anonymous = await fetch(`${config.endpoint}/${bucket}/${finalKey}`);
    expect([401, 403]).toContain(anonymous.status);

    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: finalKey, VersionId: finalVersionId }),
    );
    await expectHttpStatus(
      client.send(
        new GetObjectCommand({ Bucket: bucket, Key: finalKey, VersionId: finalVersionId }),
      ),
      404,
    );
    await expect(
      client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: finalKey, VersionId: finalVersionId }),
      ),
    ).resolves.toBeDefined();
  });

  it("implements the Source storage adapter against the real S3 contract", async () => {
    const adapterStagingKey = `staging/${randomUUID()}`;
    const adapterFinalKey = `sources/${randomUUID()}/original`;
    const signed = await sourceStorage.createUploadUrl({
      key: adapterStagingKey,
      expiresInSeconds: 300,
    });
    await expect(browserPut(signed.url, firstBody)).resolves.toEqual({ ok: true, status: 200 });

    const inspected = await sourceStorage.headObject({ key: adapterStagingKey });
    expect(inspected).not.toBeNull();
    if (!inspected) throw new Error("Expected uploaded staging object");
    expect(await sourceStorage.readObjectRange(inspected, { start: 0, end: 4 })).toEqual(
      new TextEncoder().encode("first"),
    );

    const frozen = await sourceStorage.copyObjectConditionally({
      source: inspected,
      destinationKey: adapterFinalKey,
    });
    await expect(browserPut(signed.url, secondBody)).resolves.toEqual({ ok: true, status: 200 });
    expect(await readBody(frozen.key, frozen.versionId)).toEqual(firstBody);

    const download = await sourceStorage.createDownloadUrl({
      reference: frozen,
      expiresInSeconds: 300,
    });
    expect(download.url).not.toContain(config.secretAccessKey);
    await client.send(
      new PutObjectCommand({ Bucket: bucket, Key: adapterFinalKey, Body: thirdBody }),
    );
    const downloaded = await fetch(download.url);
    expect(downloaded.ok).toBe(true);
    expect(new Uint8Array(await downloaded.arrayBuffer())).toEqual(firstBody);

    const tamperedKey = new URL(download.url);
    tamperedKey.pathname = `${tamperedKey.pathname}-tampered`;
    expect((await fetch(tamperedKey)).ok).toBe(false);
    const tamperedVersion = new URL(download.url);
    tamperedVersion.searchParams.set("versionId", randomUUID());
    expect((await fetch(tamperedVersion)).ok).toBe(false);

    await sourceStorage.deleteObjectVersion(frozen);
    await expect(sourceStorage.headObject(frozen)).resolves.toBeNull();
  });

  it("does not mistake a missing bucket for a missing object", async () => {
    const missingBucketStorage = createS3SourceStorage(
      { ...config, bucket: `missing-${randomUUID()}` },
      client,
    );
    await expect(missingBucketStorage.headObject({ key: "missing" })).rejects.toBeDefined();
  });
});
