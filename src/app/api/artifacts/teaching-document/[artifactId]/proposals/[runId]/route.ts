import { z } from "zod";
import { createArtifactProposalAcceptanceRoute } from "@/app/api/artifacts/proposal-acceptance-route";
import { TeachingDocumentError } from "@/features/artifacts/documents/errors";
import { acceptTeachingDocumentProposal } from "@/features/artifacts/documents/refine-service.server";

const bodySchema = z.object({ expectedRevisionId: z.string().uuid() }).strict();

export const POST = createArtifactProposalAcceptanceRoute({
  accept: acceptTeachingDocumentProposal,
  bodySchema,
  conflictCodes: ["teaching_document_proposal_stale", "teaching_document_conflict"],
  domainErrorCode: (error) => (error instanceof TeachingDocumentError ? error.code : null),
  invalidCodes: ["teaching_document_proposal_invalid", "teaching_document_invalid"],
  invalidRequestCode: "teaching_document_invalid",
  unavailableCode: "teaching_document_unavailable",
});
