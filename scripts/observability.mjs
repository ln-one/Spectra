import { execFile, spawn } from "node:child_process";
import { appendFile, chmod, mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK, tracing } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const composeArguments = [
  "compose",
  "--project-name",
  "spectra-observability",
  "--file",
  path.join(repositoryRoot, "compose.observability.yaml"),
];
const grafanaUrl = "http://127.0.0.1:3001";
const adminAuthorization = `Basic ${Buffer.from("spectra-admin:spectra-local-only").toString("base64")}`;
const serviceAccountName = "spectra-codex";
const tokenName = "spectra-codex-local";
const tokenPath =
  process.env.SPECTRA_GRAFANA_MCP_TOKEN_FILE ??
  path.join(homedir(), ".codex", "observability", "spectra-grafana-token");
const developmentLogDirectory = path.join(repositoryRoot, "tmp", "observability");
const developmentLogPath = path.join(developmentLogDirectory, "spectra-dev.log");
const execFileAsync = promisify(execFile);

async function runDockerCompose(...arguments_) {
  const child = spawn("docker", [...composeArguments, ...arguments_], {
    cwd: repositoryRoot,
    stdio: "inherit",
  });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  if (code !== 0) throw new Error(`docker compose exited with code ${code}`);
}

async function commandOutput(command, arguments_) {
  const result = await execFileAsync(command, arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  return result.stdout.trim();
}

function normalizedDockerMountPath(value) {
  return value.startsWith("/host_mnt/") ? value.slice("/host_mnt".length) : value;
}

async function alloyDevelopmentLogView() {
  const containerId = await commandOutput("docker", [
    ...composeArguments,
    "ps",
    "--quiet",
    "alloy",
  ]);
  if (!containerId) throw new Error("The Alloy container is not running");
  const mountSource = await commandOutput("docker", [
    "inspect",
    "--format",
    '{{range .Mounts}}{{if eq .Destination "/var/log/spectra"}}{{.Source}}{{end}}{{end}}',
    containerId,
  ]);
  const size = Number(
    await commandOutput("docker", [
      ...composeArguments,
      "exec",
      "--no-TTY",
      "alloy",
      "sh",
      "-c",
      "wc -c < /var/log/spectra/spectra-dev.log",
    ]),
  );
  return {
    mountSource: normalizedDockerMountPath(mountSource),
    size: Number.isFinite(size) ? size : -1,
  };
}

async function ensureCurrentDevelopmentLogMount() {
  const hostSize = (await stat(developmentLogPath)).size;
  const view = await alloyDevelopmentLogView();
  if (view.mountSource === developmentLogDirectory && view.size >= hostSize) return;
  console.log("Refreshing Alloy to collect logs from the current worktree...");
  await runDockerCompose("up", "--detach", "--wait", "--force-recreate", "--no-deps", "alloy");
  const refreshed = await alloyDevelopmentLogView();
  if (refreshed.mountSource !== developmentLogDirectory || refreshed.size < hostSize) {
    throw new Error("Alloy cannot read the current worktree development log");
  }
}

async function grafanaRequest(
  route,
  { authorization = adminAuthorization, body, method = "GET" } = {},
) {
  const response = await fetch(`${grafanaUrl}${route}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: {
      Accept: "application/json",
      Authorization: authorization,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    method,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`Grafana request failed: ${method} ${route} (${response.status})`);
  }
  return data;
}

async function waitForGrafana() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${grafanaUrl}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("Grafana did not become healthy within 60 seconds");
}

async function existingToken() {
  try {
    const value = (await readFile(tokenPath, "utf8")).trim();
    if (!value) return null;
    await grafanaRequest("/api/user", { authorization: `Bearer ${value}` });
    return value;
  } catch {
    return null;
  }
}

async function serviceAccountId() {
  const search = await grafanaRequest(
    `/api/serviceaccounts/search?query=${encodeURIComponent(serviceAccountName)}`,
  );
  const account = search.serviceAccounts?.find(
    (candidate) => candidate.name === serviceAccountName,
  );
  if (account) return account.id;
  const created = await grafanaRequest("/api/serviceaccounts", {
    body: { isDisabled: false, name: serviceAccountName, role: "Viewer" },
    method: "POST",
  });
  return created.id;
}

async function issueToken(accountId) {
  const tokens = await grafanaRequest(`/api/serviceaccounts/${accountId}/tokens`);
  for (const token of tokens) {
    if (token.name === tokenName) {
      await grafanaRequest(`/api/serviceaccounts/${accountId}/tokens/${token.id}`, {
        method: "DELETE",
      });
    }
  }
  const created = await grafanaRequest(`/api/serviceaccounts/${accountId}/tokens`, {
    body: { name: tokenName, secondsToLive: 0 },
    method: "POST",
  });
  await mkdir(path.dirname(tokenPath), { mode: 0o700, recursive: true });
  await writeFile(tokenPath, `${created.key}\n`, { mode: 0o600 });
  await chmod(tokenPath, 0o600);
}

async function ensureMcpToken() {
  if (await existingToken()) return;
  try {
    await unlink(tokenPath);
  } catch {}
  await issueToken(await serviceAccountId());
}

async function queryProbe(token, runId) {
  const end = Date.now() * 1_000_000;
  const start = end - 60_000_000_000;
  const query = `{job="spectra-development",service="spectra-doctor"} |= "${runId}"`;
  const parameters = new URLSearchParams({
    end: String(end),
    limit: "20",
    query,
    start: String(start),
  });
  const response = await grafanaRequest(
    `/api/datasources/proxy/uid/spectra-loki/loki/api/v1/query_range?${parameters}`,
    { authorization: `Bearer ${token}` },
  );
  return response.data?.result?.length > 0;
}

async function emitTraceProbe(runId) {
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: "spectra-doctor",
    }),
    sampler: new tracing.AlwaysOnSampler(),
    traceExporter: new OTLPTraceExporter({
      url: "http://127.0.0.1:4318/v1/traces",
    }),
  });
  sdk.start();
  const span = trace
    .getTracer("spectra.observability.doctor")
    .startSpan("observability.doctor.probe", {
      attributes: {
        "spectra.run.id": runId,
      },
    });
  const traceId = span.spanContext().traceId;
  span.end();
  await sdk.shutdown();
  return traceId;
}

async function queryTraceProbe(token, traceId) {
  const response = await fetch(
    `${grafanaUrl}/api/datasources/proxy/uid/spectra-tempo/api/traces/${traceId}`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    },
  );
  if ([404, 502, 503, 504].includes(response.status)) return false;
  if (!response.ok) {
    throw new Error(`Grafana Tempo query failed (${response.status})`);
  }
  return true;
}

async function doctor() {
  await waitForGrafana();
  await ensureCurrentDevelopmentLogMount();
  await ensureMcpToken();
  const token = (await readFile(tokenPath, "utf8")).trim();
  await grafanaRequest("/api/datasources/uid/spectra-loki", {
    authorization: `Bearer ${token}`,
  });
  await grafanaRequest("/api/datasources/uid/spectra-tempo", {
    authorization: `Bearer ${token}`,
  });

  const runId = crypto.randomUUID();
  await mkdir(path.dirname(developmentLogPath), { recursive: true });
  await appendFile(
    developmentLogPath,
    `${JSON.stringify({
      component: "observability",
      event: "observability.doctor.probe",
      level: 30,
      msg: "Local observability ingestion probe",
      runId,
      service: "spectra-doctor",
      time: new Date().toISOString(),
    })}\n`,
  );
  const traceId = await emitTraceProbe(runId);

  const deadline = Date.now() + 30_000;
  let logReady = false;
  let traceReady = false;
  while (Date.now() < deadline) {
    [logReady, traceReady] = await Promise.all([
      queryProbe(token, runId),
      queryTraceProbe(token, traceId),
    ]);
    if (logReady && traceReady) {
      console.log(`Observability is ready. Grafana: ${grafanaUrl}`);
      console.log(`Grafana MCP token: ${tokenPath}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(
    `Observability probes unavailable after 30 seconds: Loki logs=${logReady ? "ready" : "missing"}, Tempo traces=${traceReady ? "ready" : "missing"}`,
  );
}

async function up() {
  await mkdir(path.dirname(developmentLogPath), { recursive: true });
  await appendFile(developmentLogPath, "");
  await runDockerCompose("up", "--detach", "--wait");
  await doctor();
}

const command = process.argv[2];
if (command === "up") {
  await up();
} else if (command === "down") {
  await runDockerCompose("down");
} else if (command === "doctor") {
  await doctor();
} else if (command === "token-path") {
  console.log(tokenPath);
} else {
  throw new Error("Usage: node scripts/observability.mjs <up|down|doctor|token-path>");
}
