import { ObservabilityStoragePostgresVNext } from "@mastra/pg";
import { Pool } from "pg";

async function main() {
  const connectionString = process.env.MASTRA_OBSERVABILITY_DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("MASTRA_OBSERVABILITY_DATABASE_URL is required");
  }

  const pool = new Pool({ connectionString });
  const storage = new ObservabilityStoragePostgresVNext({
    pool,
    schemaName: "mastra_observability",
  });

  try {
    await storage.init();
    const policies = Object.fromEntries(
      Object.keys(ObservabilityStoragePostgresVNext.retentionTables).map((table) => [
        table,
        { maxAge: "14d" as const },
      ]),
    );
    const result = await storage.prune(policies);
    console.log(JSON.stringify(result));
  } finally {
    await pool.end();
  }
}

void main();
