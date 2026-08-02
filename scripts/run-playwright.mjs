import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import nextEnv from "@next/env";
import { Pool } from "pg";

const { loadEnvConfig } = nextEnv;
const root = process.cwd();
loadEnvConfig(root);

const args = process.argv.slice(2);
const buildFirst = args[0] === "--build";
const playwrightArgs = buildFirst ? args.slice(1) : args;
const runId = randomUUID().replaceAll("-", "");
const databaseName = `spectra_e2e_${runId}`;
const artifactDir = path.join(root, "test-results", `e2e-${runId}`);
const authDir = path.join(os.tmpdir(), `spectra-e2e-auth-${runId}`);
const e2eDistDir = `.next-e2e-${runId}`;
const buildDistDir = `.next-verify-${runId}`;
const tsconfigPath = path.join(root, `.tsconfig.e2e-${runId}.json`);
const nextEnvPath = path.join(root, "next-env.d.ts");
const originalNextEnv = await readFile(nextEnvPath, "utf8").catch((error) => {
  if (error?.code === "ENOENT") return null;
  throw error;
});
let activeChild;
let receivedSignal;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    receivedSignal = signal;
    if (!activeChild?.pid) return;
    try {
      if (process.platform === "win32") activeChild.kill(signal);
      else process.kill(-activeChild.pid, signal);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) {
        console.error("Unable to stop the active browser verification process", error);
      }
    }
  });
}

function signalExitCode() {
  return receivedSignal === "SIGINT" ? 130 : receivedSignal === "SIGTERM" ? 143 : null;
}

function adminUrl() {
  const url = new URL(
    process.env.TEST_DATABASE_URL ??
      process.env.DATABASE_URL ??
      "postgresql://spectra:spectra@localhost:5432/spectra_test",
  );
  url.pathname = "/postgres";
  return url;
}

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to allocate an E2E port");
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

function run(command, commandArgs, environment) {
  const cancelledCode = signalExitCode();
  if (cancelledCode) return Promise.resolve(cancelledCode);

  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: root,
      detached: process.platform !== "win32",
      env: {
        ...environment,
        PATH: `${path.dirname(process.execPath)}${path.delimiter}${environment.PATH ?? ""}`,
      },
      stdio: "inherit",
    });
    activeChild = child;
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      activeChild = undefined;
      if (signal === "SIGINT") resolve(130);
      else if (signal === "SIGTERM") resolve(143);
      else resolve(code ?? 1);
    });
  });
}

const admin = new Pool({ connectionString: adminUrl().toString(), max: 1 });
let createdDatabase = false;
let exitCode = 1;

try {
  await writeFile(tsconfigPath, '{"extends":"./tsconfig.json"}\n', "utf8");
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  createdDatabase = true;

  const databaseUrl = adminUrl();
  databaseUrl.pathname = `/${databaseName}`;
  const port = await availablePort();
  const workerHealthPort = await availablePort();
  const sharedEnvironment = {
    ...process.env,
    DATABASE_URL: databaseUrl.toString(),
    BETTER_AUTH_URL: `http://localhost:${port}`,
    BETTER_AUTH_SECRET:
      process.env.BETTER_AUTH_SECRET ?? "spectra-playwright-secret-32-bytes-minimum",
    DASHSCOPE_API_KEY: process.env.DASHSCOPE_API_KEY ?? "spectra-e2e-only",
    DASHSCOPE_BASE_URL:
      process.env.DASHSCOPE_BASE_URL ?? "https://dashscope.e2e.invalid/compatible-mode/v1",
    SPECTRA_E2E_ARTIFACT_DIR: artifactDir,
    SPECTRA_E2E_AUTH_DIR: authDir,
    SPECTRA_E2E_PORT: String(port),
    WORKER_HEALTH_PORT: String(workerHealthPort),
    NEXT_TSCONFIG_PATH: path.basename(tsconfigPath),
    REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
    STORAGE_ENDPOINT: "http://localhost:7070",
    STORAGE_REGION: "us-east-1",
    STORAGE_BUCKET: `spectra-e2e-${runId}`,
    STORAGE_ACCESS_KEY_ID: "spectra-local",
    STORAGE_SECRET_ACCESS_KEY: "spectra-local-only",
    STORAGE_FORCE_PATH_STYLE: "true",
    OPENHANDS_EXECUTION_ENABLED: "true",
    OPENHANDS_RUNTIME_URL: "https://openhands.e2e.invalid",
    OPENHANDS_RUNTIME_API_KEY: "spectra-e2e-only",
    OPENHANDS_LLM_API_KEY: "spectra-e2e-only",
    OPENHANDS_LLM_BASE_URL: "https://llm.e2e.invalid/v1",
    OPENHANDS_LLM_MODEL: "openai/spectra-authoring",
    OPENHANDS_LLM_ENABLE_THINKING: "true",
    OPENHANDS_WORKSPACE_ROOT: "/workspace/spectra",
    ANIMATION_EXECUTION_ENABLED: "true",
    REMOTION_BROWSER_EXECUTABLE: "/bin/sh",
  };

  if (buildFirst) {
    const buildCode = await run("npm", ["run", "build"], {
      ...sharedEnvironment,
      NEXT_DIST_DIR: buildDistDir,
    });
    if (buildCode !== 0) exitCode = buildCode;
    else {
      exitCode = await run(
        path.join(root, "node_modules", ".bin", "playwright"),
        ["test", ...playwrightArgs],
        {
          ...sharedEnvironment,
          NEXT_DIST_DIR: e2eDistDir,
        },
      );
    }
  } else {
    exitCode = await run(
      path.join(root, "node_modules", ".bin", "playwright"),
      ["test", ...playwrightArgs],
      {
        ...sharedEnvironment,
        NEXT_DIST_DIR: e2eDistDir,
      },
    );
  }
} finally {
  try {
    if (createdDatabase) {
      await admin.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
        [databaseName],
      );
      await admin.query(`DROP DATABASE "${databaseName}"`);
    }
  } finally {
    await admin.end();
    await rm(path.join(root, e2eDistDir), { recursive: true, force: true });
    await rm(path.join(root, buildDistDir), { recursive: true, force: true });
    await rm(tsconfigPath, { force: true });
    await rm(authDir, { recursive: true, force: true });
    if (originalNextEnv === null) await rm(nextEnvPath, { force: true });
    else await writeFile(nextEnvPath, originalNextEnv, "utf8");
    if (exitCode === 0) await rm(artifactDir, { recursive: true, force: true });
  }
}

process.exitCode = signalExitCode() ?? exitCode;
