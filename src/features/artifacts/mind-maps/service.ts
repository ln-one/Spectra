import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { type Database, type DatabaseTransaction, database } from "@/database/client";
import { type artifactRevisions, artifacts } from "@/database/schema";
import { createArtifactReadModel } from "@/features/artifacts/artifact-read-model.server";
import { publishArtifactSourceRevision } from "@/features/artifacts/artifact-source-publication.server";
import { ArtifactError } from "@/features/artifacts/errors";
import {
  type ArtifactGenerationStartInput,
  artifactGenerationStartInputSchema,
} from "@/features/artifacts/generation";
import type { ArtifactOperationGroundingReceipt } from "@/features/artifacts/grounding";
import {
  type ArtifactCleanupQueue,
  appendArtifactRevision,
  claimArtifactGeneration,
  completeArtifactGeneration,
  failArtifactGeneration,
  purgeDeletedArtifactContent,
  startArtifactGeneration,
  tombstoneArtifact,
  updateArtifactGeneration,
} from "@/features/artifacts/lifecycle.server";
import {
  type ArtifactGenerationState,
  artifactGenerationStateSchema,
} from "@/features/artifacts/types";
import type { Actor } from "@/features/identity/types";
import { mindMapGenerationProfile } from "./config";
import {
  type MindMapDraftSnapshot,
  type MindMapRevisionContent,
  mindMapGenerationDraftSchema,
  mindMapGenerationRequestSchema,
  mindMapRevisionContentSchema,
} from "./contract";
import { MindMapError } from "./errors";
import type { MindMapGenerationQueue } from "./generation-queue";
import type { MindMapArtifact, MindMapDetail } from "./types";

const idSchema = z.string().uuid();
const readModel = createArtifactReadModel({
  contentSchema: mindMapRevisionContentSchema,
  errorLabel: "Mind map",
  kind: "mind_map",
  notFoundError: () => new MindMapError("mind_map_not_found"),
});
const { requirePrivateArtifactCreate, requirePrivateArtifactManage, toArtifact } = readModel;

function toDetail(
  row: typeof artifacts.$inferSelect,
  revision: typeof artifactRevisions.$inferSelect | null,
): MindMapDetail {
  const generationState = artifactGenerationStateSchema.parse(row.generationState);
  const storedDraft = row.generationDraft
    ? mindMapGenerationDraftSchema.parse(row.generationDraft)
    : null;
  const draft = storedDraft?.snapshot ?? null;
  const base = {
    createdAt: row.createdAt.toISOString(),
    draft,
    failureCode: row.generationFailureCode,
    generationAttemptId: row.generationAttemptId,
    generationSequence: row.generationSequence,
    id: row.id,
    kind: "mind_map" as const,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
    workspaceId: row.workspaceId,
  };
  if (generationState === "ready") {
    if (!revision) throw new Error("Ready mind map has no current revision");
    return {
      ...base,
      artifact: toArtifact(row, revision),
      draft: null,
      failureCode: null,
      generationState,
    };
  }
  if (generationState === "failed") {
    if (!row.generationFailureCode) throw new Error("Failed mind map has no failure code");
    return { ...base, artifact: null, failureCode: row.generationFailureCode, generationState };
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
  return { ...base, artifact: null, failureCode: null, generationState };
}

export async function startMindMapGeneration(
  actor: Actor,
  input: ArtifactGenerationStartInput,
  queue: MindMapGenerationQueue,
  db: Database = database,
): Promise<MindMapDetail> {
  const parsed = artifactGenerationStartInputSchema.parse(input);
  await requirePrivateArtifactCreate(actor, parsed.workspaceId, db);
  const request = mindMapGenerationRequestSchema.parse({
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
      locale: request.locale,
      prompt: request.prompt,
      workspaceId: parsed.workspaceId,
    }),
    db,
    enqueue: (transaction, job) => queue.enqueue(transaction, job),
    errorLabel: "Mind map",
    generationRequest: request,
    kind: "mind_map",
    rootRunId: parsed.rootRunId ?? null,
    sourcePlanItemId: parsed.sourcePlanItemId ?? null,
    sourceUserMessageId: parsed.sourceUserMessageId,
    title:
      parsed.requestedTitle ??
      parsed.prompt.normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 200),
    workspaceId: parsed.workspaceId,
  });
  return toDetail(result.artifact, result.revision);
}

export async function getMindMapDetailForConversation(
  actor: Actor,
  input: { artifactId: string; conversationId: string; workspaceId: string },
  db: Database = database,
): Promise<MindMapDetail> {
  return readModel.getDetailForConversation(actor, input, toDetail, db);
}

export async function getMindMapGenerationInputById(artifactId: string, db: Database = database) {
  const [artifact] = await db
    .select()
    .from(artifacts)
    .where(
      and(
        eq(artifacts.id, idSchema.parse(artifactId)),
        eq(artifacts.kind, "mind_map"),
        isNull(artifacts.deletedAt),
      ),
    )
    .limit(1);
  if (!artifact || artifact.generationState === "ready" || artifact.generationState === "failed")
    return null;
  return { artifact, request: mindMapGenerationRequestSchema.parse(artifact.generationRequest) };
}

export function claimMindMapGeneration(
  artifactId: string,
  attemptId: string,
  db: Database = database,
) {
  return claimArtifactGeneration({
    artifactId,
    attemptId,
    db,
    errorLabel: "Mind map",
    kind: "mind_map",
  });
}

export function updateMindMapGeneration(
  artifactId: string,
  attemptId: string,
  input: {
    draft?: MindMapDraftSnapshot | null;
    rawOutput?: string;
    sequence?: number;
    state: Exclude<ArtifactGenerationState, "ready" | "failed">;
  },
  db: Database = database,
) {
  const root = input.draft?.nodes.find((node) => node.id === input.draft?.rootId);
  const storedDraft =
    input.rawOutput !== undefined || input.draft !== undefined
      ? {
          format: "mind_map_raw" as const,
          rawOutput: input.rawOutput ?? "",
          snapshot: input.draft ?? null,
        }
      : undefined;
  return updateArtifactGeneration({
    artifactId,
    attemptId,
    db,
    ...(storedDraft !== undefined ? { draft: storedDraft } : {}),
    errorLabel: "Mind map",
    kind: "mind_map",
    ...(input.sequence !== undefined ? { sequence: input.sequence } : {}),
    state: input.state,
    ...(root ? { title: root.label } : {}),
  });
}

export async function completeMindMapGeneration(
  artifactId: string,
  attemptId: string,
  actorId: string,
  content: MindMapRevisionContent,
  db: Database = database,
  producingAttemptId: string | null = null,
) {
  const parsed = mindMapRevisionContentSchema.parse(content);
  const root = parsed.nodes.find((node) => node.id === parsed.rootId);
  if (!root) throw new Error("Mind map root is missing");
  const result = await completeArtifactGeneration({
    actorId,
    artifactId,
    attemptId,
    content: parsed,
    db,
    errorLabel: "Mind map",
    generationMetadata: {
      modelId: mindMapGenerationProfile.modelId,
      outcome: parsed.generation.outcome,
      profile: mindMapGenerationProfile,
      profileVersion: "mind-map-best-effort-v2",
      warnings: parsed.generation.warnings,
    },
    kind: "mind_map",
    producingAttemptId,
    title: root.label,
  });
  return toArtifact(result.artifact, result.revision);
}

export function failMindMapGeneration(
  artifactId: string,
  failureCode: string,
  attemptId: string,
  db: Database = database,
) {
  return failArtifactGeneration({ artifactId, attemptId, db, failureCode, kind: "mind_map" });
}

export async function saveMindMapRevision(
  actor: Actor,
  input: {
    artifactId: string;
    content: MindMapRevisionContent;
    conversationId: string;
    expectedRevisionId: string;
    operationGroundingReceipt?: ArtifactOperationGroundingReceipt;
    producingRunId?: string | null;
    workspaceId: string;
  },
  db: Database | DatabaseTransaction = database,
): Promise<MindMapArtifact> {
  const content = mindMapRevisionContentSchema.parse(input.content);
  const root = content.nodes.find((node) => node.id === content.rootId);
  if (!root) throw new MindMapError("mind_map_not_found");
  try {
    await requirePrivateArtifactManage(actor, input, db);
    const result = await appendArtifactRevision({
      actorId: actor.principalId,
      artifactId: input.artifactId,
      content,
      conversationId: input.conversationId,
      db,
      expectedRevisionId: input.expectedRevisionId,
      kind: "mind_map",
      ...(input.operationGroundingReceipt
        ? { operationGroundingReceipt: input.operationGroundingReceipt }
        : {}),
      producingRunId: input.producingRunId ?? null,
      publishResources: publishArtifactSourceRevision,
      title: root.label,
      workspaceId: input.workspaceId,
    });
    return toArtifact(result.artifact, result.revision);
  } catch (error) {
    if (error instanceof ArtifactError) {
      throw new MindMapError(
        error.code === "artifact_revision_conflict" ? "mind_map_conflict" : "mind_map_not_found",
      );
    }
    throw error;
  }
}

export async function deleteMindMapForConversation(
  actor: Actor,
  input: { artifactId: string; conversationId: string; workspaceId: string },
  db: Database = database,
) {
  return deleteMindMapForConversationWithCleanupQueue(actor, input, db, {
    async enqueue() {},
  });
}

export async function deleteMindMapForConversationWithCleanupQueue(
  actor: Actor,
  input: { artifactId: string; conversationId: string; workspaceId: string },
  db: Database,
  cleanupQueue: ArtifactCleanupQueue,
) {
  try {
    await requirePrivateArtifactManage(actor, input, db);
    return await tombstoneArtifact({
      actorId: actor.principalId,
      ...input,
      db,
      enqueueCleanup: (transaction, artifactId) => cleanupQueue.enqueue(transaction, artifactId),
      kind: "mind_map",
    });
  } catch (error) {
    if (error instanceof ArtifactError) throw new MindMapError("mind_map_not_found");
    throw error;
  }
}

export function purgeDeletedMindMapContent(artifactId: string, db: Database = database) {
  return purgeDeletedArtifactContent(artifactId, "mind_map", db);
}
