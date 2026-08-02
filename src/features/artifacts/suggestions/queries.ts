import type { Locale } from "@/i18n/config";
import { type ArtifactSuggestionTarget, artifactSuggestionsResponseSchema } from "./contract";

const PRESENTATION_VERSION = "artifact-v1";

export const artifactSuggestionQueryKeys = {
  suggestions: (
    workspaceId: string,
    conversationId: string,
    locale: Locale,
    target: ArtifactSuggestionTarget,
  ) =>
    [
      "workspace",
      workspaceId,
      "conversation",
      conversationId,
      "artifact-suggestions",
      PRESENTATION_VERSION,
      locale,
      target,
    ] as const,
};

export async function fetchArtifactSuggestions(
  workspaceId: string,
  locale: Locale,
  target: ArtifactSuggestionTarget,
  afterGeneration?: string | null,
  waitOnly = false,
) {
  const query = new URLSearchParams({ locale, target, view: PRESENTATION_VERSION, workspaceId });
  if (afterGeneration !== undefined) {
    query.set("afterGeneration", afterGeneration ?? "missing");
  }
  if (waitOnly) query.set("waitOnly", "true");
  const response = await fetch(`/api/artifacts/suggestions?${query}`);
  if (!response.ok) throw new Error("artifact_suggestions_unavailable");
  return artifactSuggestionsResponseSchema.parse(await response.json());
}

export async function regenerateArtifactSuggestions(
  workspaceId: string,
  locale: Locale,
  target: ArtifactSuggestionTarget,
  afterGeneration: string | null,
) {
  const response = await fetch("/api/artifacts/suggestions", {
    body: JSON.stringify({
      afterGeneration: afterGeneration ?? "missing",
      locale,
      target,
      workspaceId,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!response.ok) throw new Error("artifact_suggestions_unavailable");
  return artifactSuggestionsResponseSchema.parse(await response.json());
}
