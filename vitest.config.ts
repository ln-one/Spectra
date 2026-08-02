import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@deckelier/contracts": path.resolve(__dirname, "packages/deckelier-contracts/src/index.ts"),
      "@tests": path.resolve(__dirname, "tests"),
      "server-only": path.resolve(__dirname, "tests/server-only.ts"),
    },
  },
  test: {
    env: {
      LOG_LEVEL: "silent",
    },
    projects: [
      {
        extends: true,
        test: {
          name: "node-unit",
          environment: "node",
          include: [
            "src/app/**/!(*.database).test.ts",
            "src/components/**/!(*.database).test.ts",
            "src/database/**/!(*.database).test.ts",
            "src/environment/**/!(*.database).test.ts",
            "src/features/**/!(*.database).test.ts",
            "src/i18n/**/!(*.database).test.ts",
            "src/instrumentation.test.ts",
            "src/observability/**/!(*.database).test.ts",
            "scripts/**/!(*.database).test.ts",
            "packages/deckelier-contracts/src/**/*.test.ts",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "node-database",
          environment: "node",
          globalSetup: ["./tests/database-global-setup.ts"],
          include: ["src/**/*.database.test.ts", "tests/**/*.database.test.ts"],
          maxWorkers: 4,
          sequence: {
            groupOrder: 1,
          },
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          include: [
            "src/app/**/*.test.tsx",
            "src/components/**/*.test.tsx",
            "src/features/**/*.test.tsx",
          ],
          setupFiles: ["./tests/setup.ts"],
        },
      },
    ],
  },
});
