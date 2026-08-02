import "server-only";

import { generateText, Output } from "ai";
import { z } from "zod";
import { createDashScopeNonThinkingChatModel } from "@/ai/dashscope";

export const visualDescriptionGenerationProfile = {
  maxOutputTokens: 700,
  output: {
    descriptionMaxCharacters: 2_000,
    schemaVersion: 1,
  },
  promptVersion: "visual-description-v1",
  temperature: 0,
  timeoutMs: 20_000,
} as const;

const visualDescriptionSchema = z
  .object({
    description: z
      .string()
      .trim()
      .min(1)
      .max(visualDescriptionGenerationProfile.output.descriptionMaxCharacters),
  })
  .strict();

export type VisualDescriptionPort = {
  describe(input: {
    abortSignal?: AbortSignal;
    bytes: Uint8Array;
    mediaType: "image/webp";
  }): Promise<string>;
};

export function createVisualDescriptionPort(input: { model: string }): VisualDescriptionPort {
  const model = createDashScopeNonThinkingChatModel(input.model);
  return {
    async describe({ abortSignal, bytes, mediaType }) {
      const result = await generateText({
        ...(abortSignal ? { abortSignal } : {}),
        maxOutputTokens: visualDescriptionGenerationProfile.maxOutputTokens,
        maxRetries: 0,
        model,
        output: Output.object({ schema: visualDescriptionSchema }),
        temperature: visualDescriptionGenerationProfile.temperature,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Describe this image objectively for text retrieval. State the main subject, visible labels, relationships, chart type or diagram structure when present. Do not infer facts not visible. Return one compact description only.",
              },
              { type: "image", image: bytes, mediaType },
            ],
          },
        ],
      });
      return result.output.description;
    },
  };
}
