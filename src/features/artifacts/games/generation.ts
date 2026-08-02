import "server-only";

import { randomUUID } from "node:crypto";
import { generateText, Output } from "ai";
import { z } from "zod";
import {
  type ArtifactGroundingBundle,
  emptyArtifactGroundingBundle,
} from "@/features/artifacts/grounding";
import { artifactGroundingPromptSections } from "@/features/artifacts/grounding.server";
import type { Locale } from "@/i18n/config";
import { createGameGenerationModel, gameGenerationProfile } from "./config";
import {
  type FlapRevivalGameRevisionContent,
  flapRevivalGameRevisionContentSchema,
  GAME_DEFAULT_QUESTION_COUNT,
} from "./contract";

const generatedQuestionSchema = z
  .object({
    correctAnswer: z.boolean().nullable(),
    correctOptionIndex: z.number().int().min(0).max(5).nullable(),
    difficulty: z.enum(["easy", "medium", "hard"]),
    explanationMarkdown: z.string().trim().min(1).max(20_000),
    options: z.array(z.string().trim().min(1).max(500)).max(6),
    promptMarkdown: z.string().trim().min(1).max(20_000),
    type: z.enum(["single_choice", "true_false"]),
  })
  .strict()
  .superRefine((question, context) => {
    if (question.type === "single_choice") {
      if (question.options.length < 2 || question.options.length > 6) {
        context.addIssue({ code: "custom", message: "Single choice needs 2-6 options" });
      }
      if (
        question.correctOptionIndex == null ||
        question.correctOptionIndex >= question.options.length
      ) {
        context.addIssue({ code: "custom", message: "Single choice needs a valid answer index" });
      }
    } else if (typeof question.correctAnswer !== "boolean") {
      context.addIssue({ code: "custom", message: "True/false answer shape is invalid" });
    }
  });

export const gameModelOutputSchema = z
  .object({
    descriptionMarkdown: z.string().trim().max(20_000),
    questions: z.array(generatedQuestionSchema).min(6),
    skin: z.enum(["skyline_day", "city_sunset", "city_night"]),
    title: z.string().trim().min(1).max(200),
  })
  .strict();

export type GameGenerator = typeof generateGame;

export function buildGameGenerationPrompt(input: {
  correctionAttempt?: number;
  grounding?: ArtifactGroundingBundle;
  locale: Locale;
  prompt: string;
}) {
  const basePrompt = [
    input.locale === "en-US"
      ? "Create the knowledge question bank for a Flap Revival game in English."
      : "仅根据用户本条请求，使用简体中文创建飞跃复活游戏的知识题库。",
    `Return ${GAME_DEFAULT_QUESTION_COUNT} questions unless the user explicitly requests a different count of at least 6. Use about a 2:1 single-choice to true/false ratio unless exact counts are requested.`,
    "Only use single_choice and true_false. Do not put question numbers or type labels into promptMarkdown.",
    "For single_choice, set type=single_choice, provide 2-6 unique plain-string options, set correctOptionIndex to the zero-based index of the answer, and set correctAnswer=null.",
    "For true_false, set type=true_false, set options=[], set correctOptionIndex=null, and put the boolean answer in correctAnswer.",
    "Always include correctOptionIndex and correctAnswer explicitly, including when their required value is null. Never swap their meanings.",
    "Every choice option must be a plain display string. Never serialize an object or array into an option string.",
    "Every choice option must directly answer its own question and use subject-specific labels. Reusing a meaningful option set across questions is allowed when the same labels genuinely apply. Never insert placeholder algorithm names from unrelated subjects.",
    "Every question is worth one point in the persisted game contract. Answers must be unambiguous and explanations useful.",
    "Choose exactly one complete skin. Do not describe or combine individual assets.",
    ...artifactGroundingPromptSections(input.grounding ?? emptyArtifactGroundingBundle()),
    "User request:",
    input.prompt,
  ].join("\n");
  return input.correctionAttempt
    ? `${basePrompt}\nThe previous structured result was invalid. Regenerate the complete game question bank and strictly follow every per-type null, answer, and option rule. This is correction attempt ${input.correctionAttempt} of 2.`
    : basePrompt;
}

async function requestGameGeneration(abortSignal: AbortSignal, prompt: string) {
  return generateText({
    abortSignal,
    maxOutputTokens: gameGenerationProfile.maxOutputTokens,
    maxRetries: 0,
    model: createGameGenerationModel(),
    output: Output.object({ schema: gameModelOutputSchema }),
    temperature: gameGenerationProfile.temperature,
    prompt,
  });
}

export async function generateGame(input: {
  abortSignal: AbortSignal;
  grounding?: ArtifactGroundingBundle;
  idFactory?: () => string;
  locale: Locale;
  prompt: string;
}): Promise<{
  content: FlapRevivalGameRevisionContent;
  usage: {
    finishReason: string;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}> {
  const abortSignal = AbortSignal.any([
    input.abortSignal,
    AbortSignal.timeout(gameGenerationProfile.timeoutMs),
  ]);
  let result: Awaited<ReturnType<typeof requestGameGeneration>> | null = null;
  let latestError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      result = await requestGameGeneration(
        abortSignal,
        buildGameGenerationPrompt({
          correctionAttempt: attempt,
          locale: input.locale,
          prompt: input.prompt,
          ...(input.grounding ? { grounding: input.grounding } : {}),
        }),
      );
      void result.output;
      latestError = undefined;
      break;
    } catch (error) {
      latestError = error;
    }
  }
  if (latestError !== undefined) throw latestError;
  if (result === null) throw new Error("game_generation_missing_result");
  const idFactory = input.idFactory ?? randomUUID;
  const generated = result.output;
  const content = flapRevivalGameRevisionContentSchema.parse({
    descriptionMarkdown: generated.descriptionMarkdown,
    questions: generated.questions.map((question) => {
      const base = {
        difficulty: question.difficulty,
        explanationMarkdown: question.explanationMarkdown,
        points: 1,
        promptMarkdown: question.promptMarkdown,
        questionId: idFactory(),
        type: question.type,
      };
      if (question.type === "true_false") {
        if (typeof question.correctAnswer !== "boolean") {
          throw new Error("game_generation_invalid_answer");
        }
        return { ...base, correctAnswer: question.correctAnswer };
      }
      const options = question.options.map((text) => ({ optionId: idFactory(), text }));
      const correctOptionId = options[question.correctOptionIndex ?? -1]?.optionId;
      if (!correctOptionId) throw new Error("game_generation_invalid_answer");
      return { ...base, correctOptionId, options };
    }),
    revival: { questionCount: 3, requiredCorrect: 2 },
    schemaVersion: 1,
    skin: generated.skin,
    template: "flap_revival",
    title: generated.title,
  });
  const [usage, finishReason] = await Promise.all([result.usage, result.finishReason]);
  return {
    content,
    usage: {
      finishReason,
      ...(usage.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {}),
      ...(usage.outputTokens !== undefined ? { outputTokens: usage.outputTokens } : {}),
      ...(usage.totalTokens !== undefined ? { totalTokens: usage.totalTokens } : {}),
    },
  };
}
