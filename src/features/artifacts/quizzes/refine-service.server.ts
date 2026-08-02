import "server-only";

import { z } from "zod";
import { type Database, database } from "@/database/client";
import type { Actor } from "@/features/identity/types";
import { ArtifactError } from "../errors";
import {
  getArtifactEditProposalByRun,
  markArtifactEditProposalAccepted,
} from "../proposal-service.server";
import { QuizError } from "./errors";
import {
  getQuizDetailForConversation,
  moveQuizAttemptToRevision,
  saveQuizRevision,
} from "./service";

const acceptInputSchema = z
  .object({
    artifactId: z.string().uuid(),
    attemptId: z.string().uuid().nullable().optional(),
    conversationId: z.string().uuid(),
    expectedRevisionId: z.string().uuid(),
    runId: z.string().uuid(),
    workspaceId: z.string().uuid(),
  })
  .strict();

export async function acceptQuizProposal(
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
  const detail = await getQuizDetailForConversation(actor, detailInput, db);
  if (detail.generationState !== "ready") throw new QuizError("quiz_not_found");
  const proposal = await getArtifactEditProposalByRun(
    actor,
    { ...detailInput, runId: input.runId },
    db,
  ).catch((error) => {
    if (error instanceof ArtifactError) return null;
    throw error;
  });
  if (proposal?.proposal.kind !== "quiz") throw new QuizError("quiz_proposal_invalid");
  const payload = proposal.proposal;
  if (
    payload.runId !== input.runId ||
    payload.artifactId !== input.artifactId ||
    payload.baseRevisionId !== input.expectedRevisionId
  ) {
    throw new QuizError("quiz_proposal_stale");
  }
  const existing = proposal.acceptedRevisionId;
  if (existing) {
    if (detail.artifact.currentRevision.id !== existing) {
      throw new QuizError("quiz_proposal_stale");
    }
    const attempt = input.attemptId
      ? await moveQuizAttemptToRevision(
          actor,
          {
            artifactId: input.artifactId,
            attemptId: input.attemptId,
            expectedRevisionId: input.expectedRevisionId,
            targetRevisionId: existing,
            workspaceId: input.workspaceId,
          },
          db,
        )
      : null;
    return { acceptedRevisionId: existing, artifact: detail.artifact, attempt };
  }
  if (detail.artifact.currentRevision.id !== input.expectedRevisionId) {
    throw new QuizError("quiz_proposal_stale");
  }
  try {
    return await db.transaction(async (tx) => {
      const artifact = await saveQuizRevision(
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
      const attempt = input.attemptId
        ? await moveQuizAttemptToRevision(
            actor,
            {
              artifactId: input.artifactId,
              attemptId: input.attemptId,
              expectedRevisionId: input.expectedRevisionId,
              targetRevisionId: artifact.currentRevision.id,
              workspaceId: input.workspaceId,
            },
            tx,
          )
        : null;
      await markArtifactEditProposalAccepted(
        {
          artifactId: input.artifactId,
          revisionId: artifact.currentRevision.id,
          runId: input.runId,
        },
        tx,
      );
      return { acceptedRevisionId: artifact.currentRevision.id, artifact, attempt };
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
      const refreshed = await getQuizDetailForConversation(actor, detailInput, db);
      if (
        refreshed.generationState === "ready" &&
        refreshed.artifact.currentRevision.id === concurrent
      )
        return { acceptedRevisionId: concurrent, artifact: refreshed.artifact, attempt: null };
      throw new QuizError("quiz_proposal_stale");
    }
    if (error instanceof QuizError && error.code === "quiz_conflict")
      throw new QuizError("quiz_proposal_stale");
    throw error;
  }
}
