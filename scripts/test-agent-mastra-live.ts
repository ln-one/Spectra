import { toAISdkStream } from "@mastra/ai-sdk";
import type { MastraModelOutput } from "@mastra/core/stream";
import * as nextEnv from "@next/env";
import { z } from "zod";
import { workspaceAgentProfile } from "@/features/agents/config";

nextEnv.loadEnvConfig(process.cwd());

class LiveContractError extends Error {}

async function consumeFull(output: MastraModelOutput) {
  const chunks: unknown[] = [];
  for await (const chunk of toAISdkStream(output, {
    from: "agent",
    onError: () => "agent_unavailable",
    version: "v6",
  })) {
    chunks.push(chunk);
  }
  const full = await output.getFullOutput();
  if (chunks.length === 0 || full.text.length === 0) {
    throw new LiveContractError(`chunks=${chunks.length}, text=${full.text.length > 0}`);
  }
  return full;
}

async function consume(output: MastraModelOutput) {
  return (await consumeFull(output)).text;
}

const webSearchResultSchema = z
  .object({
    sources: z
      .array(
        z.discriminatedUnion("type", [
          z.object({ type: z.literal("url"), url: z.url() }).passthrough(),
          z.object({ name: z.string(), type: z.literal("api") }).passthrough(),
        ]),
      )
      .optional(),
  })
  .passthrough();

function hasHttpsSource(value: unknown) {
  const parsed = webSearchResultSchema.safeParse(value);
  return (
    parsed.success &&
    (parsed.data.sources ?? []).some(
      (source) => source.type === "url" && new URL(source.url).protocol === "https:",
    )
  );
}

async function importAgentRuntime() {
  const { createSpectraAgent } = await import("../src/features/agents/server");
  return { agent: createSpectraAgent() };
}

async function main() {
  const { agent } = await importAgentRuntime();

  const first = await agent.stream("Reply with exactly: stateless-one", {
    maxSteps: workspaceAgentProfile.maxSteps,
    modelSettings: {
      maxOutputTokens: workspaceAgentProfile.maxOutputTokens,
      temperature: workspaceAgentProfile.temperature,
    },
  });
  const firstText = await consume(first);
  if (!firstText.includes("stateless-one")) {
    throw new LiveContractError("stateless agent response failed");
  }

  const current = await agent.stream("请检索今天杭州的天气，并简要说明信息来源。", {
    maxSteps: workspaceAgentProfile.maxSteps,
    modelSettings: {
      maxOutputTokens: 512,
      temperature: workspaceAgentProfile.temperature,
    },
  });
  const currentResult = await consumeFull(current);
  const searched = currentResult.toolResults.some(
    (result) => result.payload.toolName === "web_search" && hasHttpsSource(result.payload.result),
  );
  if (!searched) throw new LiveContractError("production agent skipped a current search");

  const stable = await agent.stream("用一句话说明 TCP 与 IP 的基本分工。", {
    maxSteps: workspaceAgentProfile.maxSteps,
    modelSettings: {
      maxOutputTokens: 128,
      temperature: workspaceAgentProfile.temperature,
    },
  });
  const stableResult = await consumeFull(stable);
  if (stableResult.toolCalls.some((call) => call.payload.toolName === "web_search")) {
    throw new LiveContractError("production agent searched stable general knowledge");
  }

  console.log("Stateless Mastra Agent and web search policy live smoke passed.");
}

void main().catch((error: unknown) => {
  const detail =
    error instanceof Error ? (error.stack ?? `${error.name}: ${error.message}`) : "UnknownError";
  console.error(`Stateless Mastra Agent live smoke failed:\n${detail}`);
  process.exitCode = 1;
});
