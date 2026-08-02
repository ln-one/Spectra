import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createMigratedTestDatabase } from "@tests/database";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, expect, test, vi } from "vitest";

vi.setConfig({ testTimeout: 15_000 });

let testDatabase: Awaited<ReturnType<typeof createMigratedTestDatabase>>;

beforeAll(async () => {
  testDatabase = await createMigratedTestDatabase();
});

afterAll(async () => {
  await testDatabase.destroy();
});

test("creates the current product schema from one baseline migration", async () => {
  const schemas = await testDatabase.pool.query<{ schemaName: string }>(
    `SELECT schema_name AS "schemaName"
       FROM information_schema.schemata
      WHERE schema_name IN ('auth', 'drizzle', 'public')
      ORDER BY schema_name`,
  );
  expect(schemas.rows).toEqual([
    { schemaName: "auth" },
    { schemaName: "drizzle" },
    { schemaName: "public" },
  ]);

  const result = await testDatabase.pool.query<{ tableSchema: string; tableName: string }>(
    `SELECT table_schema AS "tableSchema", table_name AS "tableName"
       FROM information_schema.tables
      WHERE table_schema IN ('public', 'auth', 'drizzle')
      ORDER BY table_schema, table_name`,
  );

  expect(result.rows).toEqual([
    { tableSchema: "drizzle", tableName: "migrations" },
    { tableSchema: "public", tableName: "ai_conversations" },
    { tableSchema: "public", tableName: "ai_messages" },
    { tableSchema: "public", tableName: "ai_run_attempts" },
    { tableSchema: "public", tableName: "ai_runs" },
    { tableSchema: "public", tableName: "artifact_edit_proposals" },
    { tableSchema: "public", tableName: "artifact_generation_attempts" },
    { tableSchema: "public", tableName: "artifact_provider_attempts" },
    { tableSchema: "public", tableName: "artifact_render_jobs" },
    { tableSchema: "public", tableName: "artifact_revisions" },
    { tableSchema: "public", tableName: "artifact_source_bundles" },
    { tableSchema: "public", tableName: "artifact_sources" },
    { tableSchema: "public", tableName: "artifact_suggestion_requests" },
    { tableSchema: "public", tableName: "artifact_suggestion_snapshots" },
    { tableSchema: "public", tableName: "artifacts" },
    { tableSchema: "public", tableName: "cleanup_receipts" },
    { tableSchema: "public", tableName: "file_sources" },
    { tableSchema: "public", tableName: "game_revival_rounds" },
    { tableSchema: "public", tableName: "game_run_deaths" },
    { tableSchema: "public", tableName: "game_runs" },
    { tableSchema: "public", tableName: "presentation_editor_snapshots" },
    { tableSchema: "public", tableName: "principals" },
    { tableSchema: "public", tableName: "quiz_attempt_answers" },
    { tableSchema: "public", tableName: "quiz_attempts" },
    { tableSchema: "public", tableName: "retrieval_chunks" },
    { tableSchema: "public", tableName: "retrieval_evidence_units" },
    { tableSchema: "public", tableName: "retrieval_index_generations" },
    { tableSchema: "public", tableName: "retrieval_representation_blocks" },
    { tableSchema: "public", tableName: "source_ingestions" },
    { tableSchema: "public", tableName: "sources" },
    { tableSchema: "public", tableName: "workspace_locators" },
    { tableSchema: "public", tableName: "workspace_permission_grants" },
    { tableSchema: "public", tableName: "workspace_reference_sources" },
    { tableSchema: "public", tableName: "workspaces" },
  ]);
});

test("tracks the generated baseline and forward migrations", async () => {
  const migrationFiles = (await readdir(path.resolve(process.cwd(), "drizzle"))).filter((name) =>
    name.endsWith(".sql"),
  );
  expect(migrationFiles[0]).toMatch(/^\d{14}_baseline\.sql$/);
  expect(migrationFiles.slice(1).every((name) => /^\d{14}_.+\.sql$/.test(name))).toBe(true);

  const journal = JSON.parse(
    await readFile(path.resolve(process.cwd(), "drizzle/meta/_journal.json"), "utf8"),
  ) as { entries?: Array<{ tag?: string }> };
  expect(journal.entries).toHaveLength(migrationFiles.length);
  expect(journal.entries?.map((entry) => entry.tag)).toEqual(
    migrationFiles.map((name) => name.replace(/\.sql$/, "")),
  );
  await expect(
    testDatabase.pool.query<{ count: string }>("SELECT count(*) FROM drizzle.migrations"),
  ).resolves.toMatchObject({ rows: [{ count: String(migrationFiles.length) }] });
});

test("reapplying the baseline is idempotent", async () => {
  const before = await testDatabase.pool.query<{ count: string }>(
    "SELECT count(*) FROM drizzle.migrations",
  );
  await migrate(testDatabase.db, {
    migrationsFolder: path.resolve(process.cwd(), "drizzle"),
    migrationsSchema: "drizzle",
    migrationsTable: "migrations",
  });
  const after = await testDatabase.pool.query<{ count: string }>(
    "SELECT count(*) FROM drizzle.migrations",
  );
  expect(after.rows).toEqual(before.rows);
});
