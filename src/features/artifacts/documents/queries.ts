import { z } from "zod";
import {
  artifactSuggestionQueryKeys,
  fetchArtifactSuggestions,
  regenerateArtifactSuggestions,
} from "@/features/artifacts/suggestions/queries";
import type { Locale } from "@/i18n/config";
import { teachingDocumentSuggestionSchema } from "./contract";
import type {
  TeachingDocumentArtifact,
  TeachingDocumentDetail,
  TeachingDocumentHistoryItem,
} from "./types";

const suggestionsResponseSchema = z
  .object({
    generation: z.iso.datetime().nullable().optional(),
    status: z.enum(["fresh", "stale", "pending", "failed"]),
    suggestions: z.array(teachingDocumentSuggestionSchema).max(4),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.status === "fresh" || value.status === "stale") && value.suggestions.length !== 4) {
      context.addIssue({ code: "custom", message: "Suggestion snapshot must contain four cards" });
    }
  });

export const teachingDocumentQueryKeys = {
  detail: (workspaceId: string, conversationId: string, artifactId: string) =>
    [
      "workspace",
      workspaceId,
      "conversation",
      conversationId,
      "teaching-document",
      artifactId,
    ] as const,
  history: (workspaceId: string, conversationId: string) =>
    ["workspace", workspaceId, "conversation", conversationId, "teaching-documents"] as const,
  suggestions: (workspaceId: string, conversationId: string, locale: Locale) =>
    artifactSuggestionQueryKeys.suggestions(
      workspaceId,
      conversationId,
      locale,
      "teaching_document",
    ),
};

export async function fetchTeachingDocumentSuggestions(
  workspaceId: string,
  locale: Locale,
  afterGeneration?: string | null,
  waitOnly = false,
) {
  return suggestionsResponseSchema.parse(
    await fetchArtifactSuggestions(
      workspaceId,
      locale,
      "teaching_document",
      afterGeneration,
      waitOnly,
    ),
  );
}

export async function regenerateTeachingDocumentSuggestions(
  workspaceId: string,
  locale: Locale,
  afterGeneration: string | null,
) {
  return suggestionsResponseSchema.parse(
    await regenerateArtifactSuggestions(workspaceId, locale, "teaching_document", afterGeneration),
  );
}

export function teachingDocumentHistoryItem(
  detail: TeachingDocumentDetail,
): TeachingDocumentHistoryItem {
  return {
    createdAt: detail.createdAt,
    currentRevisionId: detail.artifact?.currentRevision.id ?? null,
    generationState: detail.generationState,
    id: detail.id,
    kind: detail.kind,
    title: detail.title,
    updatedAt: detail.updatedAt,
  };
}

export function upsertTeachingDocumentHistory(
  history: readonly TeachingDocumentHistoryItem[],
  detail: TeachingDocumentDetail,
) {
  return [
    teachingDocumentHistoryItem(detail),
    ...history.filter((item) => item.id !== detail.id),
  ].slice(0, 50);
}

export function readyTeachingDocumentDetail(
  artifact: TeachingDocumentArtifact,
): TeachingDocumentDetail {
  return {
    artifact,
    createdAt: artifact.createdAt,
    draft: null,
    failureCode: null,
    generationState: "ready",
    id: artifact.id,
    kind: "teaching_document",
    generationAttemptId: null,
    generationSequence: 0,
    title: artifact.title,
    updatedAt: artifact.updatedAt,
    workspaceId: artifact.workspaceId,
  };
}
