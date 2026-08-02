import { z } from "zod";
import { artifactGroundingBundleSchema } from "@/features/artifacts/grounding";
import {
  quizAnswerSchema,
  singleChoiceQuestionSchema,
  trueFalseQuestionSchema,
} from "../quizzes/contract";

export const FLAP_RUNTIME_VERSION = "sidequest-8fbdde2-spectra-v1";
export const GAME_DEFAULT_QUESTION_COUNT = 12;

export const gameSkinSchema = z.enum(["skyline_day", "city_sunset", "city_night"]);
export const gameQuestionSchema = z.discriminatedUnion("type", [
  singleChoiceQuestionSchema,
  trueFalseQuestionSchema,
]);

export type GameQuestion = z.infer<typeof gameQuestionSchema>;

export const flapRevivalGameRevisionContentSchema = z
  .object({
    descriptionMarkdown: z.string().trim().max(20_000),
    questions: z.array(gameQuestionSchema).min(6),
    revival: z.object({ questionCount: z.literal(3), requiredCorrect: z.literal(2) }).strict(),
    schemaVersion: z.literal(1),
    skin: gameSkinSchema,
    template: z.literal("flap_revival"),
    title: z.string().trim().min(1).max(200),
  })
  .strict()
  .superRefine((game, context) => {
    const ids = game.questions.map((question) => question.questionId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: "custom", message: "Game question IDs must be unique" });
    }
    for (const [index, question] of game.questions.entries()) {
      if (question.points !== 1) {
        context.addIssue({
          code: "custom",
          message: "Game revival questions must be worth one point",
          path: ["questions", index, "points"],
        });
      }
    }
  });

export const gameGenerationRequestSchema = z
  .object({
    grounding: artifactGroundingBundleSchema.optional().default({ evidence: [], version: 1 }),
    locale: z.enum(["zh-CN", "en-US"]),
    prompt: z.string().trim().min(1).max(20_000),
  })
  .strict();

export const gameRevivalSubmissionSchema = z
  .object({
    answers: z
      .array(z.object({ answer: quizAnswerSchema, questionId: z.string().uuid() }).strict())
      .length(3),
    idempotencyKey: z.string().trim().min(1).max(128),
  })
  .strict();

export type FlapRevivalGameRevisionContent = z.infer<typeof flapRevivalGameRevisionContentSchema>;
