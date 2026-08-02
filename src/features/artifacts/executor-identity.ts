import { type ServerEnvironment, serverEnvironment } from "@/environment/server";

export function artifactDbosExecutorId(environment: ServerEnvironment = serverEnvironment()) {
  const configured = environment.DBOS__VMID?.trim();
  if (configured) return configured;
  if (environment.NODE_ENV === "production") {
    throw new Error("DBOS__VMID must identify each Artifact Worker replica in production");
  }
  return "spectra-artifacts-local";
}
