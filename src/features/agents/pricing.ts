import { z } from "zod";
import { dashScopeModels } from "@/ai/dashscope";

type DashScopeModelId = (typeof dashScopeModels)[keyof typeof dashScopeModels];

const modelRateSchema = z
  .object({
    inputMicrousdPerToken: z.number().int().positive(),
    outputMicrousdPerToken: z.number().int().positive(),
  })
  .strict();

export const aiPricingVersion = "2026-07-19";

const modelRates = {
  [dashScopeModels.artifactGeneration]: modelRateSchema.parse({
    inputMicrousdPerToken: 2,
    outputMicrousdPerToken: 8,
  }),
  [dashScopeModels.artifactSuggestion]: modelRateSchema.parse({
    inputMicrousdPerToken: 1,
    outputMicrousdPerToken: 4,
  }),
  [dashScopeModels.mediaUnderstanding]: modelRateSchema.parse({
    inputMicrousdPerToken: 1,
    outputMicrousdPerToken: 4,
  }),
} satisfies Record<DashScopeModelId, z.infer<typeof modelRateSchema>>;

export function aiModelRate(modelId: string) {
  const rate = Reflect.get(modelRates, modelId);
  return modelRateSchema.parse(rate);
}

export function estimateAiCostMicrousd(input: {
  inputTokens: number;
  modelId: string;
  outputTokens: number;
}) {
  const rate = aiModelRate(input.modelId);
  return (
    input.inputTokens * rate.inputMicrousdPerToken +
    input.outputTokens * rate.outputMicrousdPerToken
  );
}
