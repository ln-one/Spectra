import { z } from "zod";
import { artifactGenerationStateSchema, artifactKindSchema } from "@/features/artifacts/types";
import { artifactGroundingRefsSchema } from "./artifact-tool-protocol";

const artifactPlanItemSchema = z
  .object({
    goal: z.string().trim().min(1).max(2_000),
    groundingRefs: artifactGroundingRefsSchema,
    kind: artifactKindSchema,
    requirements: z.array(z.string().trim().min(1).max(1_000)).max(20),
    title: z.string().trim().min(1).max(200),
  })
  .strip();

export const commitArtifactPlanToolInputSchema = z
  .object({
    items: z.array(artifactPlanItemSchema).min(1),
  })
  .strict();

export const artifactPlanArtifactSummarySchema = z
  .object({
    artifactId: z.string().uuid(),
    generationState: artifactGenerationStateSchema,
    kind: artifactKindSchema,
    title: z.string().trim().min(1).max(200),
  })
  .strict();

export const artifactPlanResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      artifact: artifactPlanArtifactSummarySchema,
      kind: artifactKindSchema,
      planItemId: z.string().uuid(),
      status: z.literal("started"),
    })
    .strict(),
  z
    .object({
      errorCode: z.string().trim().min(1).max(100),
      kind: artifactKindSchema,
      planItemId: z.string().uuid(),
      status: z.literal("failed"),
    })
    .strict(),
]);

export const commitArtifactPlanToolOutputSchema = z
  .object({
    results: z.array(artifactPlanResultSchema).min(1),
    workflowId: z.string().uuid(),
  })
  .strict();

export const artifactPlanProgressDataSchema = z.discriminatedUnion("status", [
  z
    .object({
      index: z.number().int().min(0),
      kind: artifactKindSchema,
      planItemId: z.string().uuid(),
      status: z.literal("running"),
      title: z.string().trim().min(1).max(200),
      workflowId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      status: z.literal("completed"),
      workflowId: z.string().uuid(),
    })
    .strict(),
]);

export const artifactPlanItemFailedDataSchema = z
  .object({
    errorCode: z.string().trim().min(1).max(100),
    index: z.number().int().min(0),
    kind: artifactKindSchema,
    planItemId: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    workflowId: z.string().uuid(),
  })
  .strict();

export type ArtifactPlanItem = z.infer<typeof artifactPlanItemSchema>;
export type ArtifactPlanResult = z.infer<typeof artifactPlanResultSchema>;
