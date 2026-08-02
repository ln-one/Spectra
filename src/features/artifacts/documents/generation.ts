import "server-only";

import { streamText } from "ai";
import {
  type ArtifactGenerationOutcome,
  type ArtifactGenerationUsage,
  artifactOutcomeForFinishReason,
  hasVisibleArtifactOutput,
  settleArtifactGenerationUsage,
} from "@/features/artifacts/generation";
import {
  type ArtifactGroundingBundle,
  emptyArtifactGroundingBundle,
} from "@/features/artifacts/grounding";
import { artifactGroundingPromptSections } from "@/features/artifacts/grounding.server";
import type { Locale } from "@/i18n/config";
import { createTeachingDocumentGenerationModel, teachingDocumentGenerationProfile } from "./config";

export type TeachingDocumentTextGenerator = typeof streamTeachingDocumentMarkdown;

export type TeachingDocumentGeneration = {
  markdown: string;
  outcome: Extract<ArtifactGenerationOutcome, "complete" | "partial">;
  usage: ArtifactGenerationUsage;
};

export async function generateTeachingDocumentDraft(input: {
  abortSignal: AbortSignal;
  grounding?: ArtifactGroundingBundle;
  locale: Locale;
  onTextDelta: (delta: string) => Promise<void>;
  prompt: string;
  streamDraft?: TeachingDocumentTextGenerator;
}): Promise<TeachingDocumentGeneration> {
  const result = (input.streamDraft ?? streamTeachingDocumentMarkdown)({
    abortSignal: input.abortSignal,
    grounding: input.grounding ?? emptyArtifactGroundingBundle(),
    locale: input.locale,
    prompt: input.prompt,
  });
  let markdown = "";
  try {
    for await (const delta of result.textStream) {
      if (!delta) continue;
      markdown += delta;
      await input.onTextDelta(delta);
    }
    const usage = await settleArtifactGenerationUsage(result);
    return {
      markdown,
      outcome: artifactOutcomeForFinishReason(usage.finishReason),
      usage,
    };
  } catch (error) {
    if (!hasVisibleArtifactOutput(markdown)) throw error;
    return { markdown, outcome: "partial", usage: await settleArtifactGenerationUsage(result) };
  }
}

function streamTeachingDocumentMarkdown(input: {
  abortSignal: AbortSignal;
  grounding: ArtifactGroundingBundle;
  locale: Locale;
  prompt: string;
}) {
  return streamText({
    abortSignal: AbortSignal.any([
      input.abortSignal,
      AbortSignal.timeout(teachingDocumentGenerationProfile.timeoutMs),
    ]),
    maxOutputTokens: teachingDocumentGenerationProfile.maxOutputTokens,
    maxRetries: 0,
    model: createTeachingDocumentGenerationModel(),
    prompt: [
      input.locale === "en-US"
        ? "Create a useful teaching document in English."
        : "请使用简体中文创建一份实用的教学文档。",
      "Write the document directly as Markdown; do not wrap the whole response in JSON or a code fence.",
      "Use Markdown structure when it helps, but always prefer preserving useful content over satisfying a rigid format.",
      "The first heading may be the document title. Paragraphs, lists, quotations, links, emphasis, and fenced code are all allowed.",
      ...artifactGroundingPromptSections(input.grounding),
      "User request:",
      input.prompt,
    ].join("\n"),
    temperature: teachingDocumentGenerationProfile.temperature,
  });
}
