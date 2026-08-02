import "server-only";

import { randomUUID } from "node:crypto";
import { streamText } from "ai";
import {
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
import { createMindMapGenerationModel, mindMapGenerationProfile } from "./config";
import type { MindMapDraftSnapshot } from "./contract";
import { createIncrementalMindMapProjector } from "./projector";

export type MindMapDraftGenerator = typeof streamMindMapText;

export async function generateMindMapDraft(input: {
  abortSignal: AbortSignal;
  grounding?: ArtifactGroundingBundle;
  idFactory?: () => string;
  locale: Locale;
  onSnapshot: (snapshot: MindMapDraftSnapshot, rawOutput: string) => Promise<void>;
  onTextDelta: (delta: string, rawOutput: string) => Promise<void>;
  prompt: string;
  streamDraft?: MindMapDraftGenerator;
}) {
  const result = (input.streamDraft ?? streamMindMapText)({
    abortSignal: input.abortSignal,
    grounding: input.grounding ?? emptyArtifactGroundingBundle(),
    locale: input.locale,
    prompt: input.prompt,
  });
  const project = createIncrementalMindMapProjector(input.idFactory ?? randomUUID);
  let rawOutput = "";
  let lastSnapshot = "";
  let latestSnapshot: MindMapDraftSnapshot | null = null;
  try {
    for await (const delta of result.textStream) {
      rawOutput += delta;
      await input.onTextDelta(delta, rawOutput);
      const snapshot = project(rawOutput);
      if (!snapshot) continue;
      const serialized = JSON.stringify(snapshot);
      if (serialized === lastSnapshot) continue;
      lastSnapshot = serialized;
      latestSnapshot = snapshot;
      await input.onSnapshot(snapshot, rawOutput);
    }
    const usage = await settleArtifactGenerationUsage(result);
    return {
      outcome: artifactOutcomeForFinishReason(usage.finishReason),
      rawOutput,
      snapshot: latestSnapshot,
      usage,
    };
  } catch (error) {
    if (!hasVisibleArtifactOutput(rawOutput)) throw error;
    return {
      outcome: "partial" as const,
      rawOutput,
      snapshot: latestSnapshot,
      usage: await settleArtifactGenerationUsage(result),
    };
  }
}

function streamMindMapText(input: {
  abortSignal: AbortSignal;
  grounding: ArtifactGroundingBundle;
  locale: Locale;
  prompt: string;
}) {
  return streamText({
    abortSignal: AbortSignal.any([
      input.abortSignal,
      AbortSignal.timeout(mindMapGenerationProfile.timeoutMs),
    ]),
    maxOutputTokens: mindMapGenerationProfile.maxOutputTokens,
    maxRetries: 0,
    model: createMindMapGenerationModel(),
    prompt: [
      input.locale === "en-US"
        ? "Create a useful mind map in English."
        : "请使用简体中文创建一份实用的思维导图。",
      'Return only JSON with this shape: {"root":{"label":"topic","note":"optional","children":[]}}.',
      "Every node must include label and children. Do not add prose, Markdown fences, or alternate fields.",
      ...artifactGroundingPromptSections(input.grounding),
      "User request:",
      input.prompt,
    ].join("\n"),
    temperature: mindMapGenerationProfile.temperature,
  });
}
