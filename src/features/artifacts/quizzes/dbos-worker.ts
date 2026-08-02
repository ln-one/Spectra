import "server-only";

import type { Pool } from "pg";
import type { Database } from "@/database/client";
import { registerStructuredArtifactDbosWorkflow } from "../structured-generation-dbos.server";
import { quizGenerationProfile } from "./config";
import { QUIZ_DBOS_WORKFLOW } from "./dbos";
import { generateQuiz, type QuizGenerator } from "./generation";
import {
  claimQuizGeneration,
  completeQuizGeneration,
  failQuizGeneration,
  finalizeQuizGeneration,
  getQuizGenerationInputById,
} from "./service";

const QUIZ_GENERATION_FAILURE = "quiz_generation_failed";

export function registerQuizDbosWorkflow(input: {
  db: Database;
  generate?: QuizGenerator;
  pool: Pool;
}) {
  return registerStructuredArtifactDbosWorkflow({
    claim: claimQuizGeneration,
    complete: completeQuizGeneration,
    dataSourceName: "spectra-quiz-product",
    db: input.db,
    fail: failQuizGeneration,
    failureCode: () => QUIZ_GENERATION_FAILURE,
    finalizeState: finalizeQuizGeneration,
    generate: input.generate ?? generateQuiz,
    kind: "quiz",
    load: getQuizGenerationInputById,
    modelId: quizGenerationProfile.modelId,
    names: {
      fail: "failQuizGeneration",
      finalize: "finalizeQuizGeneration",
      generate: "generateQuizContent",
      load: "loadQuizGeneration",
      workflow: QUIZ_DBOS_WORKFLOW,
    },
    pool: input.pool,
  });
}
