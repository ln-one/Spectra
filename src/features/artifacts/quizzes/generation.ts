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
import { createQuizGenerationModel, quizGenerationProfile } from "./config";
import {
  QUIZ_DEFAULT_QUESTION_COUNT,
  type QuizRevisionContent,
  quizRevisionContentSchema,
} from "./contract";

// Keep the model-facing schema free of JSON Schema unions. Some OpenAI-compatible providers
// accept `anyOf` but collapse every item to one branch. The owned revision schema below remains
// a strict discriminated union; this transport is validated and converted before persistence.
const generatedQuestionSchema = z
  .object({
    correctAnswer: z.boolean().nullable(),
    correctOptionIndexes: z.array(z.number().int().min(0).max(5)).max(5),
    difficulty: z.enum(["easy", "medium", "hard"]),
    explanationMarkdown: z.string().trim().min(1).max(20_000),
    options: z.array(z.string().trim().min(1).max(500)).max(6),
    points: z.number().int().min(1).max(100),
    promptMarkdown: z.string().trim().min(1).max(20_000),
    type: z.enum(["single_choice", "multiple_choice", "true_false"]),
  })
  .strict()
  .superRefine((question, context) => {
    const correct = new Set(question.correctOptionIndexes);
    const choiceQuestion = question.type !== "true_false";
    if (choiceQuestion && (question.options.length < 2 || question.options.length > 6)) {
      context.addIssue({
        code: "custom",
        message: "Choice questions require two to six options",
        path: ["options"],
      });
    }
    if (!choiceQuestion && question.options.length !== 0) {
      context.addIssue({
        code: "custom",
        message: "True/false questions must not contain options",
        path: ["options"],
      });
    }
    if (question.type === "single_choice" && question.correctOptionIndexes.length !== 1) {
      context.addIssue({
        code: "custom",
        message: "Single-choice questions require exactly one answer index",
        path: ["correctOptionIndexes"],
      });
    }
    if (question.type === "multiple_choice" && correct.size < 1) {
      context.addIssue({
        code: "custom",
        message: "Multiple-choice questions require at least one answer index",
        path: ["correctOptionIndexes"],
      });
    }
    if (correct.size !== question.correctOptionIndexes.length) {
      context.addIssue({
        code: "custom",
        message: "Answer indexes must be unique",
        path: ["correctOptionIndexes"],
      });
    }
    if (question.correctOptionIndexes.some((index) => index >= question.options.length)) {
      context.addIssue({
        code: "custom",
        message: "Answer indexes must reference options",
        path: ["correctOptionIndexes"],
      });
    }
    if (question.type === "multiple_choice" && correct.size >= question.options.length) {
      context.addIssue({
        code: "custom",
        message: "Multiple-choice questions require at least one distractor",
        path: ["correctOptionIndexes"],
      });
    }
    if (choiceQuestion && question.correctAnswer !== null) {
      context.addIssue({
        code: "custom",
        message: "Choice questions must use answer indexes",
        path: ["correctAnswer"],
      });
    }
    if (!choiceQuestion && question.correctAnswer === null) {
      context.addIssue({
        code: "custom",
        message: "True/false questions require a boolean answer",
        path: ["correctAnswer"],
      });
    }
    if (!choiceQuestion && question.correctOptionIndexes.length !== 0) {
      context.addIssue({
        code: "custom",
        message: "True/false questions must not use answer indexes",
        path: ["correctOptionIndexes"],
      });
    }
    const normalizedOptions = question.options.map((option) => option.trim().toLocaleLowerCase());
    if (new Set(normalizedOptions).size !== normalizedOptions.length) {
      context.addIssue({
        code: "custom",
        message: "Choice option labels must be unique",
        path: ["options"],
      });
    }
    question.options.forEach((option, index) => {
      if (isStructuredOptionWrapper(option)) {
        context.addIssue({
          code: "custom",
          message: "Choice options must be plain user-visible labels",
          path: ["options", index],
        });
      }
    });
  });

function isStructuredOptionWrapper(value: string) {
  const text = value.trim();
  if (text.startsWith("[") && text.endsWith("]")) {
    try {
      return Array.isArray(JSON.parse(text));
    } catch {
      return false;
    }
  }
  if (!text.startsWith("{") || !text.endsWith("}")) return false;
  const body = text.slice(1, -1).trim();
  const separator = body.indexOf(":");
  if (separator < 0) return false;
  const key = body
    .slice(0, separator)
    .trim()
    .replaceAll('"', "")
    .replaceAll("'", "")
    .toLocaleLowerCase();
  return key === "text" || key === "label" || key === "value";
}

export const quizModelOutputSchema = z
  .object({
    descriptionMarkdown: z.string().trim().max(20_000),
    questions: z.array(generatedQuestionSchema).min(1).max(50),
    settings: z
      .object({
        feedbackMode: z.enum(["after_submission", "immediate"]),
        navigationMode: z.enum(["free", "sequential"]),
      })
      .strict(),
    title: z.string().trim().min(1).max(200),
  })
  .strict();

export type QuizGenerator = typeof generateQuiz;

async function requestQuizGeneration(abortSignal: AbortSignal, prompt: string) {
  return generateText({
    abortSignal,
    maxOutputTokens: quizGenerationProfile.maxOutputTokens,
    maxRetries: 0,
    model: createQuizGenerationModel(),
    output: Output.object({ schema: quizModelOutputSchema }),
    prompt,
    temperature: quizGenerationProfile.temperature,
  });
}

export async function generateQuiz(input: {
  abortSignal: AbortSignal;
  grounding?: ArtifactGroundingBundle;
  idFactory?: () => string;
  locale: Locale;
  prompt: string;
}): Promise<{
  content: QuizRevisionContent;
  usage: {
    finishReason: string;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}> {
  const abortSignal = AbortSignal.any([
    input.abortSignal,
    AbortSignal.timeout(quizGenerationProfile.timeoutMs),
  ]);
  const basePrompt = [
    input.locale === "en-US"
      ? "Create a useful quiz in English from the latest user request."
      : "仅根据用户本条请求，使用简体中文创建一份实用测验。",
    `Create ${QUIZ_DEFAULT_QUESTION_COUNT} questions unless the user explicitly requests another count, never more than 50.`,
    "Use single choice, multiple choice, and true/false where suitable. Every question needs an unambiguous answer and explanation.",
    "Do not put question numbers or type labels such as single-choice, multiple-choice, or true/false into promptMarkdown; the structured type field is the only UI type identity.",
    "For single_choice and multiple_choice, set correctAnswer=null and use zero-based correctOptionIndexes that reference options. Single choice has exactly one index; multiple choice has at least one correct option and one distractor.",
    "For true_false, set options=[] and correctOptionIndexes=[], then put the boolean answer in correctAnswer.",
    "Every choice option must be a unique plain display string. Never serialize an object or array into an option string and never wrap a label as {text: ...}, {label: ...}, or {value: ...}.",
    "Default settings are feedbackMode=after_submission and navigationMode=free unless the user explicitly asks otherwise.",
    ...artifactGroundingPromptSections(input.grounding ?? emptyArtifactGroundingBundle()),
    "User request:",
    input.prompt,
  ].join("\n");
  let result: Awaited<ReturnType<typeof requestQuizGeneration>> | null = null;
  let latestError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      result = await requestQuizGeneration(
        abortSignal,
        attempt === 0
          ? basePrompt
          : `${basePrompt}\nThe previous structured result was invalid. Regenerate the complete quiz and strictly follow every schema and plain-option rule. This is correction attempt ${attempt} of 2.`,
      );
      void result.output;
      latestError = undefined;
      break;
    } catch (error) {
      latestError = error;
    }
  }
  if (latestError !== undefined) throw latestError;
  // The loop either returns a validated structured result or throws above.
  if (result === null) throw new Error("quiz_generation_missing_result");
  const idFactory = input.idFactory ?? randomUUID;
  const generated = result.output;
  const content = quizRevisionContentSchema.parse({
    descriptionMarkdown: generated.descriptionMarkdown,
    questions: generated.questions.map((question) => {
      const questionId = idFactory();
      const {
        correctAnswer,
        correctOptionIndexes,
        difficulty,
        explanationMarkdown,
        options: generatedOptions,
        points,
        promptMarkdown,
        type,
      } = question;
      const base = { difficulty, explanationMarkdown, points, promptMarkdown, questionId, type };
      if (type === "true_false") {
        if (correctAnswer === null) throw new Error("quiz_generation_invalid_answer");
        return { ...base, correctAnswer };
      }
      const options = generatedOptions.map((text) => ({ optionId: idFactory(), text }));
      if (type === "single_choice") {
        const correctOptionId = options[correctOptionIndexes[0] ?? -1]?.optionId;
        if (!correctOptionId) throw new Error("quiz_generation_invalid_answer");
        return { ...base, correctOptionId, options };
      }
      const correctOptionIds = correctOptionIndexes.map((index) => options[index]?.optionId);
      if (correctOptionIds.some((id) => !id)) throw new Error("quiz_generation_invalid_answer");
      return { ...base, correctOptionIds, options };
    }),
    schemaVersion: 1,
    settings: generated.settings,
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
