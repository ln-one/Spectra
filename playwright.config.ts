import { defineConfig } from "@playwright/test";
import {
  e2eArtifactDir,
  e2eAuthStatePath,
  e2eBaseUrl,
  e2eDatabaseUrl,
  e2ePort,
} from "./tests/e2e/environment";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: `${e2eArtifactDir}/playwright`,
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  fullyParallel: false,
  // A single Next development server cannot reliably absorb the initial route compilation from
  // every browser file at once. Keep modest parallelism without turning transient startup load
  // into user-flow timeouts.
  workers: process.env.CI ? 1 : 2,
  reporter: "line",
  use: {
    baseURL: e2eBaseUrl,
    deviceScaleFactor: 1,
    locale: "zh-CN",
    storageState: e2eAuthStatePath,
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: `npm run db:migrate && npm run auth:migrate && npm run dbos:setup && npm exec -- concurrently --kill-others --names web,dbos --prefix-colors blue,cyan "npm run dev:web -- --hostname 0.0.0.0 --port ${e2ePort}" "npm run worker:dbos"`,
    env: {
      DATABASE_URL: e2eDatabaseUrl,
      BETTER_AUTH_URL: e2eBaseUrl,
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "",
      NEXT_DIST_DIR: process.env.NEXT_DIST_DIR ?? ".next-e2e",
      WORKER_HEALTH_PORT: process.env.WORKER_HEALTH_PORT ?? "8787",
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: `${e2eBaseUrl}/auth/login`,
  },
});
