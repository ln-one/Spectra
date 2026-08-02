import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";
import { databaseUrl } from "./src/database/url";

loadEnvConfig(process.cwd());

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/database/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: databaseUrl() },
  migrations: {
    schema: "drizzle",
    table: "migrations",
    prefix: "timestamp",
  },
  strict: true,
  verbose: true,
});
