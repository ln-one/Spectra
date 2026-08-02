import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  applyQuestionEdits,
  cloneQuestionWithOptions,
  projectQuestionOptions,
} from "../question-editor";
import type { FlapRevivalGameRevisionContent, GameQuestion } from "./contract";
import { flapRevivalGameRevisionContentSchema } from "./contract";

const gameQuestionDraftBase = {
  difficulty: z.enum(["easy", "medium", "hard"]),
  explanationMarkdown: z.string().trim().min(1).max(20_000),
  points: z.literal(1),
  promptMarkdown: z.string().trim().min(1).max(20_000),
};

const gameQuestionDraftSchema = z.discriminatedUnion("type", [
  z
    .object({
      ...gameQuestionDraftBase,
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
    .object({ ...gameQuestionDraftBase, correctAnswer: z.boolean(), type: z.literal("true_false") })
    .strict(),
]);

const gameRefineEditSchema = z.discriminatedUnion("type", [
  z
    .object({
      position: z.number().int().min(0).optional(),
      question: gameQuestionDraftSchema,
      type: z.literal("add_question"),
    })
    .strict(),
  z.object({ questionId: z.string().uuid(), type: z.literal("copy_question") }).strict(),
  z.object({ questionId: z.string().uuid(), type: z.literal("delete_question") }).strict(),
  z
    .object({
      direction: z.enum(["up", "down"]),
      questionId: z.string().uuid(),
      type: z.literal("move_question"),
    })
    .strict(),
  z
    .object({
      question: gameQuestionDraftSchema,
      questionId: z.string().uuid(),
      type: z.literal("update_question"),
    })
    .strict(),
]);

export const gameRefineEditsSchema = z.array(gameRefineEditSchema).min(1).max(50);
export type GameEdit = z.infer<typeof gameRefineEditSchema>;
type GameQuestionDraft = z.infer<typeof gameQuestionDraftSchema>;

function projectGameQuestion(
  draft: GameQuestionDraft,
  questionId: string,
  previous: GameQuestion | undefined,
  idFactory: () => string,
): GameQuestion {
  const base = {
    difficulty: draft.difficulty,
    explanationMarkdown: draft.explanationMarkdown,
    points: 1 as const,
    promptMarkdown: draft.promptMarkdown,
    questionId,
  };
  if (draft.type === "true_false") {
    return { ...base, correctAnswer: draft.correctAnswer, type: draft.type };
  }
  const oldOptions = previous?.type === "true_false" ? [] : (previous?.options ?? []);
  const options = projectQuestionOptions(draft.options, oldOptions, idFactory);
  const correctOptionId = options[draft.correctOptionIndex]?.optionId;
  if (!correctOptionId) throw new Error("game_edit_invalid_answer");
  return { ...base, correctOptionId, options, type: draft.type };
}

export function applyGameRefineEdits(
  content: FlapRevivalGameRevisionContent,
  edits: readonly GameEdit[],
  idFactory: () => string = randomUUID,
) {
  const next = structuredClone(content);
  for (const edit of edits) {
    next.questions = applyQuestionEdits(next.questions, [edit], {
      cloneQuestion: cloneQuestionWithOptions,
      idFactory,
      minQuestions: 6,
      minQuestionsError: "game_requires_question_pool",
      projectQuestion: projectGameQuestion,
      questionNotFoundError: "game_question_not_found",
    });
  }
  return flapRevivalGameRevisionContentSchema.parse(next);
}
