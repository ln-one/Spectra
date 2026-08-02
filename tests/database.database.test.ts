import { afterEach, describe, expect, it } from "vitest";
import { createMigratedTestDatabase, createUnmigratedTestDatabase } from "./database";

type TestDatabase = Awaited<ReturnType<typeof createMigratedTestDatabase>>;

const databases: TestDatabase[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.destroy()));
});

describe("PostgreSQL template test databases", () => {
  it("clones the migrated schema while keeping databases isolated", async () => {
    const first = await createMigratedTestDatabase();
    const second = await createMigratedTestDatabase();
    databases.push(first, second);

    await first.pool.query("CREATE TABLE template_clone_isolation (id integer PRIMARY KEY)");

    const firstTable = await first.pool.query<{ table_name: string | null }>(
      "SELECT to_regclass('public.template_clone_isolation')::text AS table_name",
    );
    const secondTable = await second.pool.query<{ table_name: string | null }>(
      "SELECT to_regclass('public.template_clone_isolation')::text AS table_name",
    );
    const migrations = await second.pool.query<{ table_name: string | null }>(
      "SELECT to_regclass('drizzle.migrations')::text AS table_name",
    );

    expect(firstTable.rows[0]?.table_name).toBe("template_clone_isolation");
    expect(secondTable.rows[0]?.table_name).toBeNull();
    expect(migrations.rows[0]?.table_name).toBe("drizzle.migrations");
  });

  it("creates unmigrated databases from template0", async () => {
    const database = await createUnmigratedTestDatabase();
    databases.push(database);

    const migrations = await database.pool.query<{ table_name: string | null }>(
      "SELECT to_regclass('drizzle.migrations')::text AS table_name",
    );

    expect(migrations.rows[0]?.table_name).toBeNull();
  });
});
