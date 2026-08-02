import "server-only";

import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, isNull, lte, ne } from "drizzle-orm";
import { z } from "zod";
import { canonicalJsonSha256 } from "@/database/canonical-json";
import { type Database, type DatabaseTransaction, database } from "@/database/client";
import {
  artifactEditProposals,
  artifactGenerationAttempts,
  artifactProviderAttempts,
  artifactRevisions,
  artifactSources,
  artifacts,
  sources,
} from "@/database/schema";
import { webLogger } from "@/observability/server";
import { transitionArtifactGenerationAttempt } from "./attempt-state";
import { ArtifactError } from "./errors";
import { transitionArtifactGeneration } from "./generation-state";
import {
  type ArtifactGroundingReceipt,
  type ArtifactOperationGroundingReceipt,
  artifactGroundingBundleSchema,
  artifactGroundingReceiptForOperation,
  artifactRequestIdentityFromMetadata,
  emptyArtifactGroundingBundle,
  generationMetadataWithArtifactGrounding,
  operationGroundingReceiptFromBundle,
  readArtifactGroundingReceipt,
} from "./grounding";
import type { TaskAgentAttemptPhase } from "./task-agent/attempt";
import {
  type ArtifactGenerationState,
  type ArtifactKind,
  artifactGenerationStateSchema,
} from "./types";

export type ArtifactCleanupQueue = {
  enqueue(transaction: DatabaseTransaction, artifactId: string): Promise<void>;
};

const artifactIdSchema = z.string().uuid();
type ActiveTaskAgentAttemptPhase = Extract<
  TaskAgentAttemptPhase,
  "provisioning" | "authoring" | "rendering" | "publishing"
>;

function phaseTimestamp(phase: ActiveTaskAgentAttemptPhase, now: Date) {
  if (phase === "provisioning") return { provisioningStartedAt: now };
  if (phase === "authoring") return { authoringStartedAt: now };
  if (phase === "rendering") return { renderingStartedAt: now };
  return { publishingStartedAt: now };
}

function groundingBundleFromGenerationRequest(generationRequest: unknown) {
  if (!generationRequest || typeof generationRequest !== "object") {
    return emptyArtifactGroundingBundle();
  }
  if (!Object.hasOwn(generationRequest, "grounding")) {
    return emptyArtifactGroundingBundle();
  }
  return artifactGroundingBundleSchema.parse(Reflect.get(generationRequest, "grounding"));
}

function parentGroundingReceipt(input: {
  artifactId: string;
  generationMetadata: unknown;
  revisionId: string;
}): ArtifactGroundingReceipt | null {
  const parsed = readArtifactGroundingReceipt(input.generationMetadata);
  if (parsed.status === "invalid") {
    webLogger.error(
      {
        artifactId: input.artifactId,
        event: "artifact.grounding_receipt.invalid",
        revisionId: input.revisionId,
      },
      "Artifact grounding receipt metadata is invalid",
    );
  }
  return parsed.receipt;
}

export async function startArtifactGeneration<Job>(input: {
  actorId: string;
  conversationId: string;
  createJob: (artifactId: string, generationAttemptId: string) => Job;
  db?: Database;
  enqueue: (transaction: DatabaseTransaction, job: Job) => Promise<void>;
  errorLabel: string;
  executorKind?: "deterministic" | "model" | "task_agent";
  generationRequest?: unknown;
  kind: ArtifactKind;
  rootRunId?: string | null;
  sourcePlanItemId?: string | null;
  sourceUserMessageId: string;
  title: string;
  workspaceId: string;
}) {
  const db = input.db ?? database;
  return db.transaction(async (tx) => {
    const [artifact] = await tx
      .insert(artifacts)
      .values({
        conversationId: input.conversationId,
        createdByPrincipalId: input.actorId,
        generationState: "queued",
        ...(input.generationRequest !== undefined
          ? { generationRequest: input.generationRequest }
          : {}),
        kind: input.kind,
        rootRunId: input.rootRunId ?? null,
        sourcePlanItemId: input.sourcePlanItemId ?? null,
        sourceUserMessageId: input.sourceUserMessageId,
        title: input.title,
        workspaceId: input.workspaceId,
      })
      .onConflictDoNothing()
      .returning();
    if (!artifact) {
      const sourceIdentity = input.sourcePlanItemId
        ? eq(artifacts.sourcePlanItemId, input.sourcePlanItemId)
        : and(eq(artifacts.kind, input.kind), isNull(artifacts.sourcePlanItemId));
      const [existing] = await tx
        .select({ artifact: artifacts, revision: artifactRevisions })
        .from(artifacts)
        .leftJoin(
          artifactRevisions,
          and(
            eq(artifacts.currentRevisionId, artifactRevisions.id),
            eq(artifactRevisions.artifactId, artifacts.id),
          ),
        )
        .where(
          and(
            eq(artifacts.workspaceId, input.workspaceId),
            eq(artifacts.conversationId, input.conversationId),
            eq(artifacts.sourceUserMessageId, input.sourceUserMessageId),
            sourceIdentity,
            isNull(artifacts.deletedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new ArtifactError("artifact_creation_conflict");
      if (input.generationRequest !== undefined) {
        const incomingIdentity = canonicalJsonSha256(input.generationRequest);
        const existingIdentity =
          existing.artifact.generationRequest !== null
            ? canonicalJsonSha256(existing.artifact.generationRequest)
            : artifactRequestIdentityFromMetadata(existing.revision?.generationMetadata);
        if (existingIdentity && existingIdentity !== incomingIdentity) {
          throw new ArtifactError("artifact_creation_conflict");
        }
      }
      return existing;
    }
    const generationAttemptId = randomUUID();
    const [generationAttempt] = await tx
      .insert(artifactGenerationAttempts)
      .values({
        artifactId: artifact.id,
        executorKind: input.executorKind ?? "model",
        id: generationAttemptId,
        ordinal: 1,
      })
      .returning();
    if (!generationAttempt) throw new Error(`${input.errorLabel} attempt was not created`);
    const [queuedArtifact] = await tx
      .update(artifacts)
      .set({ generationAttemptId, updatedAt: new Date() })
      .where(eq(artifacts.id, artifact.id))
      .returning();
    if (!queuedArtifact) throw new Error(`${input.errorLabel} attempt was not attached`);
    await input.enqueue(tx, input.createJob(artifact.id, generationAttemptId));
    return { artifact: queuedArtifact, revision: null };
  });
}

export async function retryArtifactGeneration<Job>(input: {
  artifactId: string;
  createJob: (artifactId: string, generationAttemptId: string) => Job;
  db?: Database;
  enqueue: (transaction: DatabaseTransaction, job: Job) => Promise<void>;
  errorLabel: string;
  executorKind?: "deterministic" | "model" | "task_agent";
  kind: ArtifactKind;
}) {
  const db = input.db ?? database;
  return db.transaction(async (tx) => {
    const [artifact] = await tx
      .select()
      .from(artifacts)
      .where(
        and(
          eq(artifacts.id, input.artifactId),
          eq(artifacts.kind, input.kind),
          eq(artifacts.generationState, "failed"),
          isNull(artifacts.deletedAt),
        ),
      )
      .limit(1)
      .for("update");
    if (!artifact) throw new Error(`${input.errorLabel} generation is not retryable`);
    const [latest] = await tx
      .select({ ordinal: artifactGenerationAttempts.ordinal })
      .from(artifactGenerationAttempts)
      .where(eq(artifactGenerationAttempts.artifactId, artifact.id))
      .orderBy(desc(artifactGenerationAttempts.ordinal))
      .limit(1);
    const generationAttemptId = randomUUID();
    await tx.insert(artifactGenerationAttempts).values({
      artifactId: artifact.id,
      executorKind: input.executorKind ?? "model",
      id: generationAttemptId,
      ordinal: (latest?.ordinal ?? 0) + 1,
    });
    const generationState = transitionArtifactGeneration("failed", "queued");
    const [updated] = await tx
      .update(artifacts)
      .set({
        generationAttemptId,
        generationDraft: null,
        generationFailureCode: null,
        generationSequence: 0,
        generationState,
        updatedAt: new Date(),
      })
      .where(and(eq(artifacts.id, artifact.id), eq(artifacts.generationState, "failed")))
      .returning();
    if (!updated) throw new Error(`${input.errorLabel} retry lost its publication fence`);
    await input.enqueue(tx, input.createJob(artifact.id, generationAttemptId));
    return updated;
  });
}

export async function claimArtifactGeneration(input: {
  artifactId: string;
  attemptId: string;
  db?: Database;
  errorLabel: string;
  kind: ArtifactKind;
}) {
  const db = input.db ?? database;
  const attemptId = artifactIdSchema.parse(input.attemptId);
  return db.transaction(async (tx) => {
    const [claimable] = await tx
      .select({
        generationAttemptId: artifacts.generationAttemptId,
        generationState: artifacts.generationState,
        attemptState: artifactGenerationAttempts.state,
      })
      .from(artifacts)
      .innerJoin(
        artifactGenerationAttempts,
        and(
          eq(artifactGenerationAttempts.id, artifacts.generationAttemptId),
          eq(artifactGenerationAttempts.artifactId, artifacts.id),
        ),
      )
      .where(
        and(
          eq(artifacts.id, input.artifactId),
          eq(artifacts.kind, input.kind),
          eq(artifacts.generationAttemptId, attemptId),
          isNull(artifacts.deletedAt),
          ne(artifacts.generationState, "ready"),
          ne(artifacts.generationState, "failed"),
        ),
      )
      .for("update");
    if (!claimable) throw new Error(`${input.errorLabel} generation is no longer claimable`);
    if (claimable.attemptState === "running") return claimable.generationAttemptId;
    if (claimable.attemptState !== "queued") {
      throw new Error(`${input.errorLabel} generation is no longer claimable`);
    }
    const nextState = transitionArtifactGeneration(
      artifactGenerationStateSchema.parse(claimable.generationState),
      "generating",
    );
    const [updated] = await tx
      .update(artifacts)
      .set({
        generationAttemptId: attemptId,
        generationSequence: 0,
        generationState: nextState,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(artifacts.id, input.artifactId),
          eq(artifacts.generationState, claimable.generationState),
        ),
      )
      .returning({ id: artifacts.id });
    if (!updated) throw new Error(`${input.errorLabel} generation is no longer claimable`);
    const attemptState = transitionArtifactGenerationAttempt(claimable.attemptState, "running");
    const [claimedAttempt] = await tx
      .update(artifactGenerationAttempts)
      .set({ startedAt: new Date(), state: attemptState, updatedAt: new Date() })
      .where(
        and(
          eq(artifactGenerationAttempts.id, attemptId),
          eq(artifactGenerationAttempts.state, claimable.attemptState),
        ),
      )
      .returning({ id: artifactGenerationAttempts.id });
    if (!claimedAttempt) throw new Error(`${input.errorLabel} attempt was not claimed`);
    return claimable.generationAttemptId;
  });
}

export async function updateArtifactGeneration(input: {
  artifactId: string;
  attemptId: string;
  db?: Database;
  draft?: unknown;
  errorLabel: string;
  kind: ArtifactKind;
  providerConversationId?: string;
  sequence?: number;
  state: Exclude<ArtifactGenerationState, "ready" | "failed">;
  taskAgentPhase?: ActiveTaskAgentAttemptPhase;
  title?: string;
}) {
  const db = input.db ?? database;
  const attemptId = artifactIdSchema.parse(input.attemptId);
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ generationState: artifacts.generationState })
      .from(artifacts)
      .where(
        and(
          eq(artifacts.id, input.artifactId),
          eq(artifacts.kind, input.kind),
          eq(artifacts.generationAttemptId, attemptId),
          isNull(artifacts.deletedAt),
        ),
      )
      .limit(1)
      .for("update");
    if (!current) throw new Error(`${input.errorLabel} generation is no longer writable`);
    const nextState = transitionArtifactGeneration(
      artifactGenerationStateSchema.parse(current.generationState),
      input.state,
    );
    const [updated] = await tx
      .update(artifacts)
      .set({
        ...(input.draft !== undefined ? { generationDraft: input.draft } : {}),
        ...(input.sequence !== undefined ? { generationSequence: input.sequence } : {}),
        generationState: nextState,
        ...(input.title?.trim() ? { title: input.title.trim() } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(artifacts.id, input.artifactId),
          eq(artifacts.kind, input.kind),
          eq(artifacts.generationState, current.generationState),
          eq(artifacts.generationAttemptId, attemptId),
          ...(input.sequence !== undefined
            ? [lte(artifacts.generationSequence, input.sequence)]
            : []),
          isNull(artifacts.deletedAt),
        ),
      )
      .returning({ id: artifacts.id });
    if (!updated) throw new Error(`${input.errorLabel} generation is no longer writable`);
    if (input.sequence !== undefined) {
      const now = new Date();
      await tx
        .update(artifactGenerationAttempts)
        .set({
          ...(input.providerConversationId
            ? { providerConversationId: artifactIdSchema.parse(input.providerConversationId) }
            : {}),
          ...(input.taskAgentPhase
            ? {
                phase: input.taskAgentPhase,
                ...(input.taskAgentPhase === "authoring" ? { providerStatus: "running" } : {}),
                ...phaseTimestamp(input.taskAgentPhase, now),
              }
            : {}),
          sequence: input.sequence,
          updatedAt: now,
        })
        .where(
          and(
            eq(artifactGenerationAttempts.id, attemptId),
            eq(artifactGenerationAttempts.state, "running"),
            lte(artifactGenerationAttempts.sequence, input.sequence),
          ),
        );
    }
  });
}

export async function completeArtifactGeneration(input: {
  actorId: string;
  artifactId: string;
  attemptId: string;
  content: unknown;
  db?: Database;
  errorLabel: string;
  kind: ArtifactKind;
  producingAttemptId?: string | null;
  producingRunId?: string | null;
  generationMetadata?: unknown;
  publishResources?: (
    transaction: DatabaseTransaction,
    context: {
      artifact: typeof artifacts.$inferSelect;
      revision: typeof artifactRevisions.$inferSelect;
    },
  ) => Promise<void>;
  title: string;
}) {
  const db = input.db ?? database;
  const attemptId = artifactIdSchema.parse(input.attemptId);
  const contentSha256 = canonicalJsonSha256(input.content);
  return db.transaction(async (tx) => {
    const [artifact] = await tx
      .select()
      .from(artifacts)
      .where(
        and(
          eq(artifacts.id, input.artifactId),
          eq(artifacts.kind, input.kind),
          eq(artifacts.generationState, "finalizing"),
          eq(artifacts.generationAttemptId, attemptId),
          isNull(artifacts.deletedAt),
        ),
      )
      .limit(1)
      .for("update");
    if (!artifact || artifact.generationState === "ready") {
      throw new Error(`${input.errorLabel} generation is not completable`);
    }
    const nextState = transitionArtifactGeneration(
      artifactGenerationStateSchema.parse(artifact.generationState),
      "ready",
    );
    let parentRevisionId: string | null = null;
    let parentReceipt: ArtifactGroundingReceipt | null = null;
    let revisionNumber = 1;
    if (artifact.currentRevisionId) {
      const [currentRevision] = await tx
        .select({
          generationMetadata: artifactRevisions.generationMetadata,
          id: artifactRevisions.id,
          revisionNumber: artifactRevisions.revisionNumber,
        })
        .from(artifactRevisions)
        .where(
          and(
            eq(artifactRevisions.id, artifact.currentRevisionId),
            eq(artifactRevisions.artifactId, artifact.id),
          ),
        )
        .limit(1);
      if (!currentRevision) throw new Error(`${input.errorLabel} current revision is missing`);
      parentRevisionId = currentRevision.id;
      parentReceipt = parentGroundingReceipt({
        artifactId: artifact.id,
        generationMetadata: currentRevision.generationMetadata,
        revisionId: currentRevision.id,
      });
      revisionNumber = currentRevision.revisionNumber + 1;
    }
    const requestIdentitySha256 =
      artifact.generationRequest === null
        ? undefined
        : canonicalJsonSha256(artifact.generationRequest);
    const groundingReceipt = artifactGroundingReceiptForOperation({
      operation: operationGroundingReceiptFromBundle(
        groundingBundleFromGenerationRequest(artifact.generationRequest),
      ),
      parent: parentReceipt,
    });
    const [revision] = await tx
      .insert(artifactRevisions)
      .values({
        artifactId: input.artifactId,
        content: input.content,
        contentSha256,
        createdByPrincipalId: input.actorId,
        generationMetadata: generationMetadataWithArtifactGrounding({
          generationMetadata: input.generationMetadata,
          receipt: groundingReceipt,
          ...(requestIdentitySha256 ? { requestIdentitySha256 } : {}),
        }),
        generationAttemptId: attemptId,
        parentRevisionId,
        producingAttemptId: input.producingAttemptId ?? null,
        producingRunId: input.producingRunId ?? artifact.rootRunId,
        revisionNumber,
      })
      .returning();
    if (!revision) throw new Error(`${input.errorLabel} generation revision was not created`);
    await input.publishResources?.(tx, { artifact, revision });
    const [updated] = await tx
      .update(artifacts)
      .set({
        currentRevisionId: revision.id,
        generationAttemptId: null,
        generationDraft: null,
        generationFailureCode: null,
        generationRequest: null,
        generationState: nextState,
        title: input.title,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(artifacts.id, input.artifactId),
          eq(artifacts.generationState, "finalizing"),
          eq(artifacts.generationAttemptId, attemptId),
          isNull(artifacts.deletedAt),
        ),
      )
      .returning();
    if (!updated) throw new Error(`${input.errorLabel} generation was not completed`);
    const attemptState = transitionArtifactGenerationAttempt("running", "submitted");
    const [submittedAttempt] = await tx
      .update(artifactGenerationAttempts)
      .set({
        ...(input.kind === "presentation" || input.kind === "animation"
          ? { phase: "succeeded", providerStatus: "finished" }
          : {}),
        finishedAt: new Date(),
        state: attemptState,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(artifactGenerationAttempts.id, attemptId),
          eq(artifactGenerationAttempts.state, "running"),
        ),
      )
      .returning({ id: artifactGenerationAttempts.id });
    if (!submittedAttempt) throw new Error(`${input.errorLabel} attempt was not submitted`);
    return { artifact: updated, revision };
  });
}

export async function failArtifactGeneration(input: {
  artifactId: string;
  attemptId: string;
  db?: Database;
  failureCode: string;
  failureDetail?: string;
  kind: ArtifactKind;
}) {
  const db = input.db ?? database;
  const attemptId = artifactIdSchema.parse(input.attemptId);
  const failureCode = z.string().trim().min(1).max(100).parse(input.failureCode);
  const failureDetail = input.failureDetail
    ? z.string().trim().min(1).max(4_000).parse(input.failureDetail)
    : null;
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        generationAttemptId: artifacts.generationAttemptId,
        generationState: artifacts.generationState,
      })
      .from(artifacts)
      .where(
        and(
          eq(artifacts.id, input.artifactId),
          eq(artifacts.kind, input.kind),
          eq(artifacts.generationAttemptId, attemptId),
          isNull(artifacts.deletedAt),
        ),
      )
      .limit(1)
      .for("update");
    if (!current) return false;
    if (["ready", "failed", "cancelled"].includes(current.generationState)) return false;
    const nextState = transitionArtifactGeneration(
      artifactGenerationStateSchema.parse(current.generationState),
      "failed",
    );
    const [updated] = await tx
      .update(artifacts)
      .set({
        generationFailureCode: failureCode,
        generationSequence: 0,
        generationState: nextState,
        generationAttemptId: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(artifacts.id, input.artifactId),
          eq(artifacts.kind, input.kind),
          eq(artifacts.generationState, current.generationState),
          eq(artifacts.generationAttemptId, attemptId),
          isNull(artifacts.deletedAt),
        ),
      )
      .returning({ id: artifacts.id });
    if (updated && current.generationAttemptId) {
      const [attempt] = await tx
        .select({ state: artifactGenerationAttempts.state })
        .from(artifactGenerationAttempts)
        .where(eq(artifactGenerationAttempts.id, current.generationAttemptId))
        .limit(1)
        .for("update");
      if (attempt && ["queued", "running"].includes(attempt.state)) {
        const failedState = transitionArtifactGenerationAttempt(attempt.state, "failed");
        await tx
          .update(artifactGenerationAttempts)
          .set({
            failureCode,
            failureDetail,
            ...(input.kind === "presentation" || input.kind === "animation"
              ? { phase: "failed", providerStatus: "error" }
              : {}),
            finishedAt: new Date(),
            state: failedState,
            updatedAt: new Date(),
          })
          .where(eq(artifactGenerationAttempts.id, current.generationAttemptId));
        await tx
          .update(artifactProviderAttempts)
          .set({
            errorCode: failureCode,
            finishedAt: new Date(),
            state: "failed",
          })
          .where(
            and(
              eq(artifactProviderAttempts.generationAttemptId, current.generationAttemptId),
              eq(artifactProviderAttempts.state, "running"),
            ),
          );
      }
    }
    return Boolean(updated);
  });
}

export async function appendArtifactRevision(input: {
  actorId: string;
  artifactId: string;
  content: unknown;
  conversationId: string;
  db?: Database | DatabaseTransaction;
  expectedRevisionId: string;
  kind: ArtifactKind;
  operationGroundingReceipt?: ArtifactOperationGroundingReceipt;
  producingRunId?: string | null;
  publishResources?: (
    transaction: DatabaseTransaction,
    context: {
      artifact: typeof artifacts.$inferSelect;
      revision: typeof artifactRevisions.$inferSelect;
    },
  ) => Promise<void>;
  title: string;
  workspaceId: string;
}) {
  const db = input.db ?? database;
  const parsed = z
    .object({
      actorId: artifactIdSchema,
      artifactId: artifactIdSchema,
      conversationId: artifactIdSchema,
      expectedRevisionId: artifactIdSchema,
      producingRunId: artifactIdSchema.nullable().optional(),
      title: z.string().trim().min(1).max(200),
      workspaceId: artifactIdSchema,
    })
    .strict()
    .parse({
      actorId: input.actorId,
      artifactId: input.artifactId,
      conversationId: input.conversationId,
      expectedRevisionId: input.expectedRevisionId,
      producingRunId: input.producingRunId ?? null,
      title: input.title,
      workspaceId: input.workspaceId,
    });
  const contentSha256 = canonicalJsonSha256(input.content);

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ artifact: artifacts, revision: artifactRevisions })
      .from(artifacts)
      .innerJoin(
        artifactRevisions,
        and(
          eq(artifacts.currentRevisionId, artifactRevisions.id),
          eq(artifactRevisions.artifactId, artifacts.id),
        ),
      )
      .where(
        and(
          eq(artifacts.id, parsed.artifactId),
          eq(artifacts.workspaceId, parsed.workspaceId),
          eq(artifacts.conversationId, parsed.conversationId),
          eq(artifacts.kind, input.kind),
          isNull(artifacts.deletedAt),
        ),
      )
      .limit(1)
      .for("update");
    if (!current || current.artifact.createdByPrincipalId !== parsed.actorId) {
      throw new ArtifactError("artifact_not_found");
    }
    if (current.revision.id !== parsed.expectedRevisionId) {
      throw new ArtifactError("artifact_revision_conflict");
    }
    const receipt = artifactGroundingReceiptForOperation({
      operation: input.operationGroundingReceipt ?? { operationEvidence: [], version: 1 },
      parent: parentGroundingReceipt({
        artifactId: current.artifact.id,
        generationMetadata: current.revision.generationMetadata,
        revisionId: current.revision.id,
      }),
    });
    const requestIdentitySha256 = artifactRequestIdentityFromMetadata(
      current.revision.generationMetadata,
    );

    const [revision] = await tx
      .insert(artifactRevisions)
      .values({
        artifactId: current.artifact.id,
        content: input.content,
        contentSha256,
        createdByPrincipalId: parsed.actorId,
        generationMetadata: generationMetadataWithArtifactGrounding({
          receipt,
          ...(requestIdentitySha256 ? { requestIdentitySha256 } : {}),
        }),
        parentRevisionId: current.revision.id,
        producingRunId: parsed.producingRunId,
        revisionNumber: current.revision.revisionNumber + 1,
      })
      .returning();
    if (!revision) throw new Error("Artifact revision insert returned no row");
    await input.publishResources?.(tx, { artifact: current.artifact, revision });
    const [artifact] = await tx
      .update(artifacts)
      .set({ currentRevisionId: revision.id, title: parsed.title, updatedAt: new Date() })
      .where(
        and(
          eq(artifacts.id, current.artifact.id),
          eq(artifacts.currentRevisionId, current.revision.id),
          isNull(artifacts.deletedAt),
        ),
      )
      .returning();
    if (!artifact) throw new ArtifactError("artifact_revision_conflict");
    return { artifact, revision };
  });
}

export async function tombstoneArtifact(input: {
  actorId: string;
  artifactId: string;
  conversationId: string;
  db?: Database;
  enqueueCleanup?: (transaction: DatabaseTransaction, artifactId: string) => Promise<void>;
  kind: ArtifactKind;
  workspaceId: string;
}) {
  const db = input.db ?? database;
  return db.transaction(async (tx) => {
    const [artifact] = await tx
      .select({
        deletedAt: artifacts.deletedAt,
        generationAttemptId: artifacts.generationAttemptId,
        generationState: artifacts.generationState,
        id: artifacts.id,
        kind: artifacts.kind,
        createdByPrincipalId: artifacts.createdByPrincipalId,
      })
      .from(artifacts)
      .where(
        and(
          eq(artifacts.id, input.artifactId),
          eq(artifacts.workspaceId, input.workspaceId),
          eq(artifacts.conversationId, input.conversationId),
          eq(artifacts.kind, input.kind),
        ),
      )
      .limit(1)
      .for("update");
    if (!artifact || artifact.createdByPrincipalId !== input.actorId)
      throw new ArtifactError("artifact_not_found");
    if (!artifact.deletedAt) {
      const deletedAt = new Date();
      const nextState = transitionArtifactGeneration(
        artifactGenerationStateSchema.parse(artifact.generationState),
        "cancelled",
      );
      await tx
        .update(artifacts)
        .set({
          deletedAt,
          generationAttemptId: null,
          generationDraft: null,
          generationFailureCode: null,
          generationSequence: 0,
          generationState: nextState,
          updatedAt: deletedAt,
        })
        .where(eq(artifacts.id, artifact.id));
      await tx
        .update(sources)
        .set({ deletedAt, updatedAt: deletedAt })
        .where(
          and(
            isNull(sources.deletedAt),
            inArray(
              sources.id,
              tx
                .select({ sourceId: artifactSources.sourceId })
                .from(artifactSources)
                .where(eq(artifactSources.artifactId, artifact.id)),
            ),
          ),
        );
      if (artifact.generationAttemptId) {
        const [attempt] = await tx
          .select({ state: artifactGenerationAttempts.state })
          .from(artifactGenerationAttempts)
          .where(eq(artifactGenerationAttempts.id, artifact.generationAttemptId))
          .limit(1)
          .for("update");
        if (attempt && ["queued", "running"].includes(attempt.state)) {
          await tx
            .update(artifactGenerationAttempts)
            .set({
              ...(artifact.kind === "presentation" || artifact.kind === "animation"
                ? { phase: "cancelled", providerStatus: "stopped" }
                : {}),
              finishedAt: deletedAt,
              state: transitionArtifactGenerationAttempt(attempt.state, "cancelled"),
              updatedAt: deletedAt,
            })
            .where(eq(artifactGenerationAttempts.id, artifact.generationAttemptId));
          await tx
            .update(artifactProviderAttempts)
            .set({
              errorCode: "generation_cancelled",
              finishedAt: deletedAt,
              state: "failed",
            })
            .where(
              and(
                eq(artifactProviderAttempts.generationAttemptId, artifact.generationAttemptId),
                eq(artifactProviderAttempts.state, "running"),
              ),
            );
        }
      }
      await input.enqueueCleanup?.(tx, artifact.id);
    }
    return artifact.id;
  });
}

export async function purgeDeletedArtifactContent(
  artifactId: string,
  kind: ArtifactKind,
  db: Database = database,
) {
  await db.transaction(async (tx) => {
    const [artifact] = await tx
      .select({ generationState: artifacts.generationState, id: artifacts.id })
      .from(artifacts)
      .where(
        and(eq(artifacts.id, artifactId), eq(artifacts.kind, kind), isNotNull(artifacts.deletedAt)),
      )
      .limit(1)
      .for("update");
    if (!artifact) return;
    const nextState = transitionArtifactGeneration(
      artifactGenerationStateSchema.parse(artifact.generationState),
      "cancelled",
    );
    await tx
      .update(artifacts)
      .set({ currentRevisionId: null })
      .where(eq(artifacts.id, artifact.id));
    await tx
      .update(artifactRevisions)
      .set({ parentRevisionId: null })
      .where(eq(artifactRevisions.artifactId, artifact.id));
    await tx.delete(artifactEditProposals).where(eq(artifactEditProposals.artifactId, artifact.id));
    await tx.delete(artifactRevisions).where(eq(artifactRevisions.artifactId, artifact.id));
    await tx
      .update(artifacts)
      .set({
        generationAttemptId: null,
        generationDraft: null,
        generationFailureCode: null,
        generationRequest: null,
        generationSequence: 0,
        generationState: nextState,
        title: "Deleted artifact",
        updatedAt: new Date(),
      })
      .where(eq(artifacts.id, artifact.id));
  });
}
