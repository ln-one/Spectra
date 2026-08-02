import { z } from "zod";
import { createArtifactProposalAcceptanceRoute } from "@/app/api/artifacts/proposal-acceptance-route";
import { QuizError } from "@/features/artifacts/quizzes/errors";
import { acceptQuizProposal } from "@/features/artifacts/quizzes/refine-service.server";

const bodySchema = z
  .object({
    attemptId: z.string().uuid().nullable().optional(),
    expectedRevisionId: z.string().uuid(),
  })
  .strict();

export const POST = createArtifactProposalAcceptanceRoute({
  accept: acceptQuizProposal,
  bodySchema,
  conflictCodes: ["quiz_proposal_stale", "quiz_conflict"],
  domainErrorCode: (error) => (error instanceof QuizError ? error.code : null),
  invalidCodes: ["quiz_proposal_invalid"],
  invalidRequestCode: "quiz_proposal_invalid",
  unavailableCode: "quiz_unavailable",
});
