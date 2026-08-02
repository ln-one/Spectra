import "server-only";

import { createDashScopeNonThinkingChatModel, dashScopeModels } from "@/ai/dashscope";
import { type ServerEnvironment, serverEnvironment } from "@/environment/server";

export const gameGenerationProfile = {
  maxOutputTokens: 8_192,
  modelId: dashScopeModels.artifactGeneration,
  temperature: 0,
  timeoutMs: 120_000,
} as const;

export function createGameGenerationModel(
  environment: ServerEnvironment = serverEnvironment(),
  fetchImplementation: typeof fetch = fetch,
) {
  return createDashScopeNonThinkingChatModel(
    gameGenerationProfile.modelId,
    environment,
    fetchImplementation,
  );
}
