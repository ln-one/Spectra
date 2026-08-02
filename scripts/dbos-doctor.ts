import * as nextEnv from "@next/env";
import { Pool } from "pg";
import { databaseUrl } from "@/database/url";
import { dbosQueueHealthUnhealthy, readDbosQueueHealth } from "@/worker/dbos-health.server";

async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  const pool = new Pool({ connectionString: databaseUrl(), max: 1 });
  try {
    const health = await readDbosQueueHealth(pool);
    console.log(JSON.stringify(health, null, 2));
    if (dbosQueueHealthUnhealthy(health)) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
