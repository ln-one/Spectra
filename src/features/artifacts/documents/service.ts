import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { type Database, type DatabaseTransaction, database } from "@/database/client";
import { artifactRevisions, artifacts } from "@/database/schema";
import { createArtifactReadModel } from "@/features/artifacts/artifact-read-model.server";
import { publishArtifactSourceRevision } from "@/features/artifacts/artifact-source-publication.server";
import { ArtifactError } from "@/features/artifacts/errors";
import {
  type ArtifactGenerationStartInput,
  artifactGenerationStartInputSchema,
} from "@/features/artifacts/generation";
import {
  type ArtifactOperationGroundingReceipt,
  artifactOperationGroundingReceiptSchema,
} from "@/features/artifacts/grounding";
import {
  type ArtifactGenerationState,
  artifactGenerationStateSchema,
} from "@/features/artifacts/types";
import type { Actor } from "@/features/identity/types";
import type { ArtifactCleanupQueue } from "../lifecycle.server";
import {
  appendArtifactRevision,
  claimArtifactGeneration,
  completeArtifactGeneration,
  failArtifactGeneration,
  purgeDeletedArtifactContent,
  startArtifactGeneration,
  tombstoneArtifact,
  updateArtifactGeneration,
} from "../lifecycle.server";
import { teachingDocumentGenerationProfile } from "./config";
import {
  type TeachingDocumentDraft,
  type TeachingDocumentGenerationDraft,
  type TeachingDocumentRevisionContent,
  teachingDocumentGenerationDraftSchema,
  teachingDocumentGenerationRequestSchema,
  teachingDocumentRevisionContentSchema,
} from "./contract";
import { TeachingDocumentError } from "./errors";
import type { TeachingDocumentGenerationQueue } from "./generation-queue";
import type {
  TeachingDocumentArtifact,
  TeachingDocumentDetail,
  TeachingDocumentRevision,
} from "./types";

const artifactIdSchema = z.string().uuid();
const readModel = createArtifactReadModel({
  contentSchema: teachingDocumentRevisionContentSchema,
  errorLabel: "Teaching document",
  kind: "teaching_document",
  notFoundError: () => new TeachingDocumentError("teaching_document_not_found"),
});
const { requirePrivateArtifactCreate, requirePrivateArtifactManage, toArtifact, toRevision } =
  readModel;

function toDetail(
  row: typeof artifacts.$inferSelect,
  revision: typeof artifactRevisions.$inferSelect | null,
): TeachingDocumentDetail {
  const generationState = artifactGenerationStateSchema.parse(row.generationState);
  const draft = row.generationDraft
    ? teachingDocumentGenerationDraftSchema.parse(row.generationDraft)
    : null;
  const base = {
    createdAt: row.createdAt.toISOString(),
    draft,
    failureCode: row.generationFailureCode,
    id: row.id,
    kind: "teaching_document" as const,
    generationAttemptId: row.generationAttemptId,
    generationSequence: row.generationSequence,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
    workspaceId: row.workspaceId,
  };
  if (generationState === "ready") {
    if (!revision) throw new Error("Ready teaching document has no current revision");
    return {
      ...base,
      artifact: toArtifact(row, revision),
      draft: null,
      failureCode: null,
      generationState,
    };
  }
  if (generationState === "failed") {
    if (!row.generationFailureCode) throw new Error("Failed teaching document has no failure code");
    return {
      ...base,
      artifact: null,
      failureCode: row.generationFailureCode,
      generationState,
    };
  }
  if (generationState === "cancelled") {
    return {
      ...base,
      artifact: null,
      draft: null,
      failureCode: null,
      generationAttemptId: null,
      generationState,
    };
  }
  return {
    ...base,
    artifact: null,
    failureCode: null,
    generationState,
  };
}

function initialTeachingDocumentTitle(prompt: string) {
  return prompt.normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 200);
}

export async function startTeachingDocumentGeneration(
  actor: Actor,
  input: ArtifactGenerationStartInput,
  queue: TeachingDocumentGenerationQueue,
  db: Database = database,
): Promise<TeachingDocumentDetail> {
  const parsed = artifactGenerationStartInputSchema.parse(input);
  await requirePrivateArtifactCreate(actor, parsed.workspaceId, db);
  const generationRequest = teachingDocumentGenerationRequestSchema.parse({
    grounding: parsed.grounding,
    locale: parsed.locale,
    prompt: parsed.prompt,
  });
  const result = await startArtifactGeneration({
    actorId: actor.principalId,
    conversationId: parsed.conversationId,
    createJob: (artifactId, generationAttemptId) => ({
      artifactId,
      generationAttemptId,
      conversationId: parsed.conversationId,
      locale: parsed.locale,
      prompt: parsed.prompt,
      workspaceId: parsed.workspaceId,
    }),
    db,
    enqueue: (transaction, job) => queue.enqueue(transaction, job),
    errorLabel: "Teaching document",
    generationRequest,
    kind: "teaching_document",
    rootRunId: parsed.rootRunId ?? null,
    sourcePlanItemId: parsed.sourcePlanItemId ?? null,
    sourceUserMessageId: parsed.sourceUserMessageId,
    title: parsed.requestedTitle ?? initialTeachingDocumentTitle(parsed.prompt),
    workspaceId: parsed.workspaceId,
  });
  return toDetail(result.artifact, result.revision);
}

export async function getTeachingDocumentDetailForConversation(
  actor: Actor,
  input: { artifactId: string; workspaceId: string; conversationId: string },
  db: Database = database,
): Promise<TeachingDocumentDetail> {
  return readModel.getDetailForConversation(actor, input, toDetail, db);
}

async function findTeachingDocumentGenerationArtifact(artifactId: string, db: Database = database) {
  const parsedArtifactId = artifactIdSchema.parse(artifactId);
  const [artifact] = await db
    .select()
    .from(artifacts)
    .where(
      and(
        eq(artifacts.id, parsedArtifactId),
        eq(artifacts.kind, "teaching_document"),
        isNull(artifacts.deletedAt),
      ),
    )
    .limit(1);
  if (!artifact || artifact.generationState === "ready" || artifact.generationState === "failed") {
    return null;
  }
  return artifact;
}

export async function getTeachingDocumentGenerationInputById(
  artifactId: string,
  db: Database = database,
) {
  const artifact = await findTeachingDocumentGenerationArtifact(artifactId, db);
  if (!artifact) return null;
  return {
    artifact,
    request: teachingDocumentGenerationRequestSchema.parse(artifact.generationRequest),
  };
}

export async function claimTeachingDocumentGeneration(
  artifactId: string,
  attemptId: string,
  db: Database = database,
) {
  return claimArtifactGeneration({
    artifactId,
    attemptId,
    db,
    errorLabel: "Teaching document",
    kind: "teaching_document",
  });
}

export async function updateTeachingDocumentGeneration(
  artifactId: string,
  attemptId: string,
  input: {
    state: Exclude<ArtifactGenerationState, "ready" | "failed">;
    draft?: TeachingDocumentGenerationDraft | null;
    sequence?: number;
  },
  db: Database = database,
) {
  const draft = input.draft === undefined ? undefined : input.draft;
  return updateArtifactGeneration({
    artifactId,
    attemptId,
    db,
    ...(draft !== undefined ? { draft } : {}),
    errorLabel: "Teaching document",
    kind: "teaching_document",
    ...(input.sequence !== undefined ? { sequence: input.sequence } : {}),
    state: input.state,
  });
}

export async function completeTeachingDocumentGeneration(
  artifactId: string,
  attemptId: string,
  actorId: string,
  _draft: TeachingDocumentDraft,
  content: TeachingDocumentRevisionContent,
  db: Database = database,
  producingAttemptId: string | null = null,
): Promise<TeachingDocumentArtifact> {
  const parsedContent = teachingDocumentRevisionContentSchema.parse(content);
  const result = await completeTeachingDocumentProjection(
    artifactId,
    attemptId,
    actorId,
    parsedContent,
    db,
    producingAttemptId,
  );
  return result.artifact;
}

export async function completeTeachingDocumentProjection(
  artifactId: string,
  attemptId: string,
  actorId: string,
  content: TeachingDocumentRevisionContent,
  db: Database = database,
  producingAttemptId: string | null = null,
) {
  const parsedContent = teachingDocumentRevisionContentSchema.parse(content);
  const result = await completeArtifactGeneration({
    actorId,
    artifactId,
    attemptId,
    content: parsedContent,
    db,
    errorLabel: "Teaching document",
    kind: "teaching_document",
    generationMetadata: {
      modelId: teachingDocumentGenerationProfile.modelId,
      profile: teachingDocumentGenerationProfile,
      profileVersion: "teaching-document-markdown-v2",
      outcome: parsedContent.generation.outcome,
      warnings: parsedContent.generation.warnings,
    },
    producingAttemptId,
    title: parsedContent.title,
  });
  return { artifact: toArtifact(result.artifact, result.revision), revision: result.revision };
}

async function projectTeachingDocumentGenerationFailure(
  artifactId: string,
  failureCode: string,
  attemptId: string,
  db: Database = database,
) {
  return failArtifactGeneration({
    artifactId,
    attemptId,
    db,
    failureCode,
    kind: "teaching_document",
  });
}

export function failTeachingDocumentGeneration(
  artifactId: string,
  failureCode: string,
  attemptId: string,
  db: Database = database,
) {
  return projectTeachingDocumentGenerationFailure(artifactId, failureCode, attemptId, db);
}

export function failExhaustedTeachingDocumentGeneration(
  artifactId: string,
  failureCode: string,
  attemptId: string,
  db: Database = database,
) {
  return projectTeachingDocumentGenerationFailure(artifactId, failureCode, attemptId, db);
}

export async function deleteTeachingDocumentForConversation(
  actor: Actor,
  input: { artifactId: string; workspaceId: string; conversationId: string },
  db: Database = database,
) {
  return deleteTeachingDocumentForConversationWithCleanupQueue(actor, input, db, {
    async enqueue() {},
  });
}

export async function deleteTeachingDocumentForConversationWithCleanupQueue(
  actor: Actor,
  input: { artifactId: string; workspaceId: string; conversationId: string },
  db: Database,
  cleanupQueue: ArtifactCleanupQueue,
) {
  const parsed = z
    .object({
      artifactId: artifactIdSchema,
      conversationId: artifactIdSchema,
      workspaceId: artifactIdSchema,
    })
    .strict()
    .safeParse(input);
  if (!parsed.success) throw new TeachingDocumentError("teaching_document_not_found");
  await requirePrivateArtifactManage(actor, parsed.data, db);
  try {
    return await tombstoneArtifact({
      actorId: actor.principalId,
      ...parsed.data,
      db,
      enqueueCleanup: (transaction, artifactId) => cleanupQueue.enqueue(transaction, artifactId),
      kind: "teaching_document",
    });
  } catch (error) {
    if (error instanceof ArtifactError) {
      throw new TeachingDocumentError("teaching_document_not_found");
    }
    throw error;
  }
}

export async function purgeDeletedTeachingDocumentContent(artifactId: string, db: Database) {
  await purgeDeletedArtifactContent(artifactId, "teaching_document", db);
}

export async function getTeachingDocumentArtifact(
  actor: Actor,
  artifactId: string,
  db: Database = database,
): Promise<TeachingDocumentArtifact> {
  if (!artifactIdSchema.safeParse(artifactId).success) {
    throw new TeachingDocumentError("teaching_document_not_found");
  }
  const [row] = await db
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
        eq(artifacts.id, artifactId),
        eq(artifacts.kind, "teaching_document"),
        isNull(artifacts.deletedAt),
      ),
    )
    .limit(1);
  if (!row?.artifact.conversationId) {
    throw new TeachingDocumentError("teaching_document_not_found");
  }
  await requirePrivateArtifactManage(
    actor,
    {
      artifactId: row.artifact.id,
      conversationId: row.artifact.conversationId,
      workspaceId: row.artifact.workspaceId,
    },
    db,
  );
  return toArtifact(row.artifact, row.revision);
}

export async function getTeachingDocumentRevision(
  actor: Actor,
  artifactId: string,
  revisionId: string,
  db: Database = database,
): Promise<TeachingDocumentRevision> {
  if (
    !artifactIdSchema.safeParse(artifactId).success ||
    !artifactIdSchema.safeParse(revisionId).success
  ) {
    throw new TeachingDocumentError("teaching_document_not_found");
  }
  const [row] = await db
    .select({ artifact: artifacts, revision: artifactRevisions })
    .from(artifactRevisions)
    .innerJoin(artifacts, eq(artifactRevisions.artifactId, artifacts.id))
    .where(
      and(
        eq(artifacts.id, artifactId),
        eq(artifacts.kind, "teaching_document"),
        isNull(artifacts.deletedAt),
        eq(artifactRevisions.id, revisionId),
      ),
    )
    .limit(1);
  if (!row?.artifact.conversationId) {
    throw new TeachingDocumentError("teaching_document_not_found");
  }
  await requirePrivateArtifactManage(
    actor,
    {
      artifactId: row.artifact.id,
      conversationId: row.artifact.conversationId,
      workspaceId: row.artifact.workspaceId,
    },
    db,
  );
  return toRevision(row.revision);
}

export async function saveTeachingDocumentRevision(
  actor: Actor,
  input: {
    artifactId: string;
    conversationId: string;
    expectedRevisionId: string;
    operationGroundingReceipt?: ArtifactOperationGroundingReceipt;
    content: TeachingDocumentRevisionContent;
    producingRunId?: string | null;
    workspaceId: string;
  },
  db: Database | DatabaseTransaction = database,
): Promise<TeachingDocumentArtifact> {
  const parsed = z
    .object({
      artifactId: artifactIdSchema,
      conversationId: z.string().uuid(),
      content: teachingDocumentRevisionContentSchema,
      expectedRevisionId: artifactIdSchema,
      operationGroundingReceipt: artifactOperationGroundingReceiptSchema.optional(),
      producingRunId: artifactIdSchema.nullable().optional(),
      workspaceId: artifactIdSchema,
    })
    .strict()
    .parse(input);
  try {
    await requirePrivateArtifactManage(actor, parsed, db);
    const result = await appendArtifactRevision({
      actorId: actor.principalId,
      artifactId: parsed.artifactId,
      content: parsed.content,
      conversationId: parsed.conversationId,
      db,
      expectedRevisionId: parsed.expectedRevisionId,
      kind: "teaching_document",
      ...(parsed.operationGroundingReceipt
        ? { operationGroundingReceipt: parsed.operationGroundingReceipt }
        : {}),
      ...(parsed.producingRunId !== undefined ? { producingRunId: parsed.producingRunId } : {}),
      publishResources: publishArtifactSourceRevision,
      title: parsed.content.title,
      workspaceId: parsed.workspaceId,
    });
    return toArtifact(result.artifact, result.revision);
  } catch (error) {
    if (error instanceof ArtifactError) {
      throw new TeachingDocumentError(
        error.code === "artifact_revision_conflict"
          ? "teaching_document_conflict"
          : "teaching_document_not_found",
      );
    }
    throw error;
  }
}
