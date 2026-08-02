import { z } from "zod";
import { artifactGroundingBundleSchema } from "./grounding";

const artifactGenerationOutcomeSchema = z.enum(["complete", "partial"]);
const artifactGenerationWarningSchema = z.literal("partial_generation");

export const artifactGenerationStartInputSchema = z
  .object({
    conversationId: z.string().uuid(),
    grounding: artifactGroundingBundleSchema.optional().default({ evidence: [], version: 1 }),
    locale: z.enum(["zh-CN", "en-US"]),
    prompt: z.string().trim().min(1).max(20_000),
    requestedTitle: z.string().trim().min(1).max(200).optional(),
    rootRunId: z.string().uuid().nullable().optional(),
    sourcePlanItemId: z.string().uuid().nullable().optional(),
    sourceUserMessageId: z.string().min(1).max(128),
    workspaceId: z.string().uuid(),
  })
  .strict();

export const artifactGenerationProvenanceSchema = z
  .object({
    outcome: artifactGenerationOutcomeSchema,
    rawOutput: z.string(),
    warnings: z.array(artifactGenerationWarningSchema),
  })
  .strict();

export type ArtifactGenerationOutcome = z.infer<typeof artifactGenerationOutcomeSchema>;
export type ArtifactGenerationStartInput = z.input<typeof artifactGenerationStartInputSchema>;
export type ArtifactGenerationUsage = {
  finishReason: string;
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  totalTokens: number | undefined;
};
type ArtifactGenerationProvenance = z.infer<typeof artifactGenerationProvenanceSchema>;

export type ArtifactProjection<Revision> = ArtifactGenerationProvenance & {
  revision: Revision;
};

export function hasVisibleArtifactOutput(value: string) {
  return value.trim().length > 0;
}

export function artifactOutcomeForFinishReason(
  finishReason: string,
): Extract<ArtifactGenerationOutcome, "complete" | "partial"> {
  return finishReason === "stop" ? "complete" : "partial";
}

export async function settleArtifactGenerationUsage(result: {
  finishReason: PromiseLike<string>;
  usage: PromiseLike<{
    inputTokens?: number | undefined;
    outputTokens?: number | undefined;
    totalTokens?: number | undefined;
  }>;
}): Promise<ArtifactGenerationUsage> {
  try {
    const [usage, finishReason] = await Promise.all([result.usage, result.finishReason]);
    return {
      finishReason,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
    };
  } catch {
    return {
      finishReason: "error",
      inputTokens: undefined,
      outputTokens: undefined,
      totalTokens: undefined,
    };
  }
}
