import { describe, expect, test } from "vitest";
import { databasePoolProfiles } from "./pool-profiles";

describe("PostgreSQL connection budget", () => {
  test("keeps every runtime pool explicit and identifiable", () => {
    expect(databasePoolProfiles).toEqual({
      product: { applicationName: "spectra-product", max: 10 },
      auth: { applicationName: "spectra-auth", max: 10 },
      threadCoordination: {
        applicationName: "spectra-thread-lock",
        max: 2,
      },
      sourceWorkerJobs: {
        applicationName: "spectra-source-worker",
        max: 4,
      },
      artifactWorkflowSystem: {
        applicationName: "spectra-artifact-dbos",
        max: 10,
      },
      artifactClientSystem: {
        applicationName: "spectra-artifact-client",
        max: 4,
      },
    });
  });

  test("caps Web, Source Worker, and Artifact Worker connection budgets", () => {
    const web =
      databasePoolProfiles.product.max +
      databasePoolProfiles.auth.max +
      databasePoolProfiles.threadCoordination.max +
      databasePoolProfiles.artifactClientSystem.max;
    const sourceWorker =
      databasePoolProfiles.product.max + databasePoolProfiles.sourceWorkerJobs.max;
    const artifactWorker =
      databasePoolProfiles.product.max + databasePoolProfiles.artifactWorkflowSystem.max;

    expect(web).toBe(26);
    expect(sourceWorker).toBe(14);
    expect(artifactWorker).toBe(20);
  });
});
