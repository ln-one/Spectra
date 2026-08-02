import "server-only";

import { DBOSClient } from "@dbos-inc/dbos-sdk";
import { Pool } from "pg";
import { databasePoolProfiles } from "@/database/pool-profiles";
import { databaseUrl } from "@/database/url";
import { ARTIFACT_DBOS_SCHEMA } from "./dbos-queue.server";

const globalArtifactDbos = globalThis as typeof globalThis & {
  spectraArtifactDbosClient?: Promise<DBOSClient>;
};

export function artifactDbosClient() {
  const existing = globalArtifactDbos.spectraArtifactDbosClient;
  if (existing) return existing;
  const profile = databasePoolProfiles.artifactClientSystem;
  const pool = new Pool({
    application_name: profile.applicationName,
    connectionString: databaseUrl(),
    max: profile.max,
  });
  const starting = DBOSClient.create({
    systemDatabasePool: pool,
    systemDatabasePollingConcurrency: 1,
    systemDatabaseSchemaName: ARTIFACT_DBOS_SCHEMA,
    systemDatabaseUrl: databaseUrl(),
  });
  globalArtifactDbos.spectraArtifactDbosClient = starting;
  void starting.catch(async () => {
    await pool.end();
    if (globalArtifactDbos.spectraArtifactDbosClient === starting) {
      delete globalArtifactDbos.spectraArtifactDbosClient;
    }
  });
  return starting;
}

export async function cancelArtifactDbosExecution(
  artifactId: string,
  getClient: () => Promise<Pick<DBOSClient, "cancelWorkflow">> = artifactDbosClient,
) {
  const client = await getClient();
  await client.cancelWorkflow(artifactId, { cancelChildren: true });
}
