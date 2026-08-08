import "server-only";

import { createOpenAI } from "@ai-sdk/openai";
import { isProviderDefinedTool } from "@mastra/core/tools";
import {
  createDashScopeNonThinkingChatModel,
  dashScopeEnvironment,
  dashScopeModels,
} from "@/ai/dashscope";
import { type ServerEnvironment, serverEnvironment } from "@/environment/server";

export const workspaceAgentProfile = {
  budget: {
    maxCostMicrousd: 500_000,
    maxInputTokens: 80_000,
    maxOutputTokens: 20_512,
    maxProviderCalls: 6,
    maxToolCalls: 6,
    maxTotalTokens: 100_512,
    wallTimeMs: 150_000,
  },
  historyCandidateMessages: 40,
  maxOutputTokens: 4096,
  maxSteps: 7,
  modelContextLastTurns: 8,
  modelContextMaxTokens: 48_000,
  modelId: dashScopeModels.workspaceAgent,
  providerOptions: {
    openai: {
      maxToolCalls: 1,
      parallelToolCalls: false,
    },
  },
  temperature: 0,
} as const;

export const threadTitleProfile = {
  inputCharacterLimit: 1200,
  maxOutputTokens: 32,
  modelId: dashScopeModels.threadTitle,
  temperature: 0,
  timeoutMs: 8_000,
} as const;

export function createWorkspaceAgentResources(
  environment: ServerEnvironment = serverEnvironment(),
  fetchImplementation: typeof fetch = fetch,
) {
  const { apiKey, baseURL } = dashScopeEnvironment(environment);
  const provider = createOpenAI({ apiKey, baseURL, fetch: fetchImplementation });
  const webSearch = provider.tools.webSearch();
  if (!isProviderDefinedTool(webSearch)) {
    throw new Error("DashScope web search is not a provider-defined tool");
  }
  return {
    model: provider.responses(workspaceAgentProfile.modelId),
    webSearch,
  };
}

export function createThreadTitleModel(
  environment: ServerEnvironment = serverEnvironment(),
  fetchImplementation: typeof fetch = fetch,
) {
  return createDashScopeNonThinkingChatModel(
    threadTitleProfile.modelId,
    environment,
    fetchImplementation,
  );
}
