import "server-only";

import { z } from "zod";
import { type Database, database } from "@/database/client";
import type { Actor } from "@/features/identity/types";
import { ArtifactError } from "../errors";
import {
  getArtifactEditProposalByRun,
  markArtifactEditProposalAccepted,
} from "../proposal-service.server";
import { TeachingDocumentError } from "./errors";
import { applyTeachingDocumentRefineEdits } from "./refine";
import { getTeachingDocumentDetailForConversation, saveTeachingDocumentRevision } from "./service";

const acceptProposalInputSchema = z
  .object({
    artifactId: z.string().uuid(),
    conversationId: z.string().uuid(),
    expectedRevisionId: z.string().uuid(),
    runId: z.string().uuid(),
    workspaceId: z.string().uuid(),
  })
  .strict();

async function proposalFromStore(
  actor: Actor,
  input: z.infer<typeof acceptProposalInputSchema>,
  db: Database,
) {
  const proposal = await getArtifactEditProposalByRun(actor, input, db).catch((error) => {
    if (error instanceof ArtifactError) return null;
    throw error;
  });
  if (proposal?.proposal.kind !== "teaching_document") {
    throw new TeachingDocumentError("teaching_document_proposal_invalid");
  }
  const payload = proposal.proposal;
  if (
    payload.runId !== input.runId ||
    payload.artifactId !== input.artifactId ||
    payload.baseRevisionId !== input.expectedRevisionId
  ) {
    throw new TeachingDocumentError("teaching_document_proposal_stale");
  }
  return { ...proposal, proposal: payload };
}

export async function acceptTeachingDocumentProposal(
  actor: Actor,
  rawInput: z.infer<typeof acceptProposalInputSchema>,
  db: Database = database,
) {
  const input = acceptProposalInputSchema.parse(rawInput);
  const detailInput = {
    artifactId: input.artifactId,
    conversationId: input.conversationId,
    workspaceId: input.workspaceId,
  };
  const detail = await getTeachingDocumentDetailForConversation(actor, detailInput, db);
  if (detail.generationState !== "ready") {
    throw new TeachingDocumentError("teaching_document_not_found");
  }
  const stored = await proposalFromStore(actor, input, db);
  const proposal = stored.proposal;
  const existing = stored.acceptedRevisionId;
  if (existing) {
    if (detail.artifact.currentRevision.id !== existing) {
      throw new TeachingDocumentError("teaching_document_proposal_stale");
    }
    return { acceptedRevisionId: existing, artifact: detail.artifact };
  }
  if (
    detail.artifact.currentRevision.id !== input.expectedRevisionId ||
    detail.artifact.currentRevision.id !== proposal.baseRevisionId
  ) {
    throw new TeachingDocumentError("teaching_document_proposal_stale");
  }
  const { content } = applyTeachingDocumentRefineEdits(
    detail.artifact.currentRevision.content,
    proposal.edits,
  );
  try {
    return await db.transaction(async (tx) => {
      const artifact = await saveTeachingDocumentRevision(
        actor,
        {
          artifactId: input.artifactId,
          content,
          conversationId: input.conversationId,
          expectedRevisionId: input.expectedRevisionId,
          operationGroundingReceipt: stored.groundingReceipt,
          producingRunId: input.runId,
          workspaceId: input.workspaceId,
        },
        tx,
      );
      await markArtifactEditProposalAccepted(
        {
          artifactId: input.artifactId,
          revisionId: artifact.currentRevision.id,
          runId: input.runId,
        },
        tx,
      );
      return { acceptedRevisionId: artifact.currentRevision.id, artifact };
    });
  } catch (error) {
    const concurrent = await proposalFromStore(actor, input, db)
      .then((record) => record.acceptedRevisionId)
      .catch(() => null);
    if (concurrent) {
      const refreshed = await getTeachingDocumentDetailForConversation(actor, detailInput, db);
      if (
        refreshed.generationState === "ready" &&
        refreshed.artifact.currentRevision.id === concurrent
      ) {
        return { acceptedRevisionId: concurrent, artifact: refreshed.artifact };
      }
      throw new TeachingDocumentError("teaching_document_proposal_stale");
    }
    if (error instanceof TeachingDocumentError && error.code === "teaching_document_conflict") {
      throw new TeachingDocumentError("teaching_document_proposal_stale");
    }
    throw error;
  }
}
