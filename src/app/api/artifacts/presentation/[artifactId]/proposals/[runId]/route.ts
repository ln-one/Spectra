import { z } from "zod";
import { createArtifactProposalAcceptanceRoute } from "@/app/api/artifacts/proposal-acceptance-route";
import { PresentationError } from "@/features/artifacts/presentations/errors";
import { acceptPresentationProposal } from "@/features/artifacts/presentations/refine-service.server";

const bodySchema = z.object({ expectedRevisionId: z.string().uuid() }).strict();

export const POST = createArtifactProposalAcceptanceRoute({
  accept: acceptPresentationProposal,
  bodySchema,
  conflictCodes: ["presentation_refinement_stale"],
  domainErrorCode: (error) => (error instanceof PresentationError ? error.code : null),
  invalidCodes: ["presentation_refinement_invalid"],
  invalidRequestCode: "presentation_refinement_invalid",
  unavailableCode: "presentation_refinement_unavailable",
});
