import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";
import { canonicalJsonSha256 } from "@/database/canonical-json";
import { type Database, type DatabaseTransaction, database } from "@/database/client";
import { artifactEditProposals, artifactSourceBundles, artifacts } from "@/database/schema";
import { createArtifactRenderStorage } from "@/features/artifacts/render-storage.server";
import type { Actor } from "@/features/identity/types";
import { requireWorkspacePermission } from "@/features/workspaces/access.server";
import { WorkspaceError } from "@/features/workspaces/errors";
import { ArtifactError } from "./errors";
import type { ArtifactOperationGroundingReceipt } from "./grounding";
import {
  type ArtifactEditProposal,
  artifactEditProposalEnvelopeSchema,
  artifactEditProposalSchema,
} from "./proposal-contract";

type ProposalLookup = {
  artifactId: string;
  conversationId: string;
  workspaceId: string;
};

async function requireOwnedArtifact(
  actor: Actor,
  input: ProposalLookup,
  db: Database | DatabaseTransaction,
  options: { forUpdate?: boolean } = {},
) {
  try {
    await requireWorkspacePermission(actor, input.workspaceId, "artifact.private.manage", db);
  } catch (error) {
    if (error instanceof WorkspaceError) throw new ArtifactError("artifact_not_found");
    throw error;
  }
  const query = db
    .select({
      currentRevisionId: artifacts.currentRevisionId,
      id: artifacts.id,
      kind: artifacts.kind,
    })
    .from(artifacts)
    .where(
      and(
        eq(artifacts.id, input.artifactId),
        eq(artifacts.workspaceId, input.workspaceId),
        eq(artifacts.conversationId, input.conversationId),
        eq(artifacts.createdByPrincipalId, actor.principalId),
        isNull(artifacts.deletedAt),
      ),
    )
    .limit(1);
  const [artifact] = options.forUpdate
    ? await query.for("update", { of: [artifacts] })
    : await query;
  if (!artifact) throw new ArtifactError("artifact_not_found");
  return artifact;
}

export async function publishArtifactEditProposal(
  actor: Actor,
  input: ProposalLookup & {
    groundingReceipt: ArtifactOperationGroundingReceipt;
    proposal: ArtifactEditProposal;
  },
  db: Database = database,
) {
  const proposal = artifactEditProposalSchema.parse(input.proposal);
  const envelope = artifactEditProposalEnvelopeSchema.parse({
    groundingReceipt: input.groundingReceipt,
    proposal,
    version: 1,
  });
  if (proposal.artifactId !== input.artifactId) {
    throw new ArtifactError("artifact_proposal_invalid");
  }
  return db.transaction(async (tx) => {
    const artifact = await requireOwnedArtifact(actor, input, tx, { forUpdate: true });
    if (artifact.kind !== proposal.kind || artifact.currentRevisionId !== proposal.baseRevisionId) {
      throw new ArtifactError("artifact_proposal_conflict");
    }
    const [existing] = await tx
      .select({ payload: artifactEditProposals.payload })
      .from(artifactEditProposals)
      .where(
        and(
          eq(artifactEditProposals.artifactId, artifact.id),
          eq(artifactEditProposals.runId, proposal.runId),
        ),
      )
      .limit(1);
    if (existing) {
      const stored = artifactEditProposalEnvelopeSchema.parse(existing.payload);
      if (canonicalJsonSha256(stored) !== canonicalJsonSha256(envelope)) {
        throw new ArtifactError("artifact_proposal_conflict");
      }
      return stored.proposal;
    }
    await tx
      .update(artifactEditProposals)
      .set({ dismissedAt: new Date(), state: "dismissed", updatedAt: new Date() })
      .where(
        and(
          eq(artifactEditProposals.artifactId, artifact.id),
          eq(artifactEditProposals.state, "pending"),
        ),
      );
    const [inserted] = await tx
      .insert(artifactEditProposals)
      .values({
        artifactId: artifact.id,
        baseRevisionId: proposal.baseRevisionId,
        createdByPrincipalId: actor.principalId,
        kind: proposal.kind,
        payload: envelope,
        runId: proposal.runId,
      })
      .returning();
    if (!inserted) throw new ArtifactError("artifact_proposal_conflict");
    return artifactEditProposalEnvelopeSchema.parse(inserted.payload).proposal;
  });
}

export async function getCurrentArtifactEditProposal(
  actor: Actor,
  input: ProposalLookup,
  db: Database = database,
) {
  const artifact = await requireOwnedArtifact(actor, input, db);
  const [row] = await db
    .select({ payload: artifactEditProposals.payload })
    .from(artifactEditProposals)
    .where(
      and(
        eq(artifactEditProposals.artifactId, artifact.id),
        eq(artifactEditProposals.state, "pending"),
      ),
    )
    .orderBy(desc(artifactEditProposals.createdAt))
    .limit(1);
  return row ? artifactEditProposalEnvelopeSchema.parse(row.payload).proposal : null;
}

export async function getArtifactEditProposalByRun(
  actor: Actor,
  input: ProposalLookup & { runId: string },
  db: Database | DatabaseTransaction = database,
) {
  const artifact = await requireOwnedArtifact(actor, input, db);
  const [row] = await db
    .select({
      acceptedRevisionId: artifactEditProposals.acceptedRevisionId,
      payload: artifactEditProposals.payload,
      state: artifactEditProposals.state,
    })
    .from(artifactEditProposals)
    .where(
      and(
        eq(artifactEditProposals.artifactId, artifact.id),
        eq(artifactEditProposals.runId, input.runId),
      ),
    )
    .limit(1);
  if (!row || row.state === "dismissed") throw new ArtifactError("artifact_proposal_invalid");
  if (row.state !== "pending" && row.state !== "accepted") {
    throw new ArtifactError("artifact_proposal_invalid");
  }
  if (row.state === "accepted" && !row.acceptedRevisionId) {
    throw new ArtifactError("artifact_proposal_invalid");
  }
  const stored = artifactEditProposalEnvelopeSchema.parse(row.payload);
  return {
    acceptedRevisionId: row.acceptedRevisionId,
    groundingReceipt: stored.groundingReceipt,
    proposal: stored.proposal,
    state: row.state,
  };
}

export async function dismissCurrentArtifactEditProposal(
  actor: Actor,
  input: ProposalLookup & { runId: string },
  db: Database = database,
) {
  let cleanup: { key: string; versionId: string } | null = null;
  await db.transaction(async (tx) => {
    const artifact = await requireOwnedArtifact(actor, input, tx, { forUpdate: true });
    const [row] = await tx
      .select({ id: artifactEditProposals.id, payload: artifactEditProposals.payload })
      .from(artifactEditProposals)
      .where(
        and(
          eq(artifactEditProposals.artifactId, artifact.id),
          eq(artifactEditProposals.runId, input.runId),
          eq(artifactEditProposals.state, "pending"),
        ),
      )
      .limit(1)
      .for("update");
    if (!row) return;

    const proposal = artifactEditProposalEnvelopeSchema.parse(row.payload).proposal;
    if (proposal.kind === "presentation") {
      const [bundle] = await tx
        .select({
          key: artifactSourceBundles.objectKey,
          versionId: artifactSourceBundles.objectVersionId,
        })
        .from(artifactSourceBundles)
        .where(
          and(
            eq(artifactSourceBundles.id, proposal.candidateSourceBundleId),
            eq(artifactSourceBundles.state, "staged"),
          ),
        )
        .limit(1)
        .for("update");
      if (bundle) cleanup = bundle;
      await tx
        .delete(artifactSourceBundles)
        .where(
          and(
            eq(artifactSourceBundles.id, proposal.candidateSourceBundleId),
            eq(artifactSourceBundles.state, "staged"),
          ),
        );
    }
    await tx
      .update(artifactEditProposals)
      .set({ dismissedAt: new Date(), state: "dismissed", updatedAt: new Date() })
      .where(eq(artifactEditProposals.id, row.id));
  });

  if (cleanup) {
    try {
      await createArtifactRenderStorage().delete(cleanup);
    } catch {
      // Proposal dismissal remains durable even if object cleanup is delayed.
    }
  }
}

export async function markArtifactEditProposalAccepted(
  input: { artifactId: string; revisionId: string; runId: string },
  db: Database | DatabaseTransaction = database,
) {
  const [existing] = await db
    .select({
      acceptedRevisionId: artifactEditProposals.acceptedRevisionId,
      state: artifactEditProposals.state,
    })
    .from(artifactEditProposals)
    .where(
      and(
        eq(artifactEditProposals.artifactId, input.artifactId),
        eq(artifactEditProposals.runId, input.runId),
      ),
    )
    .limit(1);
  if (existing?.state === "accepted" && existing.acceptedRevisionId === input.revisionId) return;
  const [updated] = await db
    .update(artifactEditProposals)
    .set({
      acceptedAt: new Date(),
      acceptedRevisionId: input.revisionId,
      state: "accepted",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(artifactEditProposals.artifactId, input.artifactId),
        eq(artifactEditProposals.runId, input.runId),
        eq(artifactEditProposals.state, "pending"),
      ),
    )
    .returning({ id: artifactEditProposals.id });
  if (!updated) throw new ArtifactError("artifact_proposal_conflict");
}
