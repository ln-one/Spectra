/** @type {import("dependency-cruiser").IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: "features-do-not-depend-on-app",
      severity: "error",
      from: {
        path: "^src/features/",
      },
      to: {
        path: "^src/app/",
      },
    },
    {
      name: "app-does-not-access-product-database",
      severity: "error",
      from: {
        path: "^src/app/",
      },
      to: {
        path: "^src/database/(?:client|schema)[.]ts$",
      },
    },
    {
      name: "features-receive-actor-instead-of-session",
      severity: "error",
      from: {
        path: "^src/features/(?!auth/|identity/current[.]ts$)",
      },
      to: {
        path: "^src/features/(?:identity/current|auth/(?:server|session))[.]ts$",
      },
    },
    {
      name: "artifacts-do-not-depend-on-consumers",
      severity: "error",
      from: {
        path: "^src/features/artifacts/",
      },
      to: {
        path: "^src/features/(?:agents|maintenance|workspaces/workbench)/",
      },
    },
    {
      name: "sources-do-not-depend-on-orchestrators",
      severity: "error",
      from: {
        path: "^src/features/sources/",
      },
      to: {
        path: "^src/features/(?:knowledge|maintenance)/",
      },
    },
    {
      name: "agent-artifact-registry-stays-kind-agnostic",
      severity: "error",
      from: {
        path: "^src/features/agents/artifact-tools[.]server[.]ts$",
      },
      to: {
        path: "^src/features/artifacts/(?:documents|mind-maps|quizzes)/",
      },
    },
    {
      name: "maintenance-uses-source-cleanup-boundary",
      severity: "error",
      from: {
        path: "^src/features/maintenance/cleanup-dbos-worker[.]ts$",
      },
      to: {
        path: "^src/features/sources/(?:s3-storage|service)[.]ts$",
      },
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules",
    },
    exclude: {
      path: "[.](?:test|spec)[.](?:ts|tsx)$",
    },
    includeOnly: ["^src"],
    moduleSystems: ["es6", "cjs"],
    tsConfig: {
      fileName: "tsconfig.json",
    },
  },
};
