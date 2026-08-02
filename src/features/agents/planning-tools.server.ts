import "server-only";

import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  parsePlanningQuestionBatch,
  planningQuestionBatchInputSchema,
  workspacePlanSchema,
} from "./planning-tools";

const planningItemPresentedSchema = z.object({ status: z.literal("presented") });

export const workspacePlanningTools = {
  ask_user: createTool({
    id: "ask_user",
    description:
      "Ask the user one to three consequential planning questions in one round. Group every currently necessary question into this single call.",
    inputSchema: planningQuestionBatchInputSchema,
    outputSchema: planningItemPresentedSchema,
    execute: async (input) => {
      const questions = parsePlanningQuestionBatch(input);
      if (!questions) {
        throw new Error("planning_questions_invalid");
      }
      return { status: "presented" as const };
    },
  }),
  submit_workspace_plan: createTool({
    id: "submit_workspace_plan",
    description:
      "Submit the complete workspace plan for user review. Call this only when the goal is clear enough to plan. The user may approve, cancel, or request revisions.",
    inputSchema: workspacePlanSchema,
    outputSchema: planningItemPresentedSchema,
    execute: async () => ({ status: "presented" as const }),
  }),
};
