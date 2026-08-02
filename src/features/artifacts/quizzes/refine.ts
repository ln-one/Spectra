import { z } from "zod";
import type { QuizRevisionContent } from "./contract";
import { applyQuizEdits, type QuizEdit } from "./editor";

const questionIdSchema = z.string().uuid();

export const quizFocusSchema = z
  .object({
    kind: z.literal("quiz_questions"),
    questionIds: z.array(questionIdSchema).min(1).max(20),
    revisionId: z.string().uuid(),
  })
  .strict()
  .superRefine((focus, context) => {
    if (new Set(focus.questionIds).size !== focus.questionIds.length) {
      context.addIssue({ code: "custom", message: "Focused question IDs must be unique" });
    }
  });

export type QuizFocus = z.infer<typeof quizFocusSchema>;

export const resolvedQuizFocusSchema = quizFocusSchema
  .safeExtend({ contextMarkdown: z.string().trim().min(1).max(100_000) })
  .strict();
export type ResolvedQuizFocus = z.infer<typeof resolvedQuizFocusSchema>;

const questionDraftBase = {
  difficulty: z.enum(["easy", "medium", "hard"]),
  explanationMarkdown: z.string().trim().min(1).max(20_000),
  points: z.number().int().min(1).max(100),
  promptMarkdown: z.string().trim().min(1).max(20_000),
};

const quizQuestionDraftSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...questionDraftBase,
      correctOptionIndex: z.number().int().min(0).max(5),
      options: z.array(z.string().trim().min(1).max(500)).min(2).max(6),
      type: z.literal("single_choice"),
    })
    .strict()
    .superRefine((question, context) => {
      if (question.correctOptionIndex >= question.options.length) {
        context.addIssue({ code: "custom", message: "Answer index must reference an option" });
      }
    }),
  z
    .object({
      ...questionDraftBase,
      correctOptionIndexes: z.array(z.number().int().min(0).max(5)).min(1).max(5),
      options: z.array(z.string().trim().min(1).max(500)).min(2).max(6),
      type: z.literal("multiple_choice"),
    })
    .strict()
    .superRefine((question, context) => {
      const correct = new Set(question.correctOptionIndexes);
      if (
        correct.size !== question.correctOptionIndexes.length ||
        question.correctOptionIndexes.some((index) => index >= question.options.length) ||
        correct.size >= question.options.length
      ) {
        context.addIssue({ code: "custom", message: "Multiple-choice answers are invalid" });
      }
    }),
  z
    .object({ ...questionDraftBase, correctAnswer: z.boolean(), type: z.literal("true_false") })
    .strict(),
]);

const quizRefineEditSchema = z.discriminatedUnion("type", [
  z
    .object({
      position: z.number().int().min(0).max(49).optional(),
      question: quizQuestionDraftSchema,
      type: z.literal("add_question"),
    })
    .strict(),
  z.object({ questionId: questionIdSchema, type: z.literal("copy_question") }).strict(),
  z.object({ questionId: questionIdSchema, type: z.literal("delete_question") }).strict(),
  z
    .object({
      direction: z.enum(["up", "down"]),
      questionId: questionIdSchema,
      type: z.literal("move_question"),
    })
    .strict(),
  z
    .object({
      question: quizQuestionDraftSchema,
      questionId: questionIdSchema,
      type: z.literal("update_question"),
    })
    .strict(),
  z
    .object({
      descriptionMarkdown: z.string().trim().max(20_000).optional(),
      feedbackMode: z.enum(["after_submission", "immediate"]).optional(),
      navigationMode: z.enum(["free", "sequential"]).optional(),
      title: z.string().trim().min(1).max(200).optional(),
      type: z.literal("update_settings"),
    })
    .strict()
    .refine(
      (edit) =>
        edit.descriptionMarkdown !== undefined ||
        edit.feedbackMode !== undefined ||
        edit.navigationMode !== undefined ||
        edit.title !== undefined,
      { message: "Provide at least one Quiz setting" },
    ),
]);

export const quizRefineEditsSchema = z.array(quizRefineEditSchema).min(1).max(50);

function questionMarkdown(content: QuizRevisionContent, questionId: string) {
  const question = content.questions.find((candidate) => candidate.questionId === questionId);
  if (!question) return null;
  const lines = [
    `[question:${question.questionId}]`,
    question.promptMarkdown,
    `Type: ${question.type}; difficulty: ${question.difficulty}; points: ${question.points}`,
  ];
  if (question.type === "true_false") lines.push(`Correct answer: ${question.correctAnswer}`);
  else {
    lines.push(
      ...question.options.map(
        (option, index) => `Option ${index} [option:${option.optionId}]: ${option.text}`,
      ),
    );
    lines.push(
      question.type === "single_choice"
        ? `Correct option index: ${question.options.findIndex(
            (option) => option.optionId === question.correctOptionId,
          )}`
        : `Correct option indexes: ${question.correctOptionIds
            .map((correctId) =>
              question.options.findIndex((option) => option.optionId === correctId),
            )
            .join(", ")}`,
    );
  }
  lines.push(`Explanation: ${question.explanationMarkdown}`);
  return lines.join("\n");
}

export function validateQuizFocus(content: QuizRevisionContent, focus: QuizFocus) {
  const parsed = quizFocusSchema.parse(focus);
  const contexts = parsed.questionIds.map((id) => questionMarkdown(content, id));
  if (contexts.some((context) => context === null)) return null;
  return resolvedQuizFocusSchema.parse({ ...parsed, contextMarkdown: contexts.join("\n\n") });
}

export type QuizProposalScopeReview =
  | { status: "allowed" }
  | { allowedQuestionIds: string[]; status: "outside_scope" };

export function reviewQuizProposalScope(
  focus: ResolvedQuizFocus | null | undefined,
  edits: readonly QuizEdit[],
): QuizProposalScopeReview {
  if (!focus) return { status: "allowed" };
  const allowed = new Set(focus.questionIds);
  const isAllowed = edits.every(
    (edit) =>
      edit.type !== "add_question" &&
      edit.type !== "update_settings" &&
      allowed.has(edit.questionId),
  );
  return isAllowed
    ? { status: "allowed" }
    : { allowedQuestionIds: [...focus.questionIds], status: "outside_scope" };
}

export function applyQuizRefineEdits(
  content: QuizRevisionContent,
  edits: readonly QuizEdit[],
  idFactory?: () => string,
) {
  return applyQuizEdits(content, edits, idFactory);
}
