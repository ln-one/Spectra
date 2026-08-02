import { randomUUID } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import { createMigratedTestDatabase } from "@tests/database";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import type { DatabaseTransaction } from "@/database/client";
import { fileSources, sourceIngestions, sources } from "@/database/schema";
import { ensurePrincipalForAuthUser } from "@/features/identity/service";
import type { Actor } from "@/features/identity/types";
import { createWorkspace } from "@/features/workspaces/service";
import { deleteSource, listWorkspaceSources, purgeDeletedSource } from "../service";
import type { InspectedObject, SourceStorage, VersionedObject } from "../storage";
import type { SourceIngestionQueue } from "./dbos";
import { MediaUnderstandingError } from "./media-understanding";
import type { MinerUPollResult, MinerUProvider } from "./mineru";
import {
  ingestionFailure,
  markSourceIngestionFailed,
  pollSourceIngestion,
  type SourceIngestionProcessorDependencies,
  submitSourceIngestion,
} from "./processor";
import { latestSourceIngestions, startSourceIngestion } from "./service";

test.each([
  ["media_authentication", false],
  ["media_input_rejected", false],
  ["media_result_invalid", false],
  ["media_rate_limited", true],
  ["media_timeout", true],
  ["media_unavailable", true],
  ["media_aborted", true],
] as const)("maps %s to a stable ingestion failure", (code, retryable) => {
  expect(ingestionFailure(new MediaUnderstandingError(code))).toEqual({
    errorCode: code,
    retryable,
  });
});

class MemoryStorage implements SourceStorage {
  readonly objects = new Map<string, Map<string, Uint8Array>>();
  downloadedPath: string | undefined;
  downloadUrlReferences: VersionedObject[] = [];

  put(key: string, body: Uint8Array) {
    const versionId = randomUUID();
    const versions = this.objects.get(key) ?? new Map<string, Uint8Array>();
    versions.set(versionId, body);
    this.objects.set(key, versions);
    return { key, versionId };
  }

  async createUploadUrl(_input: {
    key: string;
    expiresInSeconds: number;
  }): Promise<{ url: string }> {
    throw new Error("unused");
  }

  async createDownloadUrl(input: {
    reference: VersionedObject;
    expiresInSeconds: number;
  }): Promise<{ url: string }> {
    this.downloadUrlReferences.push(input.reference);
    return { url: "https://storage.invalid/media?signature=redacted" };
  }

  async headObject({ key, versionId }: { key: string; versionId?: string }) {
    const versions = this.objects.get(key);
    const selectedVersion = versionId ?? Array.from(versions?.keys() ?? []).at(-1);
    const body = selectedVersion ? versions?.get(selectedVersion) : undefined;
    if (!selectedVersion || !body) return null;
    return {
      key,
      versionId: selectedVersion,
      etag: `"${selectedVersion}"`,
      sizeBytes: body.byteLength,
    };
  }

  async readObjectRange(reference: VersionedObject, range: { start: number; end: number }) {
    const body = this.objects.get(reference.key)?.get(reference.versionId);
    if (!body) throw new Error("object not found");
    return body.slice(range.start, range.end + 1);
  }

  async copyObjectConditionally({
    source,
    destinationKey,
  }: {
    source: InspectedObject;
    destinationKey: string;
  }) {
    const body = this.objects.get(source.key)?.get(source.versionId);
    if (!body) throw new Error("object not found");
    return this.put(destinationKey, body);
  }

  async downloadObjectToFile(reference: VersionedObject, destinationPath: string) {
    const body = this.objects.get(reference.key)?.get(reference.versionId);
    if (!body) throw new Error("object not found");
    this.downloadedPath = destinationPath;
    await writeFile(destinationPath, body);
  }

  async putObject({ key, body }: { key: string; body: Uint8Array; contentType: string }) {
    return this.put(key, body);
  }

  async deleteObjectVersion(reference: VersionedObject) {
    const versions = this.objects.get(reference.key);
    versions?.delete(reference.versionId);
    if (versions?.size === 0) this.objects.delete(reference.key);
  }
}

class RecordingQueue implements SourceIngestionQueue {
  readonly submitted: string[] = [];

  async enqueue(_transaction: DatabaseTransaction, ingestionId: string) {
    this.submitted.push(ingestionId);
  }
}

class FakeMinerU implements MinerUProvider {
  readonly submittedFiles: Uint8Array[] = [];
  readonly pollResults: MinerUPollResult[] = [];
  pollCalls = 0;

  async submit(filePath: string) {
    this.submittedFiles.push(await readFile(filePath));
    return "mineru-batch-1";
  }

  async poll() {
    this.pollCalls += 1;
    return this.pollResults.shift() ?? { kind: "pending" as const };
  }
}

let testDatabase: Awaited<ReturnType<typeof createMigratedTestDatabase>>;
let actor: Actor;
let workspaceId: string;
let sourceId: string;
let storage: MemoryStorage;
let queue: RecordingQueue;
let provider: FakeMinerU;
let now: Date;
let dependencies: SourceIngestionProcessorDependencies;

beforeAll(async () => {
  testDatabase = await createMigratedTestDatabase();
});

beforeEach(async () => {
  await testDatabase.pool.query(
    "TRUNCATE TABLE public.source_ingestions, public.file_sources, public.sources, public.workspaces, public.principals CASCADE",
  );
  actor = await ensurePrincipalForAuthUser("ingestion-user", "ingestion-user", testDatabase.db);
  workspaceId = (await createWorkspace(actor, { name: "Ingestion" }, testDatabase.db)).id;
  sourceId = randomUUID();
  storage = new MemoryStorage();
  queue = new RecordingQueue();
  provider = new FakeMinerU();
  now = new Date("2026-07-15T09:00:00.000Z");
  const original = storage.put(
    `sources/${sourceId}/original`,
    new TextEncoder().encode("%PDF-1.7"),
  );
  await testDatabase.db.insert(sources).values({
    id: sourceId,
    workspaceId,
    kind: "uploaded_file",
  });
  await testDatabase.db.insert(fileSources).values({
    sourceId,
    originalFilename: "lesson.pdf",
    sizeBytes: 8,
    state: "stored",
    storageKey: original.key,
    storageVersionId: original.versionId,
  });
  dependencies = {
    db: testDatabase.db,
    storage,
    provider,
    analyzeMedia: vi.fn(),
    now: () => now,
  };
});

afterAll(async () => {
  await testDatabase.destroy();
});

test("selects the highest ingestion attempt with deterministic tie fields", async () => {
  const sameCreatedAt = new Date("2026-08-02T00:00:00.000Z");
  await testDatabase.db.insert(sourceIngestions).values([
    {
      id: "00000000-0000-4000-8000-000000000701",
      sourceId,
      sourceRevision: 1,
      provider: "native_text",
      state: "obsolete",
      attemptNumber: 1,
      createdAt: sameCreatedAt,
      updatedAt: sameCreatedAt,
      finishedAt: sameCreatedAt,
    },
    {
      id: "00000000-0000-4000-8000-000000000702",
      sourceId,
      sourceRevision: 1,
      provider: "native_text",
      state: "obsolete",
      attemptNumber: 2,
      createdAt: sameCreatedAt,
      updatedAt: sameCreatedAt,
      finishedAt: sameCreatedAt,
    },
  ]);

  await expect(latestSourceIngestions([sourceId], testDatabase.db)).resolves.toEqual(
    new Map([
      [
        sourceId,
        expect.objectContaining({
          attemptNumber: 2,
          id: "00000000-0000-4000-8000-000000000702",
        }),
      ],
    ]),
  );
});

test("submits, durably polls, and publishes one immutable MinerU result", async () => {
  const ingestion = await startSourceIngestion(actor, sourceId, {
    db: testDatabase.db,
    queue,
    now: () => now,
    randomId: randomUUID,
  });
  expect(queue.submitted).toEqual([ingestion.id]);

  await submitSourceIngestion(ingestion.id, dependencies);
  expect(Array.from(provider.submittedFiles[0] ?? [])).toEqual(
    Array.from(new TextEncoder().encode("%PDF-1.7")),
  );
  if (!storage.downloadedPath) throw new Error("MinerU source was not downloaded");
  await expect(access(storage.downloadedPath)).rejects.toThrow();

  provider.pollResults.push({ kind: "pending" });
  await pollSourceIngestion(ingestion.id, dependencies);

  provider.pollResults.push({ kind: "done", zipBytes: new Uint8Array([0x50, 0x4b, 1, 2]) });
  now = new Date("2026-07-15T09:01:00.000Z");
  await pollSourceIngestion(ingestion.id, dependencies);

  const listed = await listWorkspaceSources(actor, workspaceId, { db: testDatabase.db });
  const listedSource = listed[0];
  expect(listedSource?.kind).toBe("uploadedFile");
  if (listedSource?.kind !== "uploadedFile") {
    throw new Error("Expected an uploaded file Source");
  }
  expect(listedSource.ingestion).toMatchObject({
    id: ingestion.id,
    state: "ready",
    attemptNumber: 1,
  });
  const [ready] = await testDatabase.db
    .select()
    .from(sourceIngestions)
    .where(eq(sourceIngestions.id, ingestion.id));
  expect(ready).toMatchObject({
    providerBatchId: "mineru-batch-1",
    resultSizeBytes: 4,
    state: "ready",
  });
  expect(storage.objects.has(ready?.resultStorageKey ?? "missing")).toBe(true);
  const objectCount = storage.objects.size;
  await pollSourceIngestion(ingestion.id, dependencies);
  expect(storage.objects.size).toBe(objectCount);
});

test.each([
  "docx",
  "pptx",
] as const)("submits the original %s file directly to MinerU", async (extension) => {
  await testDatabase.db
    .update(fileSources)
    .set({ originalFilename: `lesson.${extension}` })
    .where(eq(fileSources.sourceId, sourceId));

  const ingestion = await startSourceIngestion(actor, sourceId, {
    db: testDatabase.db,
    queue,
    now: () => now,
    randomId: randomUUID,
  });
  await submitSourceIngestion(ingestion.id, dependencies);

  expect(provider.submittedFiles).toHaveLength(1);
  expect(Array.from(provider.submittedFiles[0] ?? [])).toEqual(
    Array.from(new TextEncoder().encode("%PDF-1.7")),
  );
});

test("does not resubmit MinerU after an ambiguous provider submission fence", async () => {
  const ingestion = await startSourceIngestion(actor, sourceId, {
    db: testDatabase.db,
    queue,
    now: () => now,
    randomId: randomUUID,
  });
  await testDatabase.db
    .update(sourceIngestions)
    .set({ providerSubmissionStartedAt: now })
    .where(eq(sourceIngestions.id, ingestion.id));

  await submitSourceIngestion(ingestion.id, dependencies);
  await submitSourceIngestion(ingestion.id, dependencies);

  expect(provider.submittedFiles).toHaveLength(0);
  const [failed] = await testDatabase.db
    .select()
    .from(sourceIngestions)
    .where(eq(sourceIngestions.id, ingestion.id));
  expect(failed).toMatchObject({
    errorCode: "provider_submission_unknown",
    providerBatchId: null,
    retryable: true,
    state: "failed",
  });
});

test("analyzes audio from an exact signed object version and archives normalized JSON", async () => {
  const audioBytes = Uint8Array.from([0xff, 0xfb, 0x90, 0x64, 0, 0, 0, 0]);
  const original = storage.put(`sources/${sourceId}/audio`, audioBytes);
  await testDatabase.db
    .update(fileSources)
    .set({
      originalFilename: "interview.mp3",
      sizeBytes: audioBytes.byteLength,
      storageKey: original.key,
      storageVersionId: original.versionId,
    })
    .where(eq(fileSources.sourceId, sourceId));
  const analyze = vi.mocked(dependencies.analyzeMedia);
  analyze.mockResolvedValue({
    summary: "A short interview.",
    segments: [{ startMs: 0, endMs: 1200, description: "The speaker says hello." }],
    usage: { promptTokens: 12, completionTokens: 8 },
  });

  const ingestion = await startSourceIngestion(actor, sourceId, {
    db: testDatabase.db,
    queue,
    now: () => now,
    randomId: randomUUID,
  });
  expect(ingestion.provider).toBe("media_understanding");

  await submitSourceIngestion(ingestion.id, dependencies);

  expect(provider.submittedFiles).toHaveLength(0);
  expect(storage.downloadUrlReferences).toEqual([original]);
  expect(analyze).toHaveBeenCalledWith({
    kind: "audio",
    url: "https://storage.invalid/media?signature=redacted",
    format: "mp3",
  });
  const [ready] = await testDatabase.db
    .select()
    .from(sourceIngestions)
    .where(eq(sourceIngestions.id, ingestion.id));
  expect(ready).toMatchObject({
    provider: "media_understanding",
    providerBatchId: null,
    state: "ready",
  });
  const resultBody = storage.objects
    .get(ready?.resultStorageKey ?? "")
    ?.get(ready?.resultStorageVersionId ?? "");
  expect(resultBody).toBeDefined();
  expect(JSON.parse(new TextDecoder().decode(resultBody))).toEqual({
    schemaVersion: 1,
    kind: "audio",
    format: "mp3",
    summary: "A short interview.",
    segments: [{ startMs: 0, endMs: 1200, description: "The speaker says hello." }],
    usage: { promptTokens: 12, completionTokens: 8 },
  });
});

test.each([
  "mp4",
  "mov",
  "mkv",
  "avi",
  "flv",
  "wmv",
] as const)("analyzes a %s video from an exact signed object version and archives normalized JSON", async (format) => {
  const videoBytes = Uint8Array.from([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
  ]);
  const original = storage.put(`sources/${sourceId}/video`, videoBytes);
  await testDatabase.db
    .update(fileSources)
    .set({
      originalFilename: `lecture.${format}`,
      sizeBytes: videoBytes.byteLength,
      storageKey: original.key,
      storageVersionId: original.versionId,
    })
    .where(eq(fileSources.sourceId, sourceId));
  const analyze = vi.mocked(dependencies.analyzeMedia);
  analyze.mockResolvedValue({
    summary: "A short lecture recording.",
    segments: [{ startMs: 0, endMs: 2200, description: "The title slide is introduced." }],
    usage: { promptTokens: 20, completionTokens: 9 },
  });

  const ingestion = await startSourceIngestion(actor, sourceId, {
    db: testDatabase.db,
    queue,
    now: () => now,
    randomId: randomUUID,
  });
  await submitSourceIngestion(ingestion.id, dependencies);

  expect(provider.submittedFiles).toHaveLength(0);
  expect(storage.downloadUrlReferences).toEqual([original]);
  expect(analyze).toHaveBeenCalledWith({
    kind: "video",
    url: "https://storage.invalid/media?signature=redacted",
  });
  const [ready] = await testDatabase.db
    .select()
    .from(sourceIngestions)
    .where(eq(sourceIngestions.id, ingestion.id));
  expect(ready).toMatchObject({
    provider: "media_understanding",
    providerBatchId: null,
    state: "ready",
  });
  const resultBody = storage.objects
    .get(ready?.resultStorageKey ?? "")
    ?.get(ready?.resultStorageVersionId ?? "");
  expect(resultBody).toBeDefined();
  expect(JSON.parse(new TextDecoder().decode(resultBody))).toEqual({
    schemaVersion: 1,
    kind: "video",
    format,
    summary: "A short lecture recording.",
    segments: [{ startMs: 0, endMs: 2200, description: "The title slide is introduced." }],
    usage: { promptTokens: 20, completionTokens: 9 },
  });
});

test.each([
  {
    filename: "notes.txt",
    body: "\uFEFF标题\r\n正文",
    expected: {
      schemaVersion: 1,
      kind: "text",
      format: "txt",
      content: "标题\n正文",
    },
  },
  {
    filename: "grades.csv",
    body: "name,score\n张三,95",
    expected: {
      schemaVersion: 1,
      kind: "table",
      format: "csv",
      rows: [
        ["name", "score"],
        ["张三", "95"],
      ],
    },
  },
  {
    filename: "data.json",
    body: '{"title":"课程"}',
    expected: {
      schemaVersion: 1,
      kind: "structured_text",
      format: "json",
      content: '{"title":"课程"}',
    },
  },
  {
    filename: "script.py",
    body: "print('课程')",
    expected: {
      schemaVersion: 1,
      kind: "code",
      format: "py",
      language: "python",
      content: "print('课程')",
    },
  },
])("parses $filename locally and archives normalized JSON", async ({
  filename,
  body,
  expected,
}) => {
  const originalBytes = new TextEncoder().encode(body);
  const original = storage.put(`sources/${sourceId}/native`, originalBytes);
  await testDatabase.db
    .update(fileSources)
    .set({
      originalFilename: filename,
      sizeBytes: originalBytes.byteLength,
      storageKey: original.key,
      storageVersionId: original.versionId,
    })
    .where(eq(fileSources.sourceId, sourceId));

  const ingestion = await startSourceIngestion(actor, sourceId, {
    db: testDatabase.db,
    queue,
    now: () => now,
    randomId: randomUUID,
  });
  expect(ingestion.provider).toBe("native_text");
  await submitSourceIngestion(ingestion.id, dependencies);

  expect(provider.submittedFiles).toHaveLength(0);
  expect(storage.downloadUrlReferences).toHaveLength(0);
  const [ready] = await testDatabase.db
    .select()
    .from(sourceIngestions)
    .where(eq(sourceIngestions.id, ingestion.id));
  expect(ready).toMatchObject({
    provider: "native_text",
    providerBatchId: null,
    state: "ready",
  });
  const resultBody = storage.objects
    .get(ready?.resultStorageKey ?? "")
    ?.get(ready?.resultStorageVersionId ?? "");
  expect(resultBody).toBeDefined();
  expect(JSON.parse(new TextDecoder().decode(resultBody))).toEqual(expected);
});

test("marks malformed native text as a stable non-retryable failure", async () => {
  const original = storage.put(`sources/${sourceId}/native`, new Uint8Array([0xc3, 0x28]));
  await testDatabase.db
    .update(fileSources)
    .set({
      originalFilename: "broken.txt",
      sizeBytes: 2,
      storageKey: original.key,
      storageVersionId: original.versionId,
    })
    .where(eq(fileSources.sourceId, sourceId));
  const ingestion = await startSourceIngestion(actor, sourceId, {
    db: testDatabase.db,
    queue,
    now: () => now,
    randomId: randomUUID,
  });

  let caught: unknown;
  try {
    await submitSourceIngestion(ingestion.id, dependencies);
  } catch (error) {
    caught = error;
  }
  expect(caught).toMatchObject({ code: "native_input_rejected" });
  const failure = ingestionFailure(caught);
  expect(failure).toEqual({ errorCode: "native_input_rejected", retryable: false });
  await markSourceIngestionFailed(ingestion.id, failure, {
    db: testDatabase.db,
    now: () => now,
  });
  const [failed] = await testDatabase.db
    .select()
    .from(sourceIngestions)
    .where(eq(sourceIngestions.id, ingestion.id));
  expect(failed).toMatchObject({
    state: "failed",
    errorCode: "native_input_rejected",
    retryable: false,
  });
});

test("returns retryable audio failures to queued so the DBOS retry can run", async () => {
  const original = storage.put(`sources/${sourceId}/audio`, new Uint8Array([0xff, 0xf1, 0, 0]));
  await testDatabase.db
    .update(fileSources)
    .set({
      originalFilename: "voice.aac",
      sizeBytes: 4,
      storageKey: original.key,
      storageVersionId: original.versionId,
    })
    .where(eq(fileSources.sourceId, sourceId));
  const analyze = vi.mocked(dependencies.analyzeMedia);
  analyze.mockRejectedValueOnce(new MediaUnderstandingError("media_timeout"));
  const ingestion = await startSourceIngestion(actor, sourceId, {
    db: testDatabase.db,
    queue,
    now: () => now,
    randomId: randomUUID,
  });

  await expect(submitSourceIngestion(ingestion.id, dependencies)).rejects.toMatchObject({
    code: "media_timeout",
  });

  const [retryable] = await testDatabase.db
    .select()
    .from(sourceIngestions)
    .where(eq(sourceIngestions.id, ingestion.id));
  expect(retryable).toMatchObject({ state: "queued", startedAt: null });
});

test("keeps a result version already published by a concurrent poll", async () => {
  const ingestion = await startSourceIngestion(actor, sourceId, {
    db: testDatabase.db,
    queue,
    now: () => now,
    randomId: randomUUID,
  });
  await submitSourceIngestion(ingestion.id, dependencies);

  let releaseHeads: (() => void) | undefined;
  const bothHeadsStarted = new Promise<void>((resolve) => {
    releaseHeads = resolve;
  });
  let resultHeadCalls = 0;
  const originalHeadObject = storage.headObject.bind(storage);
  storage.headObject = async (reference) => {
    if (!reference.key.includes("/ingestions/")) return originalHeadObject(reference);
    resultHeadCalls += 1;
    if (resultHeadCalls === 2) releaseHeads?.();
    await bothHeadsStarted;
    return null;
  };
  let sharedResult: ReturnType<MemoryStorage["put"]> | undefined;
  storage.putObject = async ({ key, body }) => {
    sharedResult ??= storage.put(key, body);
    return sharedResult;
  };

  const result = { kind: "done" as const, zipBytes: new Uint8Array([0x50, 0x4b, 1, 2]) };
  provider.pollResults.push(result, result);
  await Promise.all([
    pollSourceIngestion(ingestion.id, dependencies),
    pollSourceIngestion(ingestion.id, dependencies),
  ]);

  const [ready] = await testDatabase.db
    .select()
    .from(sourceIngestions)
    .where(eq(sourceIngestions.id, ingestion.id));
  expect(ready).toMatchObject({
    state: "ready",
    resultStorageKey: sharedResult?.key,
    resultStorageVersionId: sharedResult?.versionId,
  });
  expect(await originalHeadObject(sharedResult ?? { key: "missing" })).not.toBeNull();
});

test("creates a new attempt only after a retryable failure", async () => {
  const first = await startSourceIngestion(actor, sourceId, {
    db: testDatabase.db,
    queue,
    now: () => now,
    randomId: randomUUID,
  });
  await markSourceIngestionFailed(
    first.id,
    { errorCode: "mineru_unavailable", retryable: true },
    dependencies,
  );

  const retried = await startSourceIngestion(actor, sourceId, {
    db: testDatabase.db,
    queue,
    now: () => now,
    randomId: randomUUID,
  });
  expect(retried).toMatchObject({ state: "queued", attemptNumber: 2 });
  expect(queue.submitted).toEqual([first.id, retried.id]);
});

test("stops polling when an ingestion attempt reaches its deadline", async () => {
  const ingestion = await startSourceIngestion(actor, sourceId, {
    db: testDatabase.db,
    queue,
    now: () => now,
    randomId: randomUUID,
  });
  await submitSourceIngestion(ingestion.id, dependencies);
  now = new Date("2026-07-15T09:10:00.000Z");

  await pollSourceIngestion(ingestion.id, dependencies);

  expect(provider.pollCalls).toBe(0);
  const [failed] = await testDatabase.db
    .select()
    .from(sourceIngestions)
    .where(eq(sourceIngestions.id, ingestion.id));
  expect(failed).toMatchObject({
    state: "failed",
    providerBatchId: null,
    errorCode: "mineru_timeout",
    retryable: true,
  });
});

test("deletes the original and archived result without leaving an active ingestion", async () => {
  const ingestion = await startSourceIngestion(actor, sourceId, {
    db: testDatabase.db,
    queue,
    now: () => now,
    randomId: randomUUID,
  });
  await submitSourceIngestion(ingestion.id, dependencies);
  provider.pollResults.push({ kind: "done", zipBytes: new Uint8Array([0x50, 0x4b, 1, 2]) });
  await pollSourceIngestion(ingestion.id, dependencies);
  expect(storage.objects.size).toBe(2);

  await expect(
    deleteSource(actor, sourceId, {
      db: testDatabase.db,
      now: () => now,
      cleanupQueue: queue,
    }),
  ).resolves.toEqual({ cleanupPending: true });

  await purgeDeletedSource(sourceId, { db: testDatabase.db, storage });

  expect(storage.objects.size).toBe(0);
  const [obsolete] = await testDatabase.db
    .select()
    .from(sourceIngestions)
    .where(eq(sourceIngestions.id, ingestion.id));
  expect(obsolete).toMatchObject({
    state: "obsolete",
    providerBatchId: null,
    resultStorageKey: null,
    resultStorageVersionId: null,
  });
});
