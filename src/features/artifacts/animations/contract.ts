import { z } from "zod";
import { artifactGroundingBundleSchema } from "@/features/artifacts/grounding";
import { taskAgentAttemptPhaseSchema } from "@/features/artifacts/task-agent/attempt";

const ANIMATION_RECIPE_VERSION = "animation-remotion-v1";
export const ANIMATION_RENDERER_VERSION = "remotion-4.0.504";
const animationStageSchema = taskAgentAttemptPhaseSchema;

export const animationGenerationDraftSchema = z
  .object({
    schemaVersion: z.literal(1),
    phase: animationStageSchema,
  })
  .strict();

export const animationRevisionContentSchema = z
  .object({
    compositionId: z.string().trim().min(1).max(128),
    durationInFrames: z.number().int().positive(),
    fps: z.number().positive(),
    height: z.number().int().positive(),
    schemaVersion: z.literal(1),
    summary: z.string().trim().max(4_000),
    title: z.string().trim().min(1).max(200),
    width: z.number().int().positive(),
  })
  .strict();

export const animationGenerationRequestSchema = z
  .object({
    durationSeconds: z.number().int().min(15).max(60).default(30),
    grounding: artifactGroundingBundleSchema.optional().default({ evidence: [], version: 1 }),
    locale: z.enum(["zh-CN", "en-US"]),
    prompt: z.string().trim().min(1).max(20_000),
    recipe: z.literal(ANIMATION_RECIPE_VERSION),
  })
  .strict();

const animationSourceFileSchema = z
  .object({
    path: z.string().regex(/^out\/project\/[a-zA-Z0-9._/-]+$/),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    sizeBytes: z.number().int().positive(),
  })
  .strict();

export const animationSourceManifestSchema = z
  .object({
    files: z.array(animationSourceFileSchema).min(4).max(2_000),
    schemaVersion: z.literal(1),
  })
  .strict()
  .superRefine((manifest, context) => {
    const paths = manifest.files.map((file) => file.path);
    if (new Set(paths).size !== paths.length) {
      context.addIssue({ code: "custom", message: "Animation source paths must be unique" });
    }
  });

export type AnimationGenerationRequest = z.infer<typeof animationGenerationRequestSchema>;
export type AnimationRevisionContent = z.infer<typeof animationRevisionContentSchema>;
