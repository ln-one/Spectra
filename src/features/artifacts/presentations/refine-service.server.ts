import "server-only";

import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { type Database, database } from "@/database/client";
import { artifactSourceBundles } from "@/database/schema";
import {
  type ArtifactRenderStorage,
  createArtifactRenderStorage,
} from "@/features/artifacts/render-storage.server";
import type { Actor } from "@/features/identity/types";
import { ArtifactError } from "../errors";
import { appendArtifactRevision } from "../lifecycle.server";
import {
  getArtifactEditProposalByRun,
  markArtifactEditProposalAccepted,
} from "../proposal-service.server";
import { publishArtifactSourceBundleById } from "../source-bundles.server";
import { presentationRevisionContentSchema } from "./contract";
import { PresentationError } from "./errors";
import {
  extractPresentationPptdAssets,
  extractPresentationPptdSource,
  readPresentationSourceArchive,
  runPresentationPipeline,
} from "./pipeline.server";
import { getPresentationDetailForConversation } from "./service";

const acceptInputSchema = z
  .object({
    artifactId: z.string().uuid(),
    conversationId: z.string().uuid(),
    expectedRevisionId: z.string().uuid(),
    runId: z.string().uuid(),
    workspaceId: z.string().uuid(),
  })
  .strict();

type ProposalInput = z.infer<typeof acceptInputSchema>;

function sha256(body: Uint8Array) {
  return createHash("sha256").update(body).digest("hex");
}

async function loadCandidate(
  actor: Actor,
  input: ProposalInput,
  db: Database,
  storage: ArtifactRenderStorage,
) {
  const detailInput = {
    artifactId: input.artifactId,
    conversationId: input.conversationId,
    workspaceId: input.workspaceId,
  };
  const detail = await getPresentationDetailForConversation(actor, detailInput, db);
  if (detail.generationState !== "ready") throw new PresentationError("presentation_not_found");
  const proposalRecord = await getArtifactEditProposalByRun(
    actor,
    { ...detailInput, runId: input.runId },
    db,
  ).catch((error) => {
    if (error instanceof ArtifactError) return null;
    throw error;
  });
  if (proposalRecord?.proposal.kind !== "presentation") {
    throw new PresentationError("presentation_refinement_invalid");
  }
  const proposal = proposalRecord.proposal;
  if (
    proposal.artifactId !== input.artifactId ||
    proposal.runId !== input.runId ||
    proposal.baseRevisionId !== input.expectedRevisionId
  ) {
    throw new PresentationError("presentation_refinement_stale");
  }
  const [bundle] = await db
    .select()
    .from(artifactSourceBundles)
    .where(
      and(
        eq(artifactSourceBundles.id, proposal.candidateSourceBundleId),
        eq(artifactSourceBundles.artifactId, input.artifactId),
      ),
    )
    .limit(1);
  if (
    !bundle ||
    bundle.producingRunId !== input.runId ||
    !bundle.objectKey ||
    !bundle.objectVersionId ||
    (bundle.state !== "staged" && bundle.state !== "published")
  ) {
    throw new PresentationError("presentation_refinement_invalid");
  }
  const object = await storage.get({ key: bundle.objectKey, versionId: bundle.objectVersionId });
  if (
    object.contentType !== bundle.mediaType ||
    object.body.byteLength !== bundle.sizeBytes ||
    sha256(object.body) !== bundle.sha256
  ) {
    throw new Error("presentation_source_object_conflict");
  }
  const pipeline = await runPresentationPipeline({
    archive: object.body,
    summary: proposal.summary,
  });
  if (sha256(pipeline.sourceArchive) !== bundle.sha256) {
    throw new Error("presentation_source_bundle_conflict");
  }
  return { bundle, detail, object, pipeline, proposal, proposalRecord };
}

export async function getPresentationProposalSource(
  actor: Actor,
  rawInput: ProposalInput,
  options: { db?: Database; storage?: ArtifactRenderStorage } = {},
) {
  const input = acceptInputSchema.parse(rawInput);
  const loaded = await loadCandidate(
    actor,
    input,
    options.db ?? database,
    options.storage ?? createArtifactRenderStorage(),
  );
  return extractPresentationPptdSource(
    await readPresentationSourceArchive(loaded.pipeline.sourceArchive),
  );
}

export async function getPresentationProposalAssets(
  actor: Actor,
  rawInput: ProposalInput & { paths: string[] },
  options: { db?: Database; storage?: ArtifactRenderStorage } = {},
) {
  const input = acceptInputSchema
    .extend({ paths: z.array(z.string().trim().min(1).max(500)).max(200) })
    .parse(rawInput);
  const loaded = await loadCandidate(
    actor,
    input,
    options.db ?? database,
    options.storage ?? createArtifactRenderStorage(),
  );
  return extractPresentationPptdAssets(
    await readPresentationSourceArchive(loaded.pipeline.sourceArchive),
    input.paths,
  );
}

export async function acceptPresentationProposal(
  actor: Actor,
  rawInput: z.infer<typeof acceptInputSchema>,
  options: { db?: Database; storage?: ArtifactRenderStorage } = {},
) {
  const db = options.db ?? database;
  const storage = options.storage ?? createArtifactRenderStorage();
  const input = acceptInputSchema.parse(rawInput);
  const detailInput = {
    artifactId: input.artifactId,
    conversationId: input.conversationId,
    workspaceId: input.workspaceId,
  };
  const detail = await getPresentationDetailForConversation(actor, detailInput, db);
  if (detail.generationState !== "ready") throw new PresentationError("presentation_not_found");
  const proposalRecord = await getArtifactEditProposalByRun(
    actor,
    { ...detailInput, runId: input.runId },
    db,
  ).catch((error) => {
    if (error instanceof ArtifactError) return null;
    throw error;
  });
  if (proposalRecord?.proposal.kind !== "presentation") {
    throw new PresentationError("presentation_refinement_invalid");
  }
  if (proposalRecord.acceptedRevisionId) {
    if (detail.artifact.currentRevision.id !== proposalRecord.acceptedRevisionId) {
      throw new PresentationError("presentation_refinement_stale");
    }
    return { acceptedRevisionId: proposalRecord.acceptedRevisionId, artifact: detail.artifact };
  }
  if (detail.artifact.currentRevision.id !== input.expectedRevisionId) {
    throw new PresentationError("presentation_refinement_stale");
  }
  const loaded = await loadCandidate(actor, input, db, storage);
  try {
    return await db.transaction(async (tx) => {
      const result = await appendArtifactRevision({
        actorId: actor.principalId,
        artifactId: input.artifactId,
        content: presentationRevisionContentSchema.parse(loaded.pipeline.content),
        conversationId: input.conversationId,
        db: tx,
        expectedRevisionId: input.expectedRevisionId,
        kind: "presentation",
        operationGroundingReceipt: proposalRecord.groundingReceipt,
        producingRunId: input.runId,
        publishResources: async (transaction, { revision }) => {
          await publishArtifactSourceBundleById(transaction, {
            artifactId: input.artifactId,
            bundleId: loaded.bundle.id,
            revisionId: revision.id,
          });
        },
        title: loaded.pipeline.content.title,
        workspaceId: input.workspaceId,
      });
      await markArtifactEditProposalAccepted(
        {
          artifactId: input.artifactId,
          revisionId: result.revision.id,
          runId: input.runId,
        },
        tx,
      );
      return { acceptedRevisionId: result.revision.id, artifact: result.artifact };
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
      const refreshed = await getPresentationDetailForConversation(actor, detailInput, db);
      if (
        refreshed.generationState === "ready" &&
        refreshed.artifact.currentRevision.id === concurrent
      ) {
        return { acceptedRevisionId: concurrent, artifact: refreshed.artifact };
      }
    }
    throw error instanceof PresentationError
      ? error
      : new PresentationError("presentation_refinement_stale", { cause: error });
  }
}
