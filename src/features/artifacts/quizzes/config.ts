import "server-only";

import { createDashScopeNonThinkingChatModel, dashScopeModels } from "@/ai/dashscope";
import { type ServerEnvironment, serverEnvironment } from "@/environment/server";

export const quizGenerationProfile = {
  maxOutputTokens: 8_192,
  modelId: dashScopeModels.artifactGeneration,
  temperature: 0,
  timeoutMs: 120_000,
} as const;

export function createQuizGenerationModel(
  environment: ServerEnvironment = serverEnvironment(),
  fetchImplementation: typeof fetch = fetch,
) {
  return createDashScopeNonThinkingChatModel(
    quizGenerationProfile.modelId,
    environment,
    fetchImplementation,
  );
}
