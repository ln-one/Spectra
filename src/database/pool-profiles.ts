export const databasePoolProfiles = {
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
} as const;
