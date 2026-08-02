import "server-only";

import { z } from "zod";
import { dashScopeModels } from "@/ai/dashscope";
import { type ServerEnvironment, serverEnvironment } from "@/environment/server";

const mineruTokenSchema = z.string().trim().min(1);

export const mineruProcessingProfile = {
  formula: true,
  language: "ch",
  model: "vlm",
  ocr: true,
  table: true,
} as const;

export const mediaUnderstandingProfile = {
  maxOutputTokens: 1024,
  maxRetries: 0,
  modelId: dashScopeModels.mediaUnderstanding,
  temperature: 0,
  timeoutMs: 120_000,
} as const;

export function mineruEnvironment(environment: ServerEnvironment = serverEnvironment()) {
  if (!environment.MINERU_API_TOKEN) throw new Error("MINERU_API_TOKEN is required");
  return { apiToken: environment.MINERU_API_TOKEN };
}

export function parseMineruToken(token: string) {
  return mineruTokenSchema.parse(token);
}
