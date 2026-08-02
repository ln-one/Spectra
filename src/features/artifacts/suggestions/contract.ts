import { z } from "zod";

export const artifactSuggestionTargetSchema = z.enum([
  "teaching_document",
  "mind_map",
  "quiz",
  "game",
  "presentation",
  "animation",
]);
export type ArtifactSuggestionTarget = z.infer<typeof artifactSuggestionTargetSchema>;

export const artifactSuggestionSchema = z
  .object({
    prompt: z.string().trim().min(1).max(600),
    title: z.string().trim().min(1).max(80),
  })
  .strict();
export type ArtifactSuggestion = z.infer<typeof artifactSuggestionSchema>;

export const artifactSuggestionsResponseSchema = z
  .object({
    generation: z.iso.datetime().nullable().optional(),
    status: z.enum(["fresh", "stale", "pending", "failed"]),
    suggestions: z.array(artifactSuggestionSchema).max(4),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.status === "fresh" || value.status === "stale") && value.suggestions.length !== 4) {
      context.addIssue({ code: "custom", message: "Suggestion snapshot must contain four cards" });
    }
  });
