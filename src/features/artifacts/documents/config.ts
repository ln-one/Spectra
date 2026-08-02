import "server-only";

import { createDashScopeNonThinkingChatModel, dashScopeModels } from "@/ai/dashscope";
import { type ServerEnvironment, serverEnvironment } from "@/environment/server";

export const teachingDocumentSuggestionProfile = {
  maxOutputTokens: 512,
  modelId: dashScopeModels.artifactSuggestion,
  temperature: 0.7,
  timeoutMs: 15_000,
} as const;

export const teachingDocumentGenerationProfile = {
  maxOutputTokens: 4_096,
  modelId: dashScopeModels.artifactGeneration,
  temperature: 0,
  timeoutMs: 120_000,
} as const;

export function createTeachingDocumentSuggestionModel(
  environment: ServerEnvironment = serverEnvironment(),
  fetchImplementation: typeof fetch = fetch,
) {
  return createDashScopeNonThinkingChatModel(
    teachingDocumentSuggestionProfile.modelId,
    environment,
    fetchImplementation,
  );
}

export function createTeachingDocumentGenerationModel(
  environment: ServerEnvironment = serverEnvironment(),
  fetchImplementation: typeof fetch = fetch,
) {
  return createDashScopeNonThinkingChatModel(
    teachingDocumentGenerationProfile.modelId,
    environment,
    fetchImplementation,
  );
}
