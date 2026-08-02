import path from "node:path";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required; run Playwright through npm run test:e2e`);
  return value;
}

export const e2eDatabaseUrl = required("DATABASE_URL");
export const e2ePort = required("SPECTRA_E2E_PORT");
export const e2eBaseUrl = `http://localhost:${e2ePort}`;
export const e2eArtifactDir = required("SPECTRA_E2E_ARTIFACT_DIR");
export const e2eAuthDir = required("SPECTRA_E2E_AUTH_DIR");
export const e2eAuthStatePath = path.join(e2eAuthDir, "auth.json");
export const e2eOtherAuthStatePath = path.join(e2eAuthDir, "other-auth.json");
export const e2eWorkspacePath = path.join(e2eArtifactDir, "workspace.json");
