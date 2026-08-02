import "server-only";

import { createDashScopeNonThinkingChatModel, dashScopeModels } from "@/ai/dashscope";
import { type ServerEnvironment, serverEnvironment } from "@/environment/server";

export const mindMapGenerationProfile = {
  maxOutputTokens: 4_096,
  modelId: dashScopeModels.artifactGeneration,
  temperature: 0,
  timeoutMs: 120_000,
} as const;

export function createMindMapGenerationModel(
  environment: ServerEnvironment = serverEnvironment(),
  fetchImplementation: typeof fetch = fetch,
) {
  return createDashScopeNonThinkingChatModel(
    mindMapGenerationProfile.modelId,
    environment,
    fetchImplementation,
  );
}
