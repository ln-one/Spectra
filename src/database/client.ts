import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { serverEnvironment } from "@/environment/server";
import { databasePoolProfiles } from "./pool-profiles";
import * as schema from "./schema";
import { databaseUrl } from "./url";

const globalDatabase = globalThis as typeof globalThis & { spectraProductPool?: Pool };
const environment = serverEnvironment();

export const productPool =
  globalDatabase.spectraProductPool ??
  new Pool({
    application_name: databasePoolProfiles.product.applicationName,
    connectionString: databaseUrl(environment),
    max: databasePoolProfiles.product.max,
  });

if (environment.NODE_ENV !== "production") {
  // Keep one pool across Next.js development reloads.
  globalDatabase.spectraProductPool = productPool;
}

export const database = drizzle({ client: productPool, schema });
export type Database = typeof database;
export type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
