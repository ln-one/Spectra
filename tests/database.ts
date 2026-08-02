import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { inject } from "vitest";
import * as schema from "@/database/schema";

function safeDatabaseIdentifier(value: string) {
  if (!/^[a-z0-9_]+$/.test(value)) throw new Error("Unsafe test database identifier");
  return `"${value}"`;
}

function adminUrl() {
  const url = new URL(
    process.env.TEST_DATABASE_URL ?? "postgresql://spectra:spectra@localhost:5432/spectra_test",
  );
  url.pathname = "/postgres";
  return url.toString();
}

function postgresErrorCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}

async function dropDatabase(admin: Pool, databaseName: string) {
  await admin.query(
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
    [databaseName],
  );
  await admin.query(`DROP DATABASE IF EXISTS ${safeDatabaseIdentifier(databaseName)} WITH (FORCE)`);
}

async function createTestDatabase(templateDatabaseName: string) {
  const context = inject("testDatabaseRun");
  const databaseName = `${context.databasePrefix}${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const admin = new Pool({ connectionString: adminUrl(), max: 1 });
  await admin.query(
    `CREATE DATABASE ${safeDatabaseIdentifier(databaseName)} TEMPLATE ${safeDatabaseIdentifier(templateDatabaseName)}`,
  );

  const url = new URL(adminUrl());
  url.pathname = `/${databaseName}`;
  const pool = new Pool({ connectionString: url.toString(), max: 10 });
  pool.on("error", (error) => {
    // Global teardown force-drops isolated databases; only its expected termination is ignored.
    if (postgresErrorCode(error) === "57P01") return;
    throw error;
  });
  const db = drizzle({ client: pool, schema });

  async function destroy() {
    try {
      await pool.end();
      await dropDatabase(admin, databaseName);
    } finally {
      await admin.end();
    }
  }

  return { connectionString: url.toString(), databaseName, db, destroy, pool };
}

export function createMigratedTestDatabase() {
  return createTestDatabase(inject("testDatabaseRun").templateDatabaseName);
}

export function createUnmigratedTestDatabase() {
  return createTestDatabase("template0");
}
