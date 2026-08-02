import { z } from "zod";
import { artifactGroundingBundleSchema } from "@/features/artifacts/grounding";

const QUIZ_MAX_QUESTIONS = 50;
export const QUIZ_DEFAULT_QUESTION_COUNT = 8;

const entityIdSchema = z.string().uuid();
const markdownSchema = z.string().trim().min(1).max(20_000);
const optionTextSchema = z.string().trim().min(1).max(500);

const quizFeedbackModeSchema = z.enum(["after_submission", "immediate"]);
const quizNavigationModeSchema = z.enum(["free", "sequential"]);
const quizDifficultySchema = z.enum(["easy", "medium", "hard"]);

const quizQuestionBase = {
  difficulty: quizDifficultySchema,
  explanationMarkdown: markdownSchema,
  points: z.number().int().min(1).max(100),
  promptMarkdown: markdownSchema,
  questionId: entityIdSchema,
};

const quizOptionSchema = z.object({ optionId: entityIdSchema, text: optionTextSchema }).strict();

const choiceListSchema = z
  .array(quizOptionSchema)
  .min(2)
  .max(6)
  .superRefine((options, context) => {
    const ids = options.map((option) => option.optionId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: "custom", message: "Quiz option IDs must be unique" });
    }
  });

export const singleChoiceQuestionSchema = z
  .object({
    ...quizQuestionBase,
    correctOptionId: entityIdSchema,
    options: choiceListSchema,
    type: z.literal("single_choice"),
  })
  .strict()
  .superRefine((question, context) => {
    if (!question.options.some((option) => option.optionId === question.correctOptionId)) {
      context.addIssue({
        code: "custom",
        message: "Single-choice answer must reference an option",
        path: ["correctOptionId"],
      });
    }
  });

const multipleChoiceQuestionSchema = z
  .object({
    ...quizQuestionBase,
    correctOptionIds: z.array(entityIdSchema).min(1).max(5),
    options: choiceListSchema,
    type: z.literal("multiple_choice"),
  })
  .strict()
  .superRefine((question, context) => {
    const correct = new Set(question.correctOptionIds);
    if (correct.size !== question.correctOptionIds.length) {
      context.addIssue({
        code: "custom",
        message: "Multiple-choice answer IDs must be unique",
        path: ["correctOptionIds"],
      });
    }
    const optionIds = new Set(question.options.map((option) => option.optionId));
    if (question.correctOptionIds.some((id) => !optionIds.has(id))) {
      context.addIssue({
        code: "custom",
        message: "Multiple-choice answers must reference options",
        path: ["correctOptionIds"],
      });
    }
    if (correct.size >= question.options.length) {
      context.addIssue({
        code: "custom",
        message: "Multiple-choice questions require at least one distractor",
        path: ["correctOptionIds"],
      });
    }
  });

export const trueFalseQuestionSchema = z
  .object({
    ...quizQuestionBase,
    correctAnswer: z.boolean(),
    type: z.literal("true_false"),
  })
  .strict();

const quizQuestionSchema = z.discriminatedUnion("type", [
  singleChoiceQuestionSchema,
  multipleChoiceQuestionSchema,
  trueFalseQuestionSchema,
]);

export const quizRevisionContentSchema = z
  .object({
    descriptionMarkdown: z.string().trim().max(20_000),
    questions: z.array(quizQuestionSchema).min(1).max(QUIZ_MAX_QUESTIONS),
    schemaVersion: z.literal(1),
    settings: z
      .object({
        feedbackMode: quizFeedbackModeSchema,
        navigationMode: quizNavigationModeSchema,
      })
      .strict(),
    title: z.string().trim().min(1).max(200),
  })
  .strict()
  .superRefine((quiz, context) => {
    const ids = quiz.questions.map((question) => question.questionId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: "custom", message: "Quiz question IDs must be unique" });
    }
  });

export const quizGenerationRequestSchema = z
  .object({
    grounding: artifactGroundingBundleSchema.optional().default({ evidence: [], version: 1 }),
    locale: z.enum(["zh-CN", "en-US"]),
    prompt: z.string().trim().min(1).max(20_000),
  })
  .strict();

export const quizAnswerSchema = z.discriminatedUnion("type", [
  z.object({ optionId: entityIdSchema.nullable(), type: z.literal("single_choice") }).strict(),
  z
    .object({ optionIds: z.array(entityIdSchema).max(6), type: z.literal("multiple_choice") })
    .strict()
    .superRefine((answer, context) => {
      if (new Set(answer.optionIds).size !== answer.optionIds.length) {
        context.addIssue({ code: "custom", message: "Answer option IDs must be unique" });
      }
    }),
  z.object({ type: z.literal("true_false"), value: z.boolean().nullable() }).strict(),
]);

const deliveryChoiceQuestionBase = {
  difficulty: quizDifficultySchema,
  options: z.array(quizOptionSchema).min(2).max(6),
  points: z.number().int().min(1).max(100),
  promptMarkdown: markdownSchema,
  questionId: entityIdSchema,
};

const quizDeliveryQuestionSchema = z.discriminatedUnion("type", [
  z.object({ ...deliveryChoiceQuestionBase, type: z.literal("single_choice") }).strict(),
  z.object({ ...deliveryChoiceQuestionBase, type: z.literal("multiple_choice") }).strict(),
  z
    .object({
      difficulty: quizDifficultySchema,
      points: z.number().int().min(1).max(100),
      promptMarkdown: markdownSchema,
      questionId: entityIdSchema,
      type: z.literal("true_false"),
    })
    .strict(),
]);

const quizDeliverySnapshotSchema = z
  .object({
    artifactId: entityIdSchema,
    descriptionMarkdown: z.string().trim().max(20_000),
    feedbackMode: quizFeedbackModeSchema,
    navigationMode: quizNavigationModeSchema,
    questions: z.array(quizDeliveryQuestionSchema).min(1).max(QUIZ_MAX_QUESTIONS),
    revisionId: entityIdSchema,
    title: z.string().trim().min(1).max(200),
    totalPoints: z.number().int().min(1),
  })
  .strict();

const quizAttemptAnswerSnapshotSchema = z
  .object({
    answer: quizAnswerSchema,
    correct: z.boolean().nullable(),
    earnedPoints: z.number().int().min(0).nullable(),
    flagged: z.boolean(),
    questionId: entityIdSchema,
    version: z.number().int().min(1),
  })
  .strict();

export const quizAttemptDetailSchema = z
  .object({
    answers: z.array(quizAttemptAnswerSnapshotSchema),
    delivery: quizDeliverySnapshotSchema,
    id: entityIdSchema,
    result: z
      .object({
        content: quizRevisionContentSchema,
        graderVersion: z.string().trim().min(1).max(64),
        score: z.number().int().min(0),
        submittedAt: z.iso.datetime(),
        totalPoints: z.number().int().min(1),
      })
      .strict()
      .nullable(),
    state: z.enum(["in_progress", "submitted", "abandoned"]),
  })
  .strict();

export const quizAttemptHistorySchema = z
  .object({
    artifactRevisionId: entityIdSchema,
    createdAt: z.iso.datetime(),
    id: entityIdSchema,
    score: z.number().int().min(0).nullable(),
    state: z.enum(["in_progress", "submitted", "abandoned"]),
    submittedAt: z.iso.datetime().nullable(),
    totalPoints: z.number().int().min(1).nullable(),
  })
  .strict();

export type QuizAnswer = z.infer<typeof quizAnswerSchema>;
export type QuizAttemptDetail = z.infer<typeof quizAttemptDetailSchema>;
export type QuizDeliverySnapshot = z.infer<typeof quizDeliverySnapshotSchema>;
export type QuizDeliveryQuestion = z.infer<typeof quizDeliveryQuestionSchema>;
export type QuizQuestionDelivery = Pick<QuizDeliverySnapshot, "navigationMode" | "questions">;
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;
export type QuizRevisionContent = z.infer<typeof quizRevisionContentSchema>;
