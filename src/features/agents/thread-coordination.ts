import "server-only";

import { Pool } from "pg";
import { databasePoolProfiles } from "@/database/pool-profiles";
import { databaseUrl } from "@/database/url";
import { serverEnvironment } from "@/environment/server";

const globalAgentCoordination = globalThis as typeof globalThis & {
  spectraThreadLockPool?: Pool;
};
const environment = serverEnvironment();

export const workspaceThreadLockPool =
  globalAgentCoordination.spectraThreadLockPool ??
  new Pool({
    allowExitOnIdle: true,
    application_name: databasePoolProfiles.threadCoordination.applicationName,
    connectionString: databaseUrl(environment),
    max: databasePoolProfiles.threadCoordination.max,
  });

if (environment.NODE_ENV !== "production") {
  // Keep the coordination pool bounded across Next.js development reloads.
  globalAgentCoordination.spectraThreadLockPool = workspaceThreadLockPool;
}

export async function withWorkspaceThreadLock<T>(
  pool: Pool,
  threadId: string,
  operation: () => Promise<T>,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [threadId]);
    const result = await operation();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
