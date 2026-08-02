import { createOpenAI } from "@ai-sdk/openai";
import { toAISdkStream } from "@mastra/ai-sdk";
import { Mastra } from "@mastra/core";
import { Agent } from "@mastra/core/agent";
import type { MastraModelOutput } from "@mastra/core/stream";
import { createTool, isProviderDefinedTool } from "@mastra/core/tools";
import * as nextEnv from "@next/env";
import { z } from "zod";
import { dashScopeEnvironment, dashScopeModels } from "@/ai/dashscope";

nextEnv.loadEnvConfig(process.cwd());

class LiveContractError extends Error {}

const webSearchOutputSchema = z
  .object({
    sources: z
      .array(
        z.discriminatedUnion("type", [
          z
            .object({
              type: z.literal("url"),
              url: z.url().refine((value) => new URL(value).protocol === "https:"),
            })
            .strict(),
          z.object({ name: z.string(), type: z.literal("api") }).strict(),
        ]),
      )
      .optional(),
  })
  .passthrough();

const convertedToolOutputSchema = z
  .object({
    output: webSearchOutputSchema,
    toolCallId: z.string(),
    type: z.literal("tool-output-available"),
  })
  .passthrough();

function sourceUrls(value: unknown) {
  const parsed = webSearchOutputSchema.safeParse(value);
  if (!parsed.success) return [];
  return (parsed.data.sources ?? []).flatMap((source) =>
    source.type === "url" ? [source.url] : [],
  );
}

async function consume(output: MastraModelOutput) {
  const chunks: unknown[] = [];
  for await (const chunk of toAISdkStream(output, {
    from: "agent",
    onError: () => "agent_unavailable",
    version: "v6",
  })) {
    chunks.push(chunk);
  }
  return { chunks, full: await output.getFullOutput() };
}

async function main() {
  const { apiKey, baseURL } = dashScopeEnvironment();
  let signalRequestStarted: (() => void) | undefined;
  const provider = createOpenAI({
    apiKey,
    baseURL,
    fetch: async (input, init) => {
      signalRequestStarted?.();
      signalRequestStarted = undefined;
      return fetch(input, init);
    },
  });
  const webSearch = provider.tools.webSearch();
  if (!isProviderDefinedTool(webSearch)) {
    throw new LiveContractError("AI SDK web search is not a provider-defined tool");
  }
  let scopeInspections = 0;
  const inspectScope = createTool({
    id: "inspect_a0_scope",
    description: "Confirm the fixed, harmless scope used by this live contract test.",
    inputSchema: z.object({}).strict(),
    execute: async () => {
      scopeInspections += 1;
      return { scope: "web-search-a0" };
    },
  });
  const agent = new Agent({
    id: "spectra-web-search-a0",
    name: "Spectra web search A0",
    instructions:
      "For every requested live search, call inspect_a0_scope exactly once, then call web_search, then answer briefly from the search evidence.",
    model: provider.responses(dashScopeModels.workspaceAgent),
    tools: {
      inspect_a0_scope: inspectScope,
      web_search: webSearch,
    },
  });
  const mastra = new Mastra({ agents: { webSearchA0: agent }, logger: false });
  const liveAgent = mastra.getAgent("webSearchA0");
  const prompts = [
    "检索今天中国人工智能领域的一条重要新闻。必须先检查测试作用域，再进行网页搜索。",
    "Find one current official announcement about TypeScript. Inspect the test scope before searching the web.",
    "检索今天杭州的天气信息。必须先检查测试作用域，再进行网页搜索。",
  ];
  const domains = new Set<string>();
  let convertedSearchResults = 0;

  for (const prompt of prompts) {
    const output = await liveAgent.stream(prompt, {
      maxSteps: 4,
      modelSettings: { maxOutputTokens: 512, temperature: 0 },
    });
    const { chunks, full } = await consume(output);
    if (full.error || full.text.length === 0) throw new LiveContractError("search run failed");

    const toolNames = full.toolCalls.map((call) => call.payload.toolName);
    if (!toolNames.includes("inspect_a0_scope") || !toolNames.includes("web_search")) {
      throw new LiveContractError(`missing tools: ${toolNames.sort().join(",")}`);
    }

    const webCallIds = new Set(
      full.toolCalls
        .filter((call) => call.payload.toolName === "web_search")
        .map((call) => call.payload.toolCallId),
    );
    const resultUrls = full.toolResults.flatMap((result) =>
      result.payload.toolName === "web_search" ? sourceUrls(result.payload.result) : [],
    );
    if (resultUrls.length === 0) throw new LiveContractError("web search returned no sources");
    for (const url of resultUrls) domains.add(new URL(url).hostname);

    const converted = chunks.filter((chunk) => {
      const parsed = convertedToolOutputSchema.safeParse(chunk);
      return (
        parsed.success &&
        webCallIds.has(parsed.data.toolCallId) &&
        sourceUrls(parsed.data.output).length > 0
      );
    });
    if (converted.length === 0) {
      throw new LiveContractError("official UI stream conversion dropped web search sources");
    }
    convertedSearchResults += converted.length;
  }

  const noSearch = await liveAgent.stream("Reply with exactly: no-search", {
    maxSteps: 1,
    modelSettings: { maxOutputTokens: 32, temperature: 0 },
    toolChoice: "none",
  });
  const noSearchResult = await consume(noSearch);
  if (
    !noSearchResult.full.text.includes("no-search") ||
    noSearchResult.full.toolCalls.length !== 0
  ) {
    throw new LiveContractError("no-search run used a tool");
  }

  if (scopeInspections !== prompts.length) {
    throw new LiveContractError(`scope inspections=${scopeInspections}`);
  }

  const requestStarted = new Promise<void>((resolve) => {
    signalRequestStarted = resolve;
  });
  const abortController = new AbortController();
  const cancelledOutput = liveAgent.stream("Search for current AI news.", {
    abortSignal: abortController.signal,
    maxSteps: 4,
    modelSettings: { maxOutputTokens: 512, temperature: 0 },
  });
  await requestStarted;
  abortController.abort();

  let cancellationObserved = false;
  let cancellationDetail = "no result";
  try {
    const cancelledResult = await consume(await cancelledOutput);
    cancellationObserved =
      cancelledResult.full.error?.name === "AbortError" ||
      (cancelledResult.full.finishReason === "tripwire" &&
        cancelledResult.full.text.length === 0 &&
        cancelledResult.full.toolCalls.length === 0);
    cancellationDetail = `error=${cancelledResult.full.error?.name ?? "none"}, finish=${cancelledResult.full.finishReason ?? "none"}, textLength=${cancelledResult.full.text.length}`;
  } catch (error) {
    cancellationObserved = error instanceof Error && error.name === "AbortError";
    cancellationDetail = `thrown=${error instanceof Error ? error.name : "UnknownError"}`;
  }
  if (!cancellationObserved) {
    throw new LiveContractError(`abort signal was not preserved (${cancellationDetail})`);
  }
  if (scopeInspections !== prompts.length) {
    throw new LiveContractError("a cancelled run executed the local tool");
  }

  console.log(
    JSON.stringify({
      cancellation: "passed",
      convertedSearchResults,
      searches: prompts.length,
      sourceDomains: domains.size,
      status: "passed",
    }),
  );
}

void main().catch((error: unknown) => {
  const detail =
    error instanceof LiveContractError
      ? error.message
      : error instanceof Error
        ? error.name
        : "UnknownError";
  console.error(`Web search live smoke failed: ${detail}`);
  process.exitCode = 1;
});
