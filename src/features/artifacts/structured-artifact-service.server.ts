import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { type Database, type DatabaseTransaction, database } from "@/database/client";
import { type artifactRevisions, artifacts } from "@/database/schema";
import type { Actor } from "../identity/types";
import { createArtifactReadModel } from "./artifact-read-model.server";
import { publishArtifactSourceRevision } from "./artifact-source-publication.server";
import { ArtifactError } from "./errors";
import {
  type ArtifactGenerationStartInput,
  artifactGenerationStartInputSchema,
} from "./generation";
import type { ArtifactOperationGroundingReceipt } from "./grounding";
import {
  appendArtifactRevision,
  claimArtifactGeneration,
  completeArtifactGeneration,
  failArtifactGeneration,
  purgeDeletedArtifactContent,
  startArtifactGeneration,
  tombstoneArtifact,
  updateArtifactGeneration,
} from "./lifecycle.server";
import type { StructuredGenerationQueue } from "./structured-generation-queue";
import { artifactGenerationStateSchema } from "./types";

type StructuredArtifactKind = "game" | "quiz";
type TitledContent = { title: string };

export function createStructuredArtifactService<
  const Kind extends StructuredArtifactKind,
  Request,
  Content extends TitledContent,
>(config: {
  conflictError?: () => Error;
  contentSchema: z.ZodType<Content>;
  errorLabel: string;
  generationMetadata: Record<string, unknown>;
  kind: Kind;
  mapDeleteError?: boolean;
  notFoundError: () => Error;
  purgeResources: (artifactId: string, db: Database) => Promise<void>;
  requestSchema: z.ZodType<Request>;
}) {
  const idSchema = z.string().uuid();
  const readModel = createArtifactReadModel(config);
  const { requirePrivateArtifactCreate, requirePrivateArtifactManage, toArtifact } = readModel;

  function toDetail(
    row: typeof artifacts.$inferSelect,
    revision: typeof artifactRevisions.$inferSelect | null,
  ) {
    const generationState = artifactGenerationStateSchema.parse(row.generationState);
    const base = {
      createdAt: row.createdAt.toISOString(),
      failureCode: row.generationFailureCode,
      generationAttemptId: row.generationAttemptId,
      generationSequence: row.generationSequence,
      id: row.id,
      kind: config.kind,
      title: row.title,
      updatedAt: row.updatedAt.toISOString(),
      workspaceId: row.workspaceId,
    };
    if (generationState === "ready") {
      if (!revision) throw new Error(`Ready ${config.errorLabel} has no current revision`);
      return {
        ...base,
        artifact: toArtifact(row, revision),
        failureCode: null,
        generationState,
      } as const;
    }
    if (generationState === "failed") {
      if (!row.generationFailureCode) {
        throw new Error(`Failed ${config.errorLabel} has no failure code`);
      }
      return {
        ...base,
        artifact: null,
        failureCode: row.generationFailureCode,
        generationState,
      } as const;
    }
    if (generationState === "cancelled") {
      return {
        ...base,
        artifact: null,
        failureCode: null,
        generationAttemptId: null,
        generationState,
      } as const;
    }
    return { ...base, artifact: null, failureCode: null, generationState } as const;
  }

  return {
    claimGeneration(artifactId: string, attemptId: string, db: Database = database) {
      return claimArtifactGeneration({
        artifactId,
        attemptId,
        db,
        errorLabel: config.errorLabel,
        kind: config.kind,
      });
    },

    async completeGeneration(
      artifactId: string,
      attemptId: string,
      actorId: string,
      content: Content,
      db: Database = database,
      producingAttemptId: string | null = null,
    ) {
      const parsed = config.contentSchema.parse(content);
      const result = await completeArtifactGeneration({
        actorId,
        artifactId,
        attemptId,
        content: parsed,
        db,
        errorLabel: config.errorLabel,
        generationMetadata: config.generationMetadata,
        kind: config.kind,
        producingAttemptId,
        title: parsed.title,
      });
      return toArtifact(result.artifact, result.revision);
    },

    async deleteForConversation(
      actor: Actor,
      input: { artifactId: string; conversationId: string; workspaceId: string },
      db: Database = database,
    ) {
      try {
        await requirePrivateArtifactManage(actor, input, db);
        return await tombstoneArtifact({
          actorId: actor.principalId,
          ...input,
          db,
          kind: config.kind,
        });
      } catch (error) {
        if (config.mapDeleteError && error instanceof ArtifactError) throw config.notFoundError();
        throw error;
      }
    },

    failGeneration(
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
        kind: config.kind,
      });
    },

    finalizeGeneration(artifactId: string, attemptId: string, db: Database = database) {
      return updateArtifactGeneration({
        artifactId,
        attemptId,
        db,
        errorLabel: config.errorLabel,
        kind: config.kind,
        state: "finalizing",
      });
    },

    async getDetailForConversation(
      actor: Actor,
      input: { artifactId: string; conversationId: string; workspaceId: string },
      db: Database = database,
    ) {
      return readModel.getDetailForConversation(actor, input, toDetail, db);
    },

    async getGenerationInputById(artifactId: string, db: Database = database) {
      const [artifact] = await db
        .select()
        .from(artifacts)
        .where(
          and(
            eq(artifacts.id, idSchema.parse(artifactId)),
            eq(artifacts.kind, config.kind),
            isNull(artifacts.deletedAt),
          ),
        )
        .limit(1);
      if (
        !artifact ||
        artifact.generationState === "ready" ||
        artifact.generationState === "failed"
      ) {
        return null;
      }
      return { artifact, request: config.requestSchema.parse(artifact.generationRequest) };
    },

    async purgeDeletedContent(artifactId: string, db: Database = database) {
      await config.purgeResources(artifactId, db);
      await purgeDeletedArtifactContent(artifactId, config.kind, db);
    },

    requirePrivateArtifactCreate,

    requirePrivateArtifactManage,

    async saveRevision(
      actor: Actor,
      input: {
        artifactId: string;
        content: Content;
        conversationId: string;
        expectedRevisionId: string;
        operationGroundingReceipt?: ArtifactOperationGroundingReceipt;
        producingRunId?: string | null;
        workspaceId: string;
      },
      db: Database | DatabaseTransaction = database,
    ) {
      const content = config.contentSchema.parse(input.content);
      try {
        await requirePrivateArtifactManage(actor, input, db);
        const result = await appendArtifactRevision({
          actorId: actor.principalId,
          artifactId: input.artifactId,
          content,
          conversationId: input.conversationId,
          db,
          expectedRevisionId: input.expectedRevisionId,
          kind: config.kind,
          ...(input.operationGroundingReceipt
            ? { operationGroundingReceipt: input.operationGroundingReceipt }
            : {}),
          producingRunId: input.producingRunId ?? null,
          publishResources: publishArtifactSourceRevision,
          title: content.title,
          workspaceId: input.workspaceId,
        });
        return toArtifact(result.artifact, result.revision);
      } catch (error) {
        if (error instanceof ArtifactError && config.conflictError) {
          throw error.code === "artifact_revision_conflict"
            ? config.conflictError()
            : config.notFoundError();
        }
        throw error;
      }
    },

    async startGeneration(
      actor: Actor,
      input: ArtifactGenerationStartInput,
      queue: StructuredGenerationQueue,
      db: Database = database,
    ) {
      const parsed = artifactGenerationStartInputSchema.parse(input);
      await requirePrivateArtifactCreate(actor, parsed.workspaceId, db);
      const request = config.requestSchema.parse({
        grounding: parsed.grounding,
        locale: parsed.locale,
        prompt: parsed.prompt,
      });
      const result = await startArtifactGeneration({
        actorId: actor.principalId,
        conversationId: parsed.conversationId,
        createJob: (artifactId, generationAttemptId) => ({
          artifactId,
          conversationId: parsed.conversationId,
          generationAttemptId,
          locale: parsed.locale,
          prompt: parsed.prompt,
          workspaceId: parsed.workspaceId,
        }),
        db,
        enqueue: (transaction, job) => queue.enqueue(transaction, job),
        errorLabel: config.errorLabel,
        generationRequest: request,
        kind: config.kind,
        rootRunId: parsed.rootRunId ?? null,
        sourcePlanItemId: parsed.sourcePlanItemId ?? null,
        sourceUserMessageId: parsed.sourceUserMessageId,
        title:
          parsed.requestedTitle ??
          parsed.prompt.normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 200),
        workspaceId: parsed.workspaceId,
      });
      return toDetail(result.artifact, result.revision);
    },
  };
}
