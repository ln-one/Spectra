import { randomUUID } from "node:crypto";
import { createMigratedTestDatabase } from "@tests/database";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { fileSources, sourceIngestions, sources } from "@/database/schema";
import { ensurePrincipalForAuthUser } from "@/features/identity/service";
import { createWorkspace } from "@/features/workspaces/service";

let testDatabase: Awaited<ReturnType<typeof createMigratedTestDatabase>>;
let workspaceId: string;

type NewSource = typeof sources.$inferInsert;
type NewFileSource = typeof fileSources.$inferInsert;

function source(overrides: Partial<NewSource> = {}): NewSource & { id: string } {
  return {
    workspaceId,
    kind: "uploaded_file",
    ...overrides,
    id: randomUUID(),
  };
}

function pendingFileSource(
  sourceId: string,
  overrides: Partial<NewFileSource> = {},
): NewFileSource {
  return {
    sourceId,
    originalFilename: "notes.pdf",
    sizeBytes: 1024,
    uploadKey: `staging/${randomUUID()}`,
    uploadExpiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

async function insertFileSource(
  fileOverrides: Partial<NewFileSource> = {},
  sourceOverrides: Partial<NewSource> = {},
) {
  const sourceRow = source(sourceOverrides);
  const fileRow = pendingFileSource(sourceRow.id, fileOverrides);
  await testDatabase.db.transaction(async (transaction) => {
    await transaction.insert(sources).values(sourceRow);
    await transaction.insert(fileSources).values(fileRow);
  });
  return { file: fileRow, source: sourceRow };
}

async function expectDatabaseError(
  operation: PromiseLike<unknown>,
  expectedCode: string,
  expectedConstraint?: string,
) {
  try {
    await operation;
  } catch (error) {
    let current: unknown = error;
    const visited = new Set<unknown>();
    while (typeof current === "object" && current !== null && !visited.has(current)) {
      visited.add(current);
      if ("code" in current && current.code === expectedCode) {
        if (expectedConstraint) expect(current).toMatchObject({ constraint: expectedConstraint });
        return;
      }
      current = "cause" in current ? current.cause : null;
    }
    throw error;
  }
  throw new Error(`Expected PostgreSQL error ${expectedCode}`);
}

beforeAll(async () => {
  testDatabase = await createMigratedTestDatabase();
});

beforeEach(async () => {
  await testDatabase.pool.query(
    "TRUNCATE TABLE public.file_sources, public.sources, public.workspaces, public.principals CASCADE",
  );
  const actor = await ensurePrincipalForAuthUser("auth-alice", "alice", testDatabase.db);
  const workspace = await createWorkspace(actor, { name: "Notes" }, testDatabase.db);
  workspaceId = workspace.id;
});

afterAll(async () => {
  await testDatabase.destroy();
});

test("stores common Source identity separately from file facts", async () => {
  const pending = await insertFileSource();
  const stored = await insertFileSource({
    state: "stored",
    uploadKey: null,
    uploadExpiresAt: null,
    storageKey: `sources/${randomUUID()}`,
    storageVersionId: randomUUID(),
  });
  const failed = await insertFileSource({
    state: "failed",
    uploadKey: null,
    uploadExpiresAt: null,
    failureCode: "source_file_type_unsupported",
  });

  const sourceRows = await testDatabase.db
    .select({ id: sources.id, kind: sources.kind })
    .from(sources);
  const fileRows = await testDatabase.db
    .select({ sourceId: fileSources.sourceId, state: fileSources.state })
    .from(fileSources);

  expect(sourceRows).toEqual(
    expect.arrayContaining([
      { id: pending.source.id, kind: "uploaded_file" },
      { id: stored.source.id, kind: "uploaded_file" },
      { id: failed.source.id, kind: "uploaded_file" },
    ]),
  );
  expect(fileRows.map((row) => row.state)).toEqual(
    expect.arrayContaining(["pending_upload", "stored", "failed"]),
  );
});

test("enforces Workspace ownership and restricts parent deletion", async () => {
  await expectDatabaseError(
    testDatabase.db.insert(sources).values(source({ workspaceId: randomUUID() })),
    "23503",
    "sources_workspace_id_workspaces_id_fk",
  );

  await insertFileSource();
  await expectDatabaseError(
    testDatabase.pool.query("DELETE FROM public.workspaces WHERE id = $1", [workspaceId]),
    "23001",
    "sources_workspace_id_workspaces_id_fk",
  );
});

test("binds one file detail to a real Source and cascades hard deletion", async () => {
  await expectDatabaseError(
    testDatabase.db.insert(fileSources).values(pendingFileSource(randomUUID())),
    "23503",
    "file_sources_source_id_sources_id_fk",
  );

  const inserted = await insertFileSource();
  await expectDatabaseError(
    testDatabase.db.insert(fileSources).values(pendingFileSource(inserted.source.id)),
    "23505",
    "file_sources_pkey",
  );

  await testDatabase.db.delete(sources).where(eq(sources.id, inserted.source.id));
  const remaining = await testDatabase.db
    .select()
    .from(fileSources)
    .where(eq(fileSources.sourceId, inserted.source.id));
  expect(remaining).toEqual([]);
});

test("enforces file size, generation, state, and filename constraints", async () => {
  const zeroSize = source();
  const oversized = source();
  const zeroGeneration = source();
  const blankName = source();
  await testDatabase.db.insert(sources).values([zeroSize, oversized, zeroGeneration, blankName]);
  await expectDatabaseError(
    testDatabase.db.insert(fileSources).values(pendingFileSource(zeroSize.id, { sizeBytes: 0 })),
    "23514",
    "file_sources_size_bytes_check",
  );
  await expectDatabaseError(
    testDatabase.db
      .insert(fileSources)
      .values(pendingFileSource(oversized.id, { sizeBytes: 52_428_801 })),
    "23514",
    "file_sources_size_bytes_check",
  );
  await expectDatabaseError(
    testDatabase.db
      .insert(fileSources)
      .values(pendingFileSource(zeroGeneration.id, { uploadGeneration: 0 })),
    "23514",
    "file_sources_upload_generation_check",
  );
  await expectDatabaseError(
    testDatabase.db
      .insert(fileSources)
      .values(pendingFileSource(blankName.id, { originalFilename: "   " })),
    "23514",
    "file_sources_original_filename_check",
  );
});

test("enforces reference pairs and state-owned references", async () => {
  const missingExpiry = source();
  const incompleteStorage = source();
  const missingFailure = source();
  const unexpectedFailure = source();
  const pendingWithStorage = source();
  const storedWithUpload = source();
  await testDatabase.db
    .insert(sources)
    .values([
      missingExpiry,
      incompleteStorage,
      missingFailure,
      unexpectedFailure,
      pendingWithStorage,
      storedWithUpload,
    ]);
  await expectDatabaseError(
    testDatabase.db
      .insert(fileSources)
      .values(pendingFileSource(missingExpiry.id, { uploadExpiresAt: null })),
    "23514",
    "file_sources_upload_reference_check",
  );
  await expectDatabaseError(
    testDatabase.db.insert(fileSources).values(
      pendingFileSource(incompleteStorage.id, {
        state: "stored",
        uploadKey: null,
        uploadExpiresAt: null,
        storageKey: `sources/${randomUUID()}`,
      }),
    ),
    "23514",
    "file_sources_storage_reference_check",
  );
  await expectDatabaseError(
    testDatabase.db
      .insert(fileSources)
      .values(pendingFileSource(missingFailure.id, { state: "failed" })),
    "23514",
    "file_sources_failure_code_check",
  );
  await expectDatabaseError(
    testDatabase.db
      .insert(fileSources)
      .values(pendingFileSource(unexpectedFailure.id, { failureCode: "unexpected" })),
    "23514",
    "file_sources_failure_code_check",
  );
  await expectDatabaseError(
    testDatabase.db.insert(fileSources).values(
      pendingFileSource(pendingWithStorage.id, {
        storageKey: `sources/${randomUUID()}`,
        storageVersionId: randomUUID(),
      }),
    ),
    "23514",
    "file_sources_state_references_check",
  );
  await expectDatabaseError(
    testDatabase.db.insert(fileSources).values(
      pendingFileSource(storedWithUpload.id, {
        state: "stored",
        storageKey: `sources/${randomUUID()}`,
        storageVersionId: randomUUID(),
      }),
    ),
    "23514",
    "file_sources_state_references_check",
  );
});

test("allows tombstoned file references to remain for cleanup or be cleared", async () => {
  const deletedAt = new Date();
  await insertFileSource({}, { deletedAt });
  await insertFileSource({ uploadKey: null, uploadExpiresAt: null }, { deletedAt });
  await insertFileSource(
    {
      state: "stored",
      uploadKey: null,
      uploadExpiresAt: null,
      storageKey: `sources/${randomUUID()}`,
      storageVersionId: randomUUID(),
    },
    { deletedAt },
  );
  await insertFileSource(
    { state: "stored", uploadKey: null, uploadExpiresAt: null },
    { deletedAt },
  );

  expect(await testDatabase.db.select().from(fileSources)).toHaveLength(4);
});

test("keeps upload and storage object keys globally unique", async () => {
  const uploadKey = `staging/${randomUUID()}`;
  await insertFileSource({ uploadKey });
  const duplicateUploadSource = source();
  await testDatabase.db.insert(sources).values(duplicateUploadSource);
  await expectDatabaseError(
    testDatabase.db
      .insert(fileSources)
      .values(pendingFileSource(duplicateUploadSource.id, { uploadKey })),
    "23505",
    "file_sources_upload_key_unique",
  );

  const storageKey = `sources/${randomUUID()}`;
  await insertFileSource({
    state: "stored",
    uploadKey: null,
    uploadExpiresAt: null,
    storageKey,
    storageVersionId: randomUUID(),
  });
  const duplicateStorageSource = source();
  await testDatabase.db.insert(sources).values(duplicateStorageSource);
  await expectDatabaseError(
    testDatabase.db.insert(fileSources).values(
      pendingFileSource(duplicateStorageSource.id, {
        state: "stored",
        uploadKey: null,
        uploadExpiresAt: null,
        storageKey,
        storageVersionId: randomUUID(),
      }),
    ),
    "23505",
    "file_sources_storage_key_unique",
  );
});

test("allows native ingestion without a provider batch and rejects forged batch ownership", async () => {
  const stored = await insertFileSource({
    state: "stored",
    uploadKey: null,
    uploadExpiresAt: null,
    storageKey: `sources/${randomUUID()}`,
    storageVersionId: randomUUID(),
  });
  await testDatabase.db.insert(sourceIngestions).values({
    sourceId: stored.source.id,
    provider: "native_text",
    state: "queued",
  });

  const forged = await insertFileSource({
    state: "stored",
    uploadKey: null,
    uploadExpiresAt: null,
    storageKey: `sources/${randomUUID()}`,
    storageVersionId: randomUUID(),
  });
  await expectDatabaseError(
    testDatabase.db.insert(sourceIngestions).values({
      sourceId: forged.source.id,
      provider: "native_text",
      providerBatchId: "forged-provider-batch",
      state: "processing",
      startedAt: new Date(),
    }),
    "23514",
    "source_ingestions_batch_check",
  );

  const mineruFailure = await insertFileSource({
    state: "stored",
    uploadKey: null,
    uploadExpiresAt: null,
    storageKey: `sources/${randomUUID()}`,
    storageVersionId: randomUUID(),
  });
  await expectDatabaseError(
    testDatabase.db.insert(sourceIngestions).values({
      sourceId: mineruFailure.source.id,
      provider: "mineru",
      providerBatchId: "stale-provider-batch",
      state: "failed",
      errorCode: "mineru_timeout",
      retryable: true,
      finishedAt: new Date(),
    }),
    "23514",
    "source_ingestions_batch_check",
  );
});
