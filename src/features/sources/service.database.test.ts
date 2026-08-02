import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { createMigratedTestDatabase } from "@tests/database";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import type { DatabaseTransaction } from "@/database/client";
import {
  fileSources,
  retrievalChunks,
  retrievalIndexGenerations,
  sourceIngestions,
  sources,
  workspacePermissionGrants,
  workspaceReferenceSources,
  workspaces,
} from "@/database/schema";
import { ensurePrincipalForAuthUser } from "@/features/identity/service";
import type { Actor } from "@/features/identity/types";
import {
  createWorkspace,
  setWorkspaceArchiveState,
  updateWorkspace,
} from "@/features/workspaces/service";
import {
  grantWorkspaceAccess,
  revokeWorkspaceAccess,
  setWorkspaceVisibility,
} from "@/features/workspaces/sharing.server";
import type { SourceCleanupQueue } from "./cleanup";
import { SourceError } from "./errors";
import type { SourceIngestionQueue } from "./ingestion/dbos";
import {
  addWorkspaceReference,
  completeSourceUpload,
  deleteSource,
  listWorkspaceReferenceCandidates,
  listWorkspaceSources,
  MAX_WORKSPACE_SOURCE_BYTES,
  prepareSourceUpload,
  purgeDeletedSource,
  resolveWorkspaceReferenceLocator,
  type SourceServiceDependencies,
  startSourceUpload,
} from "./service";
import type { InspectedObject, SourceStorage, VersionedObject } from "./storage";
import { MAX_NATIVE_TEXT_SOURCE_FILE_BYTES } from "./validation";

class FakeSourceStorage implements SourceStorage {
  readonly objects = new Map<string, Map<string, Uint8Array>>();
  lastUploadKey: string | undefined;
  copyCount = 0;
  failCreate = false;
  failHead = false;
  failDelete = false;

  async createUploadUrl({ key }: { key: string; expiresInSeconds: number }) {
    if (this.failCreate) throw new Error("storage unavailable");
    this.lastUploadKey = key;
    return { url: `https://storage.invalid/${encodeURIComponent(key)}?signature=secret` };
  }

  async createDownloadUrl({ reference }: { reference: VersionedObject; expiresInSeconds: number }) {
    return { url: `https://storage.invalid/${reference.key}?versionId=${reference.versionId}` };
  }

  put(key: string, body: Uint8Array) {
    const versionId = randomUUID();
    const versions = this.objects.get(key) ?? new Map<string, Uint8Array>();
    versions.set(versionId, body);
    this.objects.set(key, versions);
    return versionId;
  }

  async headObject({ key, versionId }: { key: string; versionId?: string }) {
    if (this.failHead) throw new Error("storage unavailable");
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
    this.copyCount += 1;
    const versionId = this.put(destinationKey, body);
    return { key: destinationKey, versionId };
  }

  async downloadObjectToFile(reference: VersionedObject, destinationPath: string) {
    const body = this.objects.get(reference.key)?.get(reference.versionId);
    if (!body) throw new Error("object not found");
    await writeFile(destinationPath, body);
  }

  async putObject({ key, body }: { key: string; body: Uint8Array; contentType: string }) {
    return { key, versionId: this.put(key, body) };
  }

  async deleteObjectVersion(reference: VersionedObject) {
    if (this.failDelete) throw new Error("storage unavailable");
    const versions = this.objects.get(reference.key);
    versions?.delete(reference.versionId);
    if (versions?.size === 0) this.objects.delete(reference.key);
  }
}

class FakeIngestionQueue implements SourceIngestionQueue {
  readonly submitted: string[] = [];
  failSubmit = false;

  async enqueue(_transaction: DatabaseTransaction, ingestionId: string) {
    if (this.failSubmit) throw new Error("queue unavailable");
    this.submitted.push(ingestionId);
  }
}

function fileBytes(signature: string, size = 1024) {
  const bytes = new Uint8Array(size);
  bytes.set(new TextEncoder().encode(signature));
  return bytes;
}

function binaryFileBytes(signature: number[], size = 1024) {
  const bytes = new Uint8Array(size);
  bytes.set(signature);
  return bytes;
}

let testDatabase: Awaited<ReturnType<typeof createMigratedTestDatabase>>;
let alice: Actor;
let bob: Actor;
let charlie: Actor;
let workspaceId: string;
let storage: FakeSourceStorage;
let now: Date;
let dependencies: SourceServiceDependencies & { cleanupQueue: SourceCleanupQueue };
let ingestionQueue: FakeIngestionQueue;

async function sourceFacts(sourceId: string) {
  const [row] = await testDatabase.db
    .select({ source: sources, file: fileSources })
    .from(sources)
    .innerJoin(fileSources, eq(fileSources.sourceId, sources.id))
    .where(eq(sources.id, sourceId));
  return row;
}

async function allowWorkspaceReferences(...workspaceIds: string[]) {
  await testDatabase.db
    .update(workspaces)
    .set({ referenceable: true })
    .where(inArray(workspaces.id, workspaceIds));
}

beforeAll(async () => {
  testDatabase = await createMigratedTestDatabase();
});

beforeEach(async () => {
  await testDatabase.pool.query(
    "TRUNCATE TABLE public.file_sources, public.sources, public.workspaces, public.principals CASCADE",
  );
  alice = await ensurePrincipalForAuthUser("auth-alice", "alice", testDatabase.db);
  bob = await ensurePrincipalForAuthUser("auth-bob", "bob", testDatabase.db);
  charlie = await ensurePrincipalForAuthUser("auth-charlie", "charlie", testDatabase.db);
  workspaceId = (await createWorkspace(alice, { name: "Notes" }, testDatabase.db)).id;
  storage = new FakeSourceStorage();
  ingestionQueue = new FakeIngestionQueue();
  now = new Date("2026-07-15T08:00:00.000Z");
  dependencies = {
    db: testDatabase.db,
    storage,
    now: () => now,
    randomId: randomUUID,
    ingestionQueue,
    cleanupQueue: ingestionQueue,
  };
});

afterAll(async () => {
  await testDatabase.destroy();
});

describe("Workspace references", () => {
  test("lists referenceable owned, shared, and public candidates without exposing public non-referenceable workspaces", async () => {
    const available = await createWorkspace(alice, { name: "Available" }, testDatabase.db);
    const referenced = await createWorkspace(alice, { name: "Referenced" }, testDatabase.db);
    const archived = await createWorkspace(alice, { name: "Archived" }, testDatabase.db);
    const shared = await createWorkspace(bob, { name: "Shared", slug: "shared" }, testDatabase.db);
    const publicOnly = await createWorkspace(
      bob,
      { name: "Public only", slug: "public-only" },
      testDatabase.db,
    );
    const publicLibrary = await createWorkspace(
      bob,
      { name: "Public library", slug: "public-library" },
      testDatabase.db,
    );
    await allowWorkspaceReferences(available.id, referenced.id, shared.id);
    await allowWorkspaceReferences(publicLibrary.id);
    await setWorkspaceArchiveState(alice, archived.id, "archived", testDatabase.db);
    await addWorkspaceReference(alice, workspaceId, referenced.id, { db: testDatabase.db });
    await grantWorkspaceAccess(bob, shared.id, alice.handle, testDatabase.db);
    await setWorkspaceVisibility(bob, publicOnly.id, "public", testDatabase.db);
    await setWorkspaceVisibility(bob, publicLibrary.id, "public", testDatabase.db);

    const result = await listWorkspaceReferenceCandidates(alice, workspaceId, {
      db: testDatabase.db,
    });

    expect(result.totalOtherWorkspaces).toBe(4);
    expect(result.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: available.id,
          relationship: "owned",
          ownerHandle: alice.handle,
        }),
        expect.objectContaining({
          id: shared.id,
          relationship: "shared",
          ownerHandle: bob.handle,
          canonicalHref: "/bob/shared",
        }),
        expect.objectContaining({
          id: publicLibrary.id,
          relationship: "public",
          ownerHandle: bob.handle,
          canonicalHref: "/bob/public-library",
        }),
      ]),
    );
    expect(result.candidates.map((candidate) => candidate.id)).not.toContain(workspaceId);
    expect(result.candidates.map((candidate) => candidate.id)).not.toContain(referenced.id);
    expect(result.candidates.map((candidate) => candidate.id)).not.toContain(archived.id);
    expect(result.candidates.map((candidate) => candidate.id)).not.toContain(publicOnly.id);
  });

  test("adds an idempotent Workspace Source and lists it beside file Sources", async () => {
    const target = await createWorkspace(alice, { name: "Course B" }, testDatabase.db);
    await allowWorkspaceReferences(target.id);
    const file = await startSourceUpload(
      alice,
      workspaceId,
      { originalFilename: "notes.pdf", declaredSizeBytes: 1024 },
      dependencies,
    );

    const first = await addWorkspaceReference(alice, workspaceId, target.id, {
      db: testDatabase.db,
    });
    const repeated = await addWorkspaceReference(alice, workspaceId, target.id, {
      db: testDatabase.db,
    });
    const listed = await listWorkspaceSources(alice, workspaceId, { db: testDatabase.db });

    expect(repeated).toEqual(first);
    expect(listed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: file.source.id, kind: "uploadedFile" }),
        expect.objectContaining({
          id: first.id,
          kind: "workspaceReference",
          targetWorkspace: expect.objectContaining({ id: target.id, name: "Course B" }),
        }),
      ]),
    );
    const referenceRows = await testDatabase.db.select().from(workspaceReferenceSources);
    expect(referenceRows).toHaveLength(1);
  });

  test("immediately disables link resolution, new references, and existing reference reads", async () => {
    const target = await createWorkspace(
      alice,
      { name: "Reference policy", slug: "reference-policy" },
      testDatabase.db,
    );
    await allowWorkspaceReferences(target.id);
    const reference = await addWorkspaceReference(alice, workspaceId, target.id, {
      db: testDatabase.db,
    });

    await testDatabase.db
      .update(workspaces)
      .set({ referenceable: false })
      .where(eq(workspaces.id, target.id));

    await expect(
      resolveWorkspaceReferenceLocator(alice, workspaceId, "alice/reference-policy", {
        db: testDatabase.db,
      }),
    ).rejects.toEqual(new SourceError("source_not_found"));
    await expect(
      addWorkspaceReference(alice, workspaceId, target.id, { db: testDatabase.db }),
    ).rejects.toEqual(new SourceError("source_not_found"));
    await expect(
      listWorkspaceSources(alice, workspaceId, { db: testDatabase.db }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: reference.id,
        accessState: "unavailable",
      }),
    ]);
  });

  test("soft-removes and restores the same Workspace Source without cleanup", async () => {
    const target = await createWorkspace(alice, { name: "Course B" }, testDatabase.db);
    await allowWorkspaceReferences(target.id);
    const created = await addWorkspaceReference(alice, workspaceId, target.id, {
      db: testDatabase.db,
    });

    await expect(deleteSource(alice, created.id, dependencies)).resolves.toEqual({
      cleanupPending: false,
    });
    await expect(
      listWorkspaceSources(alice, workspaceId, { db: testDatabase.db }),
    ).resolves.toEqual([]);

    const restored = await addWorkspaceReference(alice, workspaceId, target.id, {
      db: testDatabase.db,
    });
    expect(restored.id).toBe(created.id);
    expect(ingestionQueue.submitted).toEqual([]);
  });

  test("allows authorized cross-account references and rejects inaccessible, archived, and self targets", async () => {
    const foreign = await createWorkspace(
      bob,
      { name: "Foreign", slug: "foreign" },
      testDatabase.db,
    );
    const inaccessible = await createWorkspace(bob, { name: "Inaccessible" }, testDatabase.db);
    const archived = await createWorkspace(alice, { name: "Archived" }, testDatabase.db);
    await allowWorkspaceReferences(foreign.id, inaccessible.id, archived.id);
    await setWorkspaceArchiveState(alice, archived.id, "archived", testDatabase.db);
    await grantWorkspaceAccess(bob, foreign.id, alice.handle, testDatabase.db);

    await expect(
      addWorkspaceReference(alice, workspaceId, inaccessible.id, { db: testDatabase.db }),
    ).rejects.toEqual(new SourceError("source_not_found"));
    await expect(
      addWorkspaceReference(alice, workspaceId, foreign.id, { db: testDatabase.db }),
    ).resolves.toMatchObject({
      accessState: "available",
      targetWorkspace: {
        id: foreign.id,
        ownerHandle: bob.handle,
        canonicalHref: "/bob/foreign",
      },
    });
    await expect(
      addWorkspaceReference(alice, workspaceId, archived.id, { db: testDatabase.db }),
    ).rejects.toEqual(new SourceError("source_not_found"));
    await expect(
      addWorkspaceReference(alice, workspaceId, workspaceId, { db: testDatabase.db }),
    ).rejects.toEqual(new SourceError("source_invalid_state"));
    await expect(
      listWorkspaceReferenceCandidates(bob, workspaceId, { db: testDatabase.db }),
    ).rejects.toEqual(new SourceError("source_not_found"));
  });

  test("shows a metadata-free placeholder to a Source manager and hides it from ordinary readers", async () => {
    const destination = await createWorkspace(
      alice,
      { name: "Destination", slug: "destination" },
      testDatabase.db,
    );
    const target = await createWorkspace(
      bob,
      { name: "Private target", slug: "private-target" },
      testDatabase.db,
    );
    await allowWorkspaceReferences(target.id);
    await grantWorkspaceAccess(bob, target.id, alice.handle, testDatabase.db);
    const reference = await addWorkspaceReference(alice, destination.id, target.id, {
      db: testDatabase.db,
    });
    await grantWorkspaceAccess(alice, destination.id, charlie.handle, testDatabase.db);
    await revokeWorkspaceAccess(bob, target.id, alice.principalId, testDatabase.db);

    const managerSources = await listWorkspaceSources(alice, destination.id, {
      db: testDatabase.db,
    });
    expect(managerSources).toEqual([
      {
        id: reference.id,
        workspaceId: destination.id,
        kind: "workspaceReference",
        accessState: "unavailable",
        createdAt: reference.createdAt,
        updatedAt: reference.updatedAt,
      },
    ]);
    expect(JSON.stringify(managerSources)).not.toContain(target.id);
    expect(JSON.stringify(managerSources)).not.toContain("Private target");
    await expect(
      listWorkspaceSources(charlie, destination.id, { db: testDatabase.db }),
    ).resolves.toEqual([]);

    await grantWorkspaceAccess(bob, target.id, alice.handle, testDatabase.db);
    await expect(
      listWorkspaceSources(alice, destination.id, { db: testDatabase.db }),
    ).resolves.toEqual([
      expect.objectContaining({
        accessState: "available",
        targetWorkspace: expect.objectContaining({ id: target.id }),
      }),
    ]);
  });

  test("lets an explicitly authorized Source manager remove an unavailable reference", async () => {
    const destination = await createWorkspace(alice, { name: "Destination" }, testDatabase.db);
    const target = await createWorkspace(
      bob,
      { name: "Private target", slug: "private-target" },
      testDatabase.db,
    );
    await allowWorkspaceReferences(target.id);
    await grantWorkspaceAccess(bob, target.id, alice.handle, testDatabase.db);
    const reference = await addWorkspaceReference(alice, destination.id, target.id, {
      db: testDatabase.db,
    });
    await revokeWorkspaceAccess(bob, target.id, alice.principalId, testDatabase.db);
    await testDatabase.db.insert(workspacePermissionGrants).values(
      (["workspace.read", "source.manage"] as const).map((permission) => ({
        workspaceId: destination.id,
        principalId: charlie.principalId,
        permission,
        grantedByPrincipalId: alice.principalId,
      })),
    );

    await expect(
      listWorkspaceSources(charlie, destination.id, { db: testDatabase.db }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: reference.id,
        accessState: "unavailable",
      }),
    ]);
    await expect(deleteSource(charlie, reference.id, dependencies)).resolves.toEqual({
      cleanupPending: false,
    });
    await expect(
      listWorkspaceSources(charlie, destination.id, { db: testDatabase.db }),
    ).resolves.toEqual([]);
  });

  test("treats an archived reference target as unavailable without deleting its edge", async () => {
    const target = await createWorkspace(alice, { name: "Course B" }, testDatabase.db);
    await allowWorkspaceReferences(target.id);
    await addWorkspaceReference(alice, workspaceId, target.id, { db: testDatabase.db });
    await setWorkspaceArchiveState(alice, target.id, "archived", testDatabase.db);

    const listed = await listWorkspaceSources(alice, workspaceId, { db: testDatabase.db });

    expect(listed).toEqual([
      expect.objectContaining({
        kind: "workspaceReference",
        accessState: "unavailable",
      }),
    ]);
    expect(await testDatabase.db.select().from(workspaceReferenceSources)).toHaveLength(1);
  });

  test("resolves public and historical workspace links to the canonical address", async () => {
    const target = await createWorkspace(
      bob,
      { name: "Public target", slug: "old-target" },
      testDatabase.db,
    );
    await allowWorkspaceReferences(target.id);
    await setWorkspaceVisibility(bob, target.id, "public", testDatabase.db);
    await updateWorkspace(
      bob,
      target.id,
      { name: target.name, slug: "current-target" },
      testDatabase.db,
    );

    await expect(
      resolveWorkspaceReferenceLocator(
        alice,
        workspaceId,
        "https://spectra.invalid/bob/old-target",
        { db: testDatabase.db, applicationOrigin: "https://spectra.invalid" },
      ),
    ).resolves.toMatchObject({
      resolvedFromRedirect: true,
      candidate: {
        id: target.id,
        ownerHandle: bob.handle,
        relationship: "public",
        canonicalHref: "/bob/current-target",
      },
    });
  });

  test("rejects absolute workspace links from another origin", async () => {
    const target = await createWorkspace(
      bob,
      { name: "Public target", slug: "public-target" },
      testDatabase.db,
    );
    await allowWorkspaceReferences(target.id);
    await setWorkspaceVisibility(bob, target.id, "public", testDatabase.db);

    await expect(
      resolveWorkspaceReferenceLocator(
        alice,
        workspaceId,
        "https://evil.example/bob/public-target",
        { db: testDatabase.db, applicationOrigin: "https://spectra.example" },
      ),
    ).rejects.toEqual(new SourceError("source_not_found"));
  });

  test("does not reveal restricted workspace locators", async () => {
    await createWorkspace(
      bob,
      { name: "Restricted target", slug: "restricted-target" },
      testDatabase.db,
    );

    await expect(
      resolveWorkspaceReferenceLocator(alice, workspaceId, "bob/restricted-target", {
        db: testDatabase.db,
      }),
    ).rejects.toEqual(new SourceError("source_not_found"));
  });
});

describe("Source upload lifecycle", () => {
  test("rejects native text above its lower format limit", async () => {
    await expect(
      startSourceUpload(
        alice,
        workspaceId,
        {
          originalFilename: "oversized.txt",
          declaredSizeBytes: MAX_NATIVE_TEXT_SOURCE_FILE_BYTES + 1,
        },
        dependencies,
      ),
    ).rejects.toMatchObject({ code: "source_file_too_large" });
  });

  test("starts a private pending upload without exposing storage identity", async () => {
    const target = await startSourceUpload(
      alice,
      workspaceId,
      { originalFilename: " Notes.PDF ", declaredSizeBytes: 1024 },
      dependencies,
    );

    expect(target.source).toMatchObject({
      workspaceId,
      originalFilename: "Notes.PDF",
      sizeBytes: 1024,
      state: "pending_upload",
      uploadGeneration: 1,
    });
    expect(target.upload).toMatchObject({ method: "PUT", generation: 1 });
    expect(target.source).not.toHaveProperty("uploadKey");
    expect(target.source).not.toHaveProperty("storageKey");
  });

  test("rolls back both Source rows when upload signing fails", async () => {
    storage.failCreate = true;

    await expect(
      startSourceUpload(
        alice,
        workspaceId,
        { originalFilename: "notes.pdf", declaredSizeBytes: 1024 },
        dependencies,
      ),
    ).rejects.toMatchObject({ code: "source_storage_unavailable" });

    const counts = await testDatabase.pool.query<{ fileSources: string; sources: string }>(
      `SELECT (SELECT count(*) FROM public.sources) AS sources,
              (SELECT count(*) FROM public.file_sources) AS "fileSources"`,
    );
    expect(counts.rows).toEqual([{ fileSources: "0", sources: "0" }]);
  });

  test("hides missing and foreign Workspaces behind source_not_found", async () => {
    await expect(
      startSourceUpload(
        bob,
        workspaceId,
        { originalFilename: "notes.pdf", declaredSizeBytes: 1024 },
        dependencies,
      ),
    ).rejects.toMatchObject({ code: "source_not_found" });
    await expect(
      startSourceUpload(
        alice,
        "not-a-uuid",
        { originalFilename: "notes.pdf", declaredSizeBytes: 1024 },
        dependencies,
      ),
    ).rejects.toMatchObject({ code: "source_not_found" });
    await expect(
      startSourceUpload(
        alice,
        randomUUID(),
        { originalFilename: "notes.pdf", declaredSizeBytes: 1024 },
        dependencies,
      ),
    ).rejects.toMatchObject({ code: "source_not_found" });
  });

  test("serializes quota reservations so concurrent starts cannot exceed 1 GiB", async () => {
    const reservedSize = 50 * 1024 * 1024;
    const reservations = Array.from({ length: 20 }, () => ({
      id: randomUUID(),
      uploadKey: `staging/${randomUUID()}`,
    }));
    await testDatabase.db.transaction(async (transaction) => {
      await transaction.insert(sources).values(
        reservations.map(({ id }) => ({
          id,
          workspaceId,
          kind: "uploaded_file" as const,
        })),
      );
      await transaction.insert(fileSources).values(
        reservations.map(({ id, uploadKey }) => ({
          sourceId: id,
          originalFilename: "reserved.pdf",
          sizeBytes: reservedSize,
          uploadKey,
          uploadExpiresAt: new Date(now.getTime() + 60_000),
        })),
      );
    });
    const input = { originalFilename: "more.pdf", declaredSizeBytes: 20 * 1024 * 1024 };
    const results = await Promise.allSettled([
      startSourceUpload(alice, workspaceId, input, dependencies),
      startSourceUpload(alice, workspaceId, input, dependencies),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({
      reason: expect.objectContaining({ code: "source_workspace_quota_exceeded" }),
    });
    const [usage] = await testDatabase.db
      .select({ bytes: fileSources.sizeBytes })
      .from(fileSources)
      .innerJoin(sources, eq(fileSources.sourceId, sources.id))
      .where(eq(sources.workspaceId, workspaceId));
    expect(usage).toBeDefined();
    const total = await testDatabase.pool.query<{ total: string }>(
      `SELECT sum(file_sources.size_bytes) AS total
         FROM public.file_sources
         JOIN public.sources ON sources.id = file_sources.source_id
        WHERE sources.workspace_id = $1`,
      [workspaceId],
    );
    expect(Number(total.rows[0]?.total)).toBeLessThanOrEqual(MAX_WORKSPACE_SOURCE_BYTES);
  });

  test("re-signs an active upload and renews only after expiry", async () => {
    const started = await startSourceUpload(
      alice,
      workspaceId,
      { originalFilename: "notes.pdf", declaredSizeBytes: 1024 },
      dependencies,
    );
    const resigned = await prepareSourceUpload(alice, started.source.id, dependencies);
    expect(resigned.upload).toMatchObject({ generation: 1, expiresAt: started.upload.expiresAt });

    now = new Date(started.upload.expiresAt);
    const renewed = await prepareSourceUpload(alice, started.source.id, dependencies);
    expect(renewed.upload.generation).toBe(2);
    await expect(
      completeSourceUpload(alice, started.source.id, 1, dependencies),
    ).rejects.toMatchObject({ code: "source_upload_mismatch" });
  });

  test("freezes a verified upload and makes completion idempotent", async () => {
    const started = await startSourceUpload(
      alice,
      workspaceId,
      { originalFilename: "notes.pdf", declaredSizeBytes: 1024 },
      dependencies,
    );
    storage.put(storage.lastUploadKey as string, fileBytes("%PDF-1.7"));

    const [first, second] = await Promise.all([
      completeSourceUpload(alice, started.source.id, 1, dependencies),
      completeSourceUpload(alice, started.source.id, 1, dependencies),
    ]);

    expect(first.state).toBe("stored");
    expect(second).toEqual(first);
    expect(storage.copyCount).toBe(1);
    expect(storage.objects.has(`sources/${started.source.id}/original`)).toBe(true);
  });

  test("keeps the Source stored when ingestion enqueue fails and retries atomically", async () => {
    const started = await startSourceUpload(
      alice,
      workspaceId,
      { originalFilename: "notes.pdf", declaredSizeBytes: 1024 },
      dependencies,
    );
    storage.put(storage.lastUploadKey as string, fileBytes("%PDF-1.7"));
    ingestionQueue.failSubmit = true;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const completed = await completeSourceUpload(alice, started.source.id, 1, dependencies);

    expect(completed).toMatchObject({ state: "stored", ingestion: null });
    await expect(testDatabase.db.select().from(sourceIngestions)).resolves.toHaveLength(0);
    ingestionQueue.failSubmit = false;
    const retried = await completeSourceUpload(alice, started.source.id, 1, dependencies);
    expect(retried.ingestion).toMatchObject({ state: "queued", attemptNumber: 1 });
    expect(ingestionQueue.submitted).toEqual([retried.ingestion?.id]);
    consoleError.mockRestore();
  });

  test("preserves a committed final version when the transaction result is uncertain", async () => {
    const started = await startSourceUpload(
      alice,
      workspaceId,
      { originalFilename: "notes.pdf", declaredSizeBytes: 1024 },
      dependencies,
    );
    storage.put(storage.lastUploadKey as string, fileBytes("%PDF-1.7"));
    const uncertainDatabase = new Proxy(dependencies.db, {
      get(target, property, receiver) {
        if (property !== "transaction") return Reflect.get(target, property, receiver);
        return async (...args: unknown[]) => {
          await Reflect.apply(target.transaction, target, args);
          throw new Error("commit response lost");
        };
      },
    });

    await expect(
      completeSourceUpload(alice, started.source.id, 1, {
        ...dependencies,
        db: uncertainDatabase,
      }),
    ).resolves.toMatchObject({ state: "stored" });
    expect(storage.objects.has(`sources/${started.source.id}/original`)).toBe(true);
  });

  test("keeps missing objects and temporary storage failures pending", async () => {
    const missing = await startSourceUpload(
      alice,
      workspaceId,
      { originalFilename: "missing.pdf", declaredSizeBytes: 1024 },
      dependencies,
    );
    await expect(
      completeSourceUpload(alice, missing.source.id, 1, dependencies),
    ).rejects.toMatchObject({ code: "source_upload_incomplete" });

    storage.failHead = true;
    await expect(
      completeSourceUpload(alice, missing.source.id, 1, dependencies),
    ).rejects.toMatchObject({ code: "source_storage_unavailable" });
    const row = await sourceFacts(missing.source.id);
    expect(row?.file.state).toBe("pending_upload");
  });

  test.each([
    { name: "wrong.pdf", body: fileBytes("not-a-pdf"), code: "source_file_type_unsupported" },
    { name: "wrong.pdf", body: fileBytes("%PDF-1.7", 512), code: "source_upload_mismatch" },
  ])("rejects permanent upload mismatch %#", async ({ name, body, code }) => {
    const started = await startSourceUpload(
      alice,
      workspaceId,
      { originalFilename: name, declaredSizeBytes: 1024 },
      dependencies,
    );
    storage.put(storage.lastUploadKey as string, body);

    await expect(
      completeSourceUpload(alice, started.source.id, 1, dependencies),
    ).rejects.toMatchObject({ code });
    const [row] = await testDatabase.db
      .select()
      .from(fileSources)
      .where(and(eq(fileSources.sourceId, started.source.id), eq(fileSources.state, "failed")));
    expect(row?.failureCode).toBe(code);
  });

  test("commits a permanent rejection even when staging cleanup is unavailable", async () => {
    const started = await startSourceUpload(
      alice,
      workspaceId,
      { originalFilename: "wrong.pdf", declaredSizeBytes: 1024 },
      dependencies,
    );
    storage.put(storage.lastUploadKey as string, fileBytes("not-a-pdf"));
    storage.failDelete = true;

    await expect(
      completeSourceUpload(alice, started.source.id, 1, dependencies),
    ).rejects.toMatchObject({ code: "source_file_type_unsupported" });
    const row = await sourceFacts(started.source.id);
    expect(row?.file).toMatchObject({
      state: "failed",
      failureCode: "source_file_type_unsupported",
      uploadKey: null,
    });
  });

  test.each([
    "lesson.docx",
    "slides.pptx",
    "grades.xlsx",
  ])("accepts the bounded ZIP-container contract for %s", async (originalFilename) => {
    const started = await startSourceUpload(
      alice,
      workspaceId,
      { originalFilename, declaredSizeBytes: 1024 },
      dependencies,
    );
    storage.put(storage.lastUploadKey as string, fileBytes("PK\u0003\u0004"));

    await expect(
      completeSourceUpload(alice, started.source.id, 1, dependencies),
    ).resolves.toMatchObject({ state: "stored" });
  });

  test.each([
    { name: "notes.txt", body: new TextEncoder().encode("中文 notes") },
    { name: "readme.md", body: new TextEncoder().encode("# 标题\r\n正文") },
    { name: "grades.csv", body: new TextEncoder().encode("name,score\n张三,95") },
    { name: "data.json", body: new TextEncoder().encode('{"title":"课程"}') },
    { name: "settings.yaml", body: new TextEncoder().encode("title: 课程") },
    { name: "settings.yml", body: new TextEncoder().encode("title: 课程") },
    { name: "document.xml", body: new TextEncoder().encode("<title>课程</title>") },
    { name: "page.html", body: new TextEncoder().encode("<h1>课程</h1>") },
    {
      name: "captions.srt",
      body: new TextEncoder().encode("1\n00:00:00,000 --> 00:00:01,000\n课程"),
    },
    {
      name: "captions.vtt",
      body: new TextEncoder().encode("WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n课程"),
    },
    {
      name: "analysis.ipynb",
      body: new TextEncoder().encode('{"nbformat":4,"metadata":{},"cells":[]}'),
    },
    { name: "script.py", body: new TextEncoder().encode("print('课程')") },
    { name: "types.ts", body: new TextEncoder().encode("type Course = string") },
    { name: "browser.js", body: new TextEncoder().encode("const course = '课程'") },
    { name: "Main.java", body: new TextEncoder().encode("class Main {}") },
    { name: "program.cpp", body: new TextEncoder().encode("int main() {}") },
    { name: "server.go", body: new TextEncoder().encode("package main") },
    { name: "library.rs", body: new TextEncoder().encode("fn main() {}") },
    { name: "query.sql", body: new TextEncoder().encode("SELECT '课程'") },
  ])("accepts bounded UTF-8 native text for $name", async ({ name, body }) => {
    const started = await startSourceUpload(
      alice,
      workspaceId,
      { originalFilename: name, declaredSizeBytes: body.byteLength },
      dependencies,
    );
    storage.put(storage.lastUploadKey as string, body);

    await expect(
      completeSourceUpload(alice, started.source.id, 1, dependencies),
    ).resolves.toMatchObject({
      state: "stored",
      ingestion: { provider: "native_text", state: "queued" },
    });
  });

  test.each([
    { name: "binary.txt", body: binaryFileBytes([0xc3, 0x28]) },
    { name: "binary.csv", body: binaryFileBytes([0x61, 0x00, 0x62]) },
    { name: "binary.json", body: binaryFileBytes([0xc3, 0x28]) },
    { name: "binary.py", body: binaryFileBytes([0x61, 0x00, 0x62]) },
  ])("rejects non-text content disguised as $name", async ({ name, body }) => {
    const started = await startSourceUpload(
      alice,
      workspaceId,
      { originalFilename: name, declaredSizeBytes: body.byteLength },
      dependencies,
    );
    storage.put(storage.lastUploadKey as string, body);
    await expect(
      completeSourceUpload(alice, started.source.id, 1, dependencies),
    ).rejects.toMatchObject({ code: "source_file_type_unsupported" });
  });

  test.each([
    { name: "recording.mp3", body: binaryFileBytes([0xff, 0xfb, 0x90, 0x64]) },
    {
      name: "recording.wav",
      body: fileBytes("RIFFxxxxWAVEfmt "),
    },
    { name: "recording.aac", body: binaryFileBytes([0xff, 0xf1, 0x50, 0x80, 0, 0, 0]) },
    {
      name: "lecture.mp4",
      body: binaryFileBytes([
        0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02,
        0x00, 0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
      ]),
    },
    {
      name: "lecture.mov",
      body: binaryFileBytes([
        0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20, 0x00, 0x00, 0x00,
        0x00, 0x71, 0x74, 0x20, 0x20,
      ]),
    },
    {
      name: "lecture.mkv",
      body: binaryFileBytes([
        0x1a, 0x45, 0xdf, 0xa3, 0x93, 0x42, 0x82, 0x88, 0x6d, 0x61, 0x74, 0x72, 0x6f, 0x73, 0x6b,
        0x61,
      ]),
    },
    { name: "lecture.avi", body: fileBytes("RIFFxxxxAVI LIST") },
    { name: "lecture.flv", body: binaryFileBytes([0x46, 0x4c, 0x56, 0x01, 0x05]) },
    {
      name: "lecture.wmv",
      body: binaryFileBytes(
        [
          0x30, 0x26, 0xb2, 0x75, 0x8e, 0x66, 0xcf, 0x11, 0xa6, 0xd9, 0x00, 0xaa, 0x00, 0x62, 0xce,
          0x6c,
        ],
        54,
      ),
    },
  ])("accepts verified media content for $name", async ({ name, body }) => {
    const started = await startSourceUpload(
      alice,
      workspaceId,
      { originalFilename: name, declaredSizeBytes: body.byteLength },
      dependencies,
    );
    storage.put(storage.lastUploadKey as string, body);

    await expect(
      completeSourceUpload(alice, started.source.id, 1, dependencies),
    ).resolves.toMatchObject({
      state: "stored",
      ingestion: { provider: "media_understanding", state: "queued" },
    });
  });

  test("does not complete an expired upload", async () => {
    const started = await startSourceUpload(
      alice,
      workspaceId,
      { originalFilename: "notes.pdf", declaredSizeBytes: 1024 },
      dependencies,
    );
    storage.put(storage.lastUploadKey as string, fileBytes("%PDF-1.7"));
    now = new Date(started.upload.expiresAt);

    await expect(
      completeSourceUpload(alice, started.source.id, 1, dependencies),
    ).rejects.toBeInstanceOf(SourceError);
    await expect(
      completeSourceUpload(alice, started.source.id, 1, dependencies),
    ).rejects.toMatchObject({ code: "source_upload_expired" });
  });

  test("locks only the completing Source, not its whole Workspace", async () => {
    const started = await startSourceUpload(
      alice,
      workspaceId,
      { originalFilename: "notes.pdf", declaredSizeBytes: 1024 },
      dependencies,
    );
    storage.put(storage.lastUploadKey as string, fileBytes("%PDF-1.7"));

    const originalCopy = storage.copyObjectConditionally.bind(storage);
    let releaseCopy: () => void = () => {};
    const copyGate = new Promise<void>((resolve) => {
      releaseCopy = resolve;
    });
    let markCopyStarted: () => void = () => {};
    const copyStarted = new Promise<void>((resolve) => {
      markCopyStarted = resolve;
    });
    storage.copyObjectConditionally = async (input) => {
      markCopyStarted();
      await copyGate;
      return originalCopy(input);
    };

    const completion = completeSourceUpload(alice, started.source.id, 1, dependencies);
    await copyStarted;
    const concurrentStart = startSourceUpload(
      alice,
      workspaceId,
      { originalFilename: "other.pdf", declaredSizeBytes: 1024 },
      dependencies,
    );
    const startedWithoutWorkspaceLock = await Promise.race([
      concurrentStart.then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 500)),
    ]);
    releaseCopy();
    await Promise.all([completion, concurrentStart]);

    expect(startedWithoutWorkspaceLock).toBe(true);
  });
});

describe("Source listing and deletion", () => {
  async function storedSource() {
    const started = await startSourceUpload(
      alice,
      workspaceId,
      { originalFilename: "notes.pdf", declaredSizeBytes: 1024 },
      dependencies,
    );
    storage.put(storage.lastUploadKey as string, fileBytes("%PDF-1.7"));
    const completed = await completeSourceUpload(alice, started.source.id, 1, dependencies);
    return { completed, started };
  }

  test("lists only active Sources for the owning Actor", async () => {
    const first = await startSourceUpload(
      alice,
      workspaceId,
      { originalFilename: "one.pdf", declaredSizeBytes: 1024 },
      dependencies,
    );
    const second = await startSourceUpload(
      alice,
      workspaceId,
      { originalFilename: "two.pdf", declaredSizeBytes: 1024 },
      dependencies,
    );
    await expect(deleteSource(alice, first.source.id, dependencies)).resolves.toEqual({
      cleanupPending: true,
    });

    await expect(listWorkspaceSources(alice, workspaceId, dependencies)).resolves.toEqual([
      second.source,
    ]);
    await expect(listWorkspaceSources(bob, workspaceId, dependencies)).rejects.toMatchObject({
      code: "source_not_found",
    });
  });

  test("includes the latest Knowledge index state in Source listings", async () => {
    const { completed } = await storedSource();
    if (!completed.ingestion) throw new Error("Expected ingestion");
    const firstIndexGenerationId = "00000000-0000-4000-8000-000000000601";
    const latestIndexGenerationId = "00000000-0000-4000-8000-000000000602";
    const firstRepresentationId = `${completed.id}:1:first`;
    const latestRepresentationId = `${completed.id}:1:latest`;
    const sameCreatedAt = new Date("2026-08-02T00:00:00.000Z");
    await testDatabase.db.insert(retrievalIndexGenerations).values([
      {
        id: firstIndexGenerationId,
        sourceId: completed.id,
        workspaceId,
        sourceIngestionId: completed.ingestion.id,
        sourceRevision: 1,
        sourceRevisionId: `${completed.id}:1:first`,
        representationId: firstRepresentationId,
        collectionName: "spectra-knowledge-v1-512",
        embeddingModelId: "text-embedding-v4",
        embeddingDimension: 512,
        chunkProfileId: "spectra-knowledge-v3",
        sparseProfileId: "qdrant/bm25-native-v1",
        manifestHash: "a".repeat(64),
        sourcePolicyHash: "b".repeat(64),
        workflowId: randomUUID(),
        state: "publishing",
        createdAt: sameCreatedAt,
      },
      {
        id: latestIndexGenerationId,
        sourceId: completed.id,
        workspaceId,
        sourceIngestionId: completed.ingestion.id,
        sourceRevision: 1,
        sourceRevisionId: `${completed.id}:1:latest`,
        representationId: latestRepresentationId,
        collectionName: "spectra-knowledge-v1-512",
        embeddingModelId: "text-embedding-v4",
        embeddingDimension: 512,
        chunkProfileId: "spectra-knowledge-v3",
        sparseProfileId: "qdrant/bm25-native-v1",
        manifestHash: "c".repeat(64),
        sourcePolicyHash: "d".repeat(64),
        workflowId: randomUUID(),
        state: "publishing",
        createdAt: sameCreatedAt,
      },
    ]);
    await testDatabase.db.insert(retrievalChunks).values([
      {
        id: randomUUID(),
        indexGenerationId: firstIndexGenerationId,
        sourceId: completed.id,
        representationId: firstRepresentationId,
        ordinal: 0,
        firstBlockOrdinal: 0,
        lastBlockOrdinal: 0,
        exactText: "First indexed chunk",
        indexText: "First indexed chunk",
        contentHash: "c".repeat(64),
        capacityUnits: 3,
      },
      {
        id: randomUUID(),
        indexGenerationId: latestIndexGenerationId,
        sourceId: completed.id,
        representationId: latestRepresentationId,
        ordinal: 1,
        firstBlockOrdinal: 1,
        lastBlockOrdinal: 1,
        exactText: "Second indexed chunk",
        indexText: "Second indexed chunk",
        contentHash: "d".repeat(64),
        capacityUnits: 3,
      },
      {
        id: randomUUID(),
        indexGenerationId: latestIndexGenerationId,
        sourceId: completed.id,
        representationId: latestRepresentationId,
        ordinal: 2,
        firstBlockOrdinal: 2,
        lastBlockOrdinal: 2,
        exactText: "Latest indexed chunk",
        indexText: "Latest indexed chunk",
        contentHash: "e".repeat(64),
        capacityUnits: 3,
      },
    ]);

    const listed = await listWorkspaceSources(alice, workspaceId, dependencies);

    const listedSource = listed[0];
    expect(listedSource?.kind).toBe("uploadedFile");
    if (listedSource?.kind !== "uploadedFile") {
      throw new Error("Expected an uploaded file Source");
    }
    expect(listedSource.knowledgeIndex).toMatchObject({
      state: "publishing",
      chunkCount: 2,
      failureCode: null,
      retryCount: 0,
      nextRetryAt: null,
      updatedAt: expect.any(String),
    });
  });

  test("tombstones a pending Source and removes its current staging version", async () => {
    const started = await startSourceUpload(
      alice,
      workspaceId,
      { originalFilename: "notes.pdf", declaredSizeBytes: 1024 },
      dependencies,
    );
    const uploadKey = storage.lastUploadKey as string;
    storage.put(uploadKey, fileBytes("%PDF-1.7"));

    await expect(deleteSource(alice, started.source.id, dependencies)).resolves.toEqual({
      cleanupPending: true,
    });

    await expect(purgeDeletedSource(started.source.id, dependencies)).resolves.toEqual({
      cleanupPending: false,
    });

    expect(storage.objects.has(uploadKey)).toBe(false);
    const row = await sourceFacts(started.source.id);
    expect(row?.source.deletedAt).toEqual(expect.any(Date));
    expect(row?.file.uploadKey).toBeNull();
    await expect(
      completeSourceUpload(alice, started.source.id, 1, dependencies),
    ).rejects.toMatchObject({ code: "source_not_found" });
  });

  test("deletes the exact stored version and makes repeated deletion idempotent", async () => {
    const { completed } = await storedSource();
    const finalObjectKey = `sources/${completed.id}/original`;

    await expect(deleteSource(alice, completed.id, dependencies)).resolves.toEqual({
      cleanupPending: true,
    });
    await expect(deleteSource(alice, completed.id, dependencies)).resolves.toEqual({
      cleanupPending: true,
    });

    await purgeDeletedSource(completed.id, dependencies);

    expect(storage.objects.has(finalObjectKey)).toBe(false);
    await expect(listWorkspaceSources(alice, workspaceId, dependencies)).resolves.toEqual([]);
    const row = await sourceFacts(completed.id);
    expect(row?.source.deletedAt).toEqual(expect.any(Date));
    expect(row?.file).toMatchObject({
      storageKey: null,
      storageVersionId: null,
    });
  });

  test("keeps the tombstone and object reference when storage deletion fails", async () => {
    const { completed } = await storedSource();
    storage.failDelete = true;

    await expect(deleteSource(alice, completed.id, dependencies)).resolves.toEqual({
      cleanupPending: true,
    });
    const pendingCleanup = await sourceFacts(completed.id);
    expect(pendingCleanup?.source.deletedAt).toEqual(expect.any(Date));
    expect(pendingCleanup?.file).toMatchObject({
      storageKey: `sources/${completed.id}/original`,
    });

    await expect(purgeDeletedSource(completed.id, dependencies)).resolves.toEqual({
      cleanupPending: true,
    });

    storage.failDelete = false;
    await expect(purgeDeletedSource(completed.id, dependencies)).resolves.toEqual({
      cleanupPending: false,
    });
    const cleaned = await sourceFacts(completed.id);
    expect(cleaned?.file.storageKey).toBeNull();
  });

  test("purges independently enqueued cleanup targets", async () => {
    const first = await storedSource();
    const second = await storedSource();
    storage.failDelete = true;
    await deleteSource(alice, first.completed.id, dependencies);
    await deleteSource(alice, second.completed.id, dependencies);

    storage.failDelete = false;
    await expect(purgeDeletedSource(first.completed.id, dependencies)).resolves.toEqual({
      cleanupPending: false,
    });
    await expect(purgeDeletedSource(second.completed.id, dependencies)).resolves.toEqual({
      cleanupPending: false,
    });
  });

  test("does not reveal a foreign Source during deletion", async () => {
    const started = await startSourceUpload(
      alice,
      workspaceId,
      { originalFilename: "notes.pdf", declaredSizeBytes: 1024 },
      dependencies,
    );
    await expect(deleteSource(bob, started.source.id, dependencies)).rejects.toMatchObject({
      code: "source_not_found",
    });
    await expect(deleteSource(alice, "not-a-uuid", dependencies)).rejects.toMatchObject({
      code: "source_not_found",
    });
  });

  test("serializes completion with deletion and never revives a tombstone", async () => {
    const started = await startSourceUpload(
      alice,
      workspaceId,
      { originalFilename: "notes.pdf", declaredSizeBytes: 1024 },
      dependencies,
    );
    storage.put(storage.lastUploadKey as string, fileBytes("%PDF-1.7"));

    const results = await Promise.allSettled([
      completeSourceUpload(alice, started.source.id, 1, dependencies),
      deleteSource(alice, started.source.id, dependencies),
    ]);
    expect(results[1]?.status).toBe("fulfilled");
    if (results[0]?.status === "rejected") {
      expect(results[0].reason).toMatchObject({ code: "source_not_found" });
    }

    await expect(listWorkspaceSources(alice, workspaceId, dependencies)).resolves.toEqual([]);
    await expect(
      completeSourceUpload(alice, started.source.id, 1, dependencies),
    ).rejects.toMatchObject({ code: "source_not_found" });
  });
});
