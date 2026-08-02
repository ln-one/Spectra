import { z } from "zod";
import { artifactSelectionSchemas } from "@/features/artifacts/contract";
import { resolvedMindMapFocusSchema } from "@/features/artifacts/mind-maps/refine";
import { resolvedQuizFocusSchema } from "@/features/artifacts/quizzes/refine";
import { artifactGenerationStateSchema, artifactKindSchema } from "@/features/artifacts/types";

const agentArtifactFocusSchema = z.union([
  artifactSelectionSchemas.teaching_document,
  artifactSelectionSchemas.mind_map,
  artifactSelectionSchemas.presentation,
  artifactSelectionSchemas.quiz,
]);

const resolvedAgentArtifactFocusSchema = z.union([
  artifactSelectionSchemas.teaching_document,
  resolvedMindMapFocusSchema,
  artifactSelectionSchemas.presentation,
  resolvedQuizFocusSchema,
]);

export const agentSurfaceContextSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("studio") }).strict(),
  z
    .object({
      kind: artifactKindSchema,
      type: z.literal("artifact_start"),
    })
    .strict(),
  z
    .object({
      artifactId: z.string().uuid(),
      focus: agentArtifactFocusSchema.optional(),
      revisionId: z.string().uuid().nullable(),
      type: z.literal("artifact_detail"),
    })
    .strict(),
]);

export type AgentSurfaceContext = z.infer<typeof agentSurfaceContextSchema>;

export const resolvedAgentSurfaceContextSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("studio") }).strict(),
  z
    .object({
      kind: artifactKindSchema,
      type: z.literal("artifact_start"),
    })
    .strict(),
  z
    .object({
      artifactId: z.string().uuid(),
      canManage: z.boolean().optional(),
      expectedRevisionId: z.string().uuid().nullable(),
      focus: resolvedAgentArtifactFocusSchema.optional(),
      generationState: artifactGenerationStateSchema,
      kind: artifactKindSchema,
      title: z.string().trim().min(1).max(200),
      type: z.literal("artifact_detail"),
    })
    .strict(),
]);

export type ResolvedAgentSurfaceContext = z.infer<typeof resolvedAgentSurfaceContextSchema>;
