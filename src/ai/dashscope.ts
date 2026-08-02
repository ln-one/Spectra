import "server-only";

import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { type ServerEnvironment, serverEnvironment } from "@/environment/server";

export const dashScopeModels = {
  artifactSuggestion: "qwen3.6-flash-2026-04-16",
  mediaUnderstanding: "qwen3.5-omni-flash-2026-03-15",
  artifactGeneration: "qwen3.7-plus",
  threadTitle: "qwen3.6-flash-2026-04-16",
  workspaceAgent: "qwen3.7-plus",
} as const;

export function dashScopeEnvironment(environment: ServerEnvironment = serverEnvironment()) {
  if (!environment.DASHSCOPE_API_KEY || !environment.DASHSCOPE_BASE_URL) {
    throw new Error("DashScope credentials are required");
  }
  return {
    apiKey: environment.DASHSCOPE_API_KEY,
    baseURL: environment.DASHSCOPE_BASE_URL,
  };
}

export function createDashScopeNonThinkingChatModel(
  modelId: string,
  environment: ServerEnvironment = serverEnvironment(),
  fetchImplementation: typeof fetch = fetch,
) {
  const { apiKey, baseURL } = dashScopeEnvironment(environment);
  const nonThinkingFetch: typeof fetch = async (input, init) => {
    if (typeof init?.body !== "string") return fetchImplementation(input, init);
    const body = z.record(z.string(), z.unknown()).parse(JSON.parse(init.body));
    return fetchImplementation(input, {
      ...init,
      body: JSON.stringify({ ...body, enable_thinking: false }),
    });
  };
  return createOpenAI({ apiKey, baseURL, fetch: nonThinkingFetch }).chat(modelId);
}
