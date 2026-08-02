import * as nextEnv from "@next/env";
import { z } from "zod";
import {
  OPENHANDS_AGENT_SERVER_VERSION,
  REQUIRED_OPENHANDS_TOOLS,
} from "@/features/artifacts/task-agent/agent-server-contract";

const repositoryRoot = process.cwd();
const serverInfoSchema = z
  .object({ usable_tools: z.array(z.string()), version: z.string().min(1) })
  .loose();

async function main() {
  nextEnv.loadEnvConfig(repositoryRoot);
  if (
    process.env.OPENHANDS_EXECUTION_ENABLED !== "true" ||
    !process.env.OPENHANDS_RUNTIME_URL ||
    !process.env.OPENHANDS_RUNTIME_API_KEY
  ) {
    console.log(
      JSON.stringify(
        { expectedServerVersion: OPENHANDS_AGENT_SERVER_VERSION, status: "not_configured" },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  const response = await fetch(
    `${process.env.OPENHANDS_RUNTIME_URL.replace(/\/+$/, "")}/server_info`,
    {
      headers: { "X-Session-API-Key": process.env.OPENHANDS_RUNTIME_API_KEY },
      signal: AbortSignal.timeout(10_000),
    },
  ).catch(() => null);
  if (!response?.ok) {
    console.log(JSON.stringify({ status: "unavailable" }, null, 2));
    process.exitCode = 1;
    return;
  }

  const info = serverInfoSchema.parse(await response.json());
  const missingTools = REQUIRED_OPENHANDS_TOOLS.filter((tool) => !info.usable_tools.includes(tool));
  const status =
    info.version !== OPENHANDS_AGENT_SERVER_VERSION
      ? "version_conflict"
      : missingTools.length > 0
        ? "tools_missing"
        : "healthy";
  console.log(
    JSON.stringify(
      {
        expectedServerVersion: OPENHANDS_AGENT_SERVER_VERSION,
        missingTools,
        serverVersion: info.version,
        status,
      },
      null,
      2,
    ),
  );
  if (status !== "healthy") process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
