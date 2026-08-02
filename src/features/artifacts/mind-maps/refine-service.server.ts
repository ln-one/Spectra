import "server-only";

import { z } from "zod";
import { type Database, database } from "@/database/client";
import type { Actor } from "@/features/identity/types";
import { ArtifactError } from "../errors";
import {
  getArtifactEditProposalByRun,
  markArtifactEditProposalAccepted,
} from "../proposal-service.server";
import { MindMapError } from "./errors";
import { getMindMapDetailForConversation, saveMindMapRevision } from "./service";

const acceptInputSchema = z
  .object({
    artifactId: z.string().uuid(),
    conversationId: z.string().uuid(),
    expectedRevisionId: z.string().uuid(),
    runId: z.string().uuid(),
    workspaceId: z.string().uuid(),
  })
  .strict();

export async function acceptMindMapProposal(
  actor: Actor,
  rawInput: z.infer<typeof acceptInputSchema>,
  db: Database = database,
) {
  const input = acceptInputSchema.parse(rawInput);
  const detailInput = {
    artifactId: input.artifactId,
    conversationId: input.conversationId,
    workspaceId: input.workspaceId,
  };
  const detail = await getMindMapDetailForConversation(actor, detailInput, db);
  if (detail.generationState !== "ready") throw new MindMapError("mind_map_not_found");
  const proposal = await getArtifactEditProposalByRun(
    actor,
    { ...detailInput, runId: input.runId },
    db,
  ).catch((error) => {
    if (error instanceof ArtifactError) return null;
    throw error;
  });
  if (proposal?.proposal.kind !== "mind_map") {
    throw new MindMapError("mind_map_proposal_invalid");
  }
  const payload = proposal.proposal;
  if (
    payload.runId !== input.runId ||
    payload.artifactId !== input.artifactId ||
    payload.baseRevisionId !== input.expectedRevisionId
  ) {
    throw new MindMapError("mind_map_proposal_stale");
  }
  const existing = proposal.acceptedRevisionId;
  if (existing) {
    if (detail.artifact.currentRevision.id !== existing) {
      throw new MindMapError("mind_map_proposal_stale");
    }
    return { acceptedRevisionId: existing, artifact: detail.artifact };
  }
  if (detail.artifact.currentRevision.id !== input.expectedRevisionId) {
    throw new MindMapError("mind_map_proposal_stale");
  }
  try {
    return await db.transaction(async (tx) => {
      const artifact = await saveMindMapRevision(
        actor,
        {
          ...detailInput,
          content: payload.content,
          expectedRevisionId: input.expectedRevisionId,
          operationGroundingReceipt: proposal.groundingReceipt,
          producingRunId: input.runId,
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
    const concurrent = await getArtifactEditProposalByRun(
      actor,
      { ...detailInput, runId: input.runId },
      db,
    )
      .then((record) => record.acceptedRevisionId)
      .catch(() => null);
    if (concurrent) {
      const refreshed = await getMindMapDetailForConversation(actor, detailInput, db);
      if (
        refreshed.generationState === "ready" &&
        refreshed.artifact.currentRevision.id === concurrent
      )
        return { acceptedRevisionId: concurrent, artifact: refreshed.artifact };
      throw new MindMapError("mind_map_proposal_stale");
    }
    if (error instanceof MindMapError && error.code === "mind_map_conflict")
      throw new MindMapError("mind_map_proposal_stale");
    throw error;
  }
}
