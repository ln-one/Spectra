import { randomUUID } from "node:crypto";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import type { TestProject } from "vitest/node";

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

async function dropDatabase(admin: Pool, databaseName: string) {
  await admin.query(
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
    [databaseName],
  );
  await admin.query(`DROP DATABASE IF EXISTS ${safeDatabaseIdentifier(databaseName)} WITH (FORCE)`);
}

async function databasesWithPrefix(admin: Pool, databasePrefix: string) {
  const result = await admin.query<{ datname: string }>(
    "SELECT datname FROM pg_database WHERE left(datname, length($1)) = $1 ORDER BY datname",
    [databasePrefix],
  );
  return result.rows.map((row) => row.datname);
}

export default async function setup(project: TestProject) {
  const runId = randomUUID().replaceAll("-", "").slice(0, 12);
  const databasePrefix = `spectra_vt_${runId}_`;
  const templateDatabaseName = `${databasePrefix}template`;
  const admin = new Pool({ connectionString: adminUrl(), max: 1 });

  try {
    await admin.query(
      `CREATE DATABASE ${safeDatabaseIdentifier(templateDatabaseName)} TEMPLATE template0`,
    );
    const templateUrl = new URL(adminUrl());
    templateUrl.pathname = `/${templateDatabaseName}`;
    const templatePool = new Pool({ connectionString: templateUrl.toString(), max: 2 });
    try {
      await migrate(drizzle({ client: templatePool }), {
        migrationsFolder: path.resolve(process.cwd(), "drizzle"),
        migrationsSchema: "drizzle",
        migrationsTable: "migrations",
      });
    } finally {
      await templatePool.end();
    }
    project.provide("testDatabaseRun", { databasePrefix, templateDatabaseName });
  } catch (error) {
    await dropDatabase(admin, templateDatabaseName).catch(() => undefined);
    await admin.end();
    throw error;
  }

  return async () => {
    try {
      const databaseNames = await databasesWithPrefix(admin, databasePrefix);
      for (const databaseName of databaseNames) {
        await dropDatabase(admin, databaseName);
      }
    } finally {
      await admin.end();
    }
  };
}
