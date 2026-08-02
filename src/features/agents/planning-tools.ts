import { z } from "zod";

export const PLANNING_TOOL_IDS = {
  askUser: "ask_user",
  submitPlan: "submit_workspace_plan",
} as const;

const planningQuestionSchema = z.object({
  options: z.array(z.object({ description: z.string().optional(), label: z.string() })).optional(),
  question: z.string(),
  selectionMode: z.enum(["single_select", "multi_select"]).optional(),
});

const planningQuestionBatchSchema = z.object({
  questions: z.array(planningQuestionSchema).min(1).max(3),
});

const planningQuestionInputSchema = planningQuestionSchema.extend({
  options: z
    .union([
      planningQuestionSchema.shape.options.unwrap(),
      z.string().describe("A JSON-encoded option array when the provider cannot send an array"),
    ])
    .optional(),
});

export const planningQuestionBatchInputSchema = z.object({
  questions: z.union([
    z.string().describe("A JSON-encoded planning question array"),
    z.array(planningQuestionInputSchema).min(1).max(3),
  ]),
});

export function parsePlanningQuestion(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const options = Reflect.get(input, "options");
  let normalizedOptions = options;
  if (typeof options === "string") {
    try {
      normalizedOptions = JSON.parse(options);
    } catch {
      return null;
    }
  }
  const parsed = planningQuestionSchema.safeParse({
    ...input,
    ...(normalizedOptions === undefined ? {} : { options: normalizedOptions }),
  });
  return parsed.success ? parsed.data : null;
}

export function parsePlanningQuestionBatch(input: unknown) {
  const legacyQuestion = parsePlanningQuestion(input);
  if (legacyQuestion) return { questions: [legacyQuestion] };
  if (!input || typeof input !== "object") return null;
  const questions = Reflect.get(input, "questions");
  let normalizedQuestions = questions;
  if (typeof questions === "string") {
    try {
      normalizedQuestions = JSON.parse(questions);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(normalizedQuestions)) return null;
  const normalized = normalizedQuestions.map((question) => parsePlanningQuestion(question));
  if (normalized.some((question) => question === null)) return null;
  const parsed = planningQuestionBatchSchema.safeParse({ questions: normalized });
  return parsed.success ? parsed.data : null;
}

export const workspacePlanSchema = z.object({
  sections: z.array(z.object({ body: z.string().min(1), title: z.string().min(1) })).min(1),
  summary: z.string().min(1),
  title: z.string().min(1),
});
