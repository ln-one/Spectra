import { z } from "zod";
import { createArtifactProposalAcceptanceRoute } from "@/app/api/artifacts/proposal-acceptance-route";
import { MindMapError } from "@/features/artifacts/mind-maps/errors";
import { acceptMindMapProposal } from "@/features/artifacts/mind-maps/refine-service.server";

const bodySchema = z.object({ expectedRevisionId: z.string().uuid() }).strict();

export const POST = createArtifactProposalAcceptanceRoute({
  accept: acceptMindMapProposal,
  bodySchema,
  conflictCodes: ["mind_map_proposal_stale", "mind_map_conflict"],
  domainErrorCode: (error) => (error instanceof MindMapError ? error.code : null),
  invalidCodes: ["mind_map_proposal_invalid"],
  invalidRequestCode: "mind_map_proposal_invalid",
  unavailableCode: "mind_map_unavailable",
});
