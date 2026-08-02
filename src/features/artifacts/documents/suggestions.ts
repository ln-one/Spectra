import "server-only";

import { generateText, Output } from "ai";
import { z } from "zod";
import {
  type ArtifactSuggestion,
  type ArtifactSuggestionTarget,
  artifactSuggestionSchema,
} from "@/features/artifacts/suggestions/contract";
import type { Actor } from "@/features/identity/types";
import { listWorkspaceSources } from "@/features/sources/service";
import { getWorkspaceById } from "@/features/workspaces/service";
import type { Locale } from "@/i18n/config";
import { createTeachingDocumentSuggestionModel, teachingDocumentSuggestionProfile } from "./config";

const teachingDocumentSuggestionsOutputSchema = z
  .object({ suggestions: z.array(artifactSuggestionSchema).length(4) })
  .strict();

export type ArtifactSuggestionContext = {
  locale: Locale;
  sourceNames: string[];
  sourceFingerprint: Array<{
    id: string;
    ingestionState: string | null;
    ingestionUpdatedAt: string | null;
    updatedAt: string;
    uploadGeneration: number;
  }>;
  target: ArtifactSuggestionTarget;
  workspaceId: string;
  workspaceName: string;
  workspaceUpdatedAt: string;
};

export async function loadArtifactSuggestionContext(
  actor: Actor,
  workspaceId: string,
  locale: Locale,
  target: ArtifactSuggestionTarget,
): Promise<ArtifactSuggestionContext> {
  const [workspace, sources] = await Promise.all([
    getWorkspaceById(actor, workspaceId),
    listWorkspaceSources(actor, workspaceId),
  ]);
  const uploadedFileSources = sources.filter((source) => source.kind === "uploadedFile");
  return {
    locale,
    sourceNames: uploadedFileSources.slice(0, 20).map((source) => source.originalFilename),
    sourceFingerprint: uploadedFileSources
      .map((source) => ({
        id: source.id,
        ingestionState: source.ingestion?.state ?? null,
        ingestionUpdatedAt: source.ingestion?.updatedAt ?? null,
        updatedAt: source.updatedAt,
        uploadGeneration: source.uploadGeneration,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    target,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    workspaceUpdatedAt: workspace.updatedAt,
  };
}

export async function generateArtifactSuggestions(
  context: ArtifactSuggestionContext,
  abortSignal: AbortSignal,
  previousSuggestions: ArtifactSuggestion[] = [],
): Promise<ArtifactSuggestion[]> {
  const targetInstruction = {
    animation:
      "Generate exactly four concise knowledge-animation task suggestions. Every prompt must explicitly ask for a 15–60 second silent knowledge explanation animation and identify a concrete topic. Leave visual direction, pacing, and scene structure to the animation authoring agent.",
    game: "Generate exactly four concise Flap Revival game task suggestions for practice or review. Every prompt must explicitly ask for a Flap Revival game, identify a usable topic or learning goal, and request 12 single-choice or true-false revival questions.",
    mind_map:
      "Generate exactly four concise mind-map task suggestions for knowledge structures, comparisons, course chapters, or learning paths. Every prompt must explicitly ask for a mind map.",
    presentation:
      "Generate exactly four concise presentation task suggestions. Every prompt must explicitly ask for a presentation, identify a usable topic or learning goal, and request a coherent slide structure.",
    quiz: "Generate exactly four concise quiz task suggestions for checks, diagnostics, practice, or review. Every prompt must explicitly ask for a quiz and identify a usable topic or learning goal.",
    teaching_document:
      "Generate exactly four concise teaching-document task suggestions. Every prompt must explicitly ask for a teaching document.",
  } satisfies Record<ArtifactSuggestionTarget, string>;
  const regenerationInstruction =
    previousSuggestions.length === 0
      ? null
      : [
          "This is a regeneration. Replace every previous card with a materially different topic, angle, or learning outcome.",
          "Do not reuse any previous title or prompt, even with minor wording changes.",
          `Previous suggestions to avoid: ${JSON.stringify(previousSuggestions)}`,
        ].join("\n");
  const result = await generateText({
    abortSignal,
    maxOutputTokens: teachingDocumentSuggestionProfile.maxOutputTokens,
    maxRetries: 0,
    model: createTeachingDocumentSuggestionModel(),
    output: Output.object({ schema: teachingDocumentSuggestionsOutputSchema }),
    prompt: [
      targetInstruction[context.target],
      "Return only valid JSON matching the provided schema: an object with a suggestions array; every item has title and prompt fields.",
      "Suggestions must be distinct and immediately usable.",
      context.locale === "en-US"
        ? "Output every title and prompt in English only. Do not use Chinese."
        : "Output every title and prompt in Simplified Chinese only. Do not use English except unavoidable proper nouns.",
      "A suggestion click will fill a chat composer, so prompt must be a complete editable instruction.",
      "Keep each title compact: at most 20 Chinese characters or 48 Latin characters.",
      "Prefer one short sentence per prompt. Use 40-70 Chinese characters or 80-140 Latin characters.",
      "Prefer one concrete outcome and no more than three requested aspects. Avoid background exposition and filename inventories.",
      "Source filenames are context clues only. Never claim their contents were read.",
      `Workspace: ${context.workspaceName}`,
      `Source filenames: ${context.sourceNames.length > 0 ? context.sourceNames.join(" | ") : "none"}`,
      regenerationInstruction,
    ].join("\n"),
    temperature: teachingDocumentSuggestionProfile.temperature,
  });
  if (
    previousSuggestions.length > 0 &&
    !artifactSuggestionsDifferFrom(result.output.suggestions, previousSuggestions)
  ) {
    throw new Error("Regenerated artifact suggestions repeated a previous card.");
  }
  return result.output.suggestions;
}

function normalizedSuggestionText(value: string) {
  return value.toLocaleLowerCase().replaceAll(/[\p{P}\p{S}\s]+/gu, "");
}

export function artifactSuggestionsDifferFrom(
  suggestions: ArtifactSuggestion[],
  previousSuggestions: ArtifactSuggestion[],
) {
  const previousTitles = new Set(
    previousSuggestions.map((suggestion) => normalizedSuggestionText(suggestion.title)),
  );
  const previousPrompts = new Set(
    previousSuggestions.map((suggestion) => normalizedSuggestionText(suggestion.prompt)),
  );
  return suggestions.every(
    (suggestion) =>
      !previousTitles.has(normalizedSuggestionText(suggestion.title)) &&
      !previousPrompts.has(normalizedSuggestionText(suggestion.prompt)),
  );
}
