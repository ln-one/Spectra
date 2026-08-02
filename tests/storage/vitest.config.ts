import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { defineConfig } from "vitest/config";

loadEnvConfig(process.cwd());

if (!process.env.STORAGE_ENDPOINT) {
  Object.assign(process.env, {
    STORAGE_ENDPOINT: "http://localhost:7070",
    STORAGE_REGION: "us-east-1",
    STORAGE_BUCKET: "spectra-dev",
    STORAGE_ACCESS_KEY_ID: "spectra-local",
    STORAGE_SECRET_ACCESS_KEY: "spectra-local-only",
    STORAGE_FORCE_PATH_STYLE: "true",
  });
}

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../../src"),
      "server-only": path.resolve(__dirname, "../server-only.ts"),
    },
  },
  test: {
    environment: "node",
    hookTimeout: 60_000,
    include: ["tests/storage/**/*.test.ts"],
    testTimeout: 60_000,
  },
});
