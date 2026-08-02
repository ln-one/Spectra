import * as nextEnv from "@next/env";
import { databaseUrl } from "@/database/url";
import { initializeDbosSystem } from "@/worker/dbos-system.server";

async function main() {
  nextEnv.loadEnvConfig(process.cwd());
  await initializeDbosSystem({ connectionString: databaseUrl() });
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
