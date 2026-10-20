import { z } from "zod";

export const artifactKindSchema = z.enum([
  "teaching_document",
  "mind_map",
  "quiz",
  "game",
  "presentation",
  "animation",
]);

export const artifactSourceKindSchema = z.enum([
  "teaching_document",
  "mind_map",
  "quiz",
  "game",
  "presentation",
]);

export const artifactGenerationStateSchema = z.enum([
  "queued",
  "generating",
  "finalizing",
  "ready",
  "failed",
  "cancelled",
]);

export const artifactHistoryItemSchema = z
  .object({
    canRetryGeneration: z.boolean().optional(),
    createdAt: z.iso.datetime(),
    currentRevisionId: z.string().uuid().nullable(),
    failureCode: z.string().trim().min(1).max(100).nullable().optional(),
    generationState: artifactGenerationStateSchema,
    id: z.string().uuid(),
    kind: artifactKindSchema,
    sourceUserMessageId: z.string().min(1).max(128).nullable().optional(),
    title: z.string().trim().min(1).max(200),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export type ArtifactGenerationState = z.infer<typeof artifactGenerationStateSchema>;
export type ArtifactHistoryItem = z.infer<typeof artifactHistoryItemSchema>;
export const workspaceArtifactNavigationItemSchema = artifactHistoryItemSchema.extend({
  conversationId: z.string().uuid(),
});
export type WorkspaceArtifactNavigationItem = z.infer<typeof workspaceArtifactNavigationItemSchema>;
export type ArtifactKind = z.infer<typeof artifactKindSchema>;
export type ArtifactSourceKind = z.infer<typeof artifactSourceKindSchema>;

export function isArtifactSourceKind(kind: string): kind is ArtifactSourceKind {
  return artifactSourceKindSchema.safeParse(kind).success;
}

export function artifactGenerationStateRank(state: ArtifactGenerationState) {
  if (state === "ready") return 5;
  if (state === "failed" || state === "cancelled") return 4;
  if (state === "finalizing") return 3;
  if (state === "generating") return 2;
  return 1;
}

export function artifactEffectiveGenerationState(input: {
  currentRevisionId: string | null;
  generationState: ArtifactGenerationState;
}): ArtifactGenerationState {
  return input.currentRevisionId ? "ready" : input.generationState;
}
