import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { type Database, type DatabaseTransaction, database } from "@/database/client";
import {
  artifactGenerationAttempts,
  type artifactRevisions,
  artifactSourceBundles,
  artifacts,
} from "@/database/schema";
import { createArtifactReadModel } from "@/features/artifacts/artifact-read-model.server";
import {
  claimArtifactGeneration,
  completeArtifactGeneration,
  failArtifactGeneration,
  purgeDeletedArtifactContent,
  retryArtifactGeneration,
  startArtifactGeneration,
  tombstoneArtifact,
  updateArtifactGeneration,
} from "@/features/artifacts/lifecycle.server";
import { publishArtifactSourceBundle } from "@/features/artifacts/source-bundles.server";
import { artifactGenerationStateSchema } from "@/features/artifacts/types";
import type { Actor } from "@/features/identity/types";
import { OPENHANDS_AGENT_SERVER_VERSION } from "./agent-server-contract";
import type { TaskAgentAttemptPhase } from "./attempt";
import type { TaskAgentGenerationQueue } from "./generation-queue";
import { stableTaskAgentConversationId } from "./openhands-client.server";
import type { TaskAgentRecipeVersion } from "./recipe";

type TaskAgentArtifactKind = "animation" | "presentation";
type ActiveTaskAgentStage = Extract<
  TaskAgentAttemptPhase,
  "authoring" | "provisioning" | "publishing" | "rendering"
>;

type StartTaskAgentGenerationInput<Request> = {
  actorId: string;
  conversationId: string;
  generationRequest: Request;
  rootRunId: string | null;
  sourcePlanItemId?: string | null;
  sourceUserMessageId: string;
  title: string;
  workspaceId: string;
};

type CompleteTaskAgentGenerationInput<Content> = {
  actorId: string;
  artifactId: string;
  attemptId: string;
  content: Content;
  publishResources: (
    transaction: DatabaseTransaction,
    context: {
      revision: typeof artifactRevisions.$inferSelect;
    },
  ) => Promise<void>;
};

export function createTaskAgentGenerationLifecycle<
  Kind extends TaskAgentArtifactKind,
  Request,
  Content,
  Draft,
  Stage extends ActiveTaskAgentStage,
>(config: {
  contentSchema: z.ZodType<Content>;
  draftSchema: z.ZodType<Draft>;
  errorLabel: "Animation" | "Presentation";
  kind: Kind;
  notFoundError(): Error;
  recipeVersion: TaskAgentRecipeVersion;
  requestSchema: z.ZodType<Request>;
  stages: readonly Stage[];
  titleOf(content: Content): string;
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
      generationDraft: config.draftSchema.nullable().parse(row.generationDraft),
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
        generationDraft: null,
        generationState,
      };
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
      };
    }
    if (generationState === "cancelled") {
      return {
        ...base,
        artifact: null,
        failureCode: null,
        generationAttemptId: null,
        generationState,
      };
    }
    return { ...base, artifact: null, failureCode: null, generationState };
  }

  return {
    async claimGeneration(artifactId: string, attemptId: string, db: Database = database) {
      return claimArtifactGeneration({
        artifactId,
        attemptId,
        db,
        errorLabel: config.errorLabel,
        kind: config.kind,
      });
    },

    async completeGeneration(
      input: CompleteTaskAgentGenerationInput<Content>,
      db: Database = database,
    ) {
      const content = config.contentSchema.parse(input.content);
      return completeArtifactGeneration({
        actorId: input.actorId,
        artifactId: input.artifactId,
        attemptId: input.attemptId,
        content,
        db,
        errorLabel: config.errorLabel,
        generationMetadata: {
          recipeVersion: config.recipeVersion,
          runtime: `openhands-agent-server-${OPENHANDS_AGENT_SERVER_VERSION}`,
        },
        kind: config.kind,
        publishResources: async (transaction, context) => {
          await publishArtifactSourceBundle(transaction, {
            artifactId: input.artifactId,
            generationAttemptId: input.attemptId,
            revisionId: context.revision.id,
          });
          await input.publishResources(transaction, { revision: context.revision });
        },
        title: config.titleOf(content),
      });
    },

    async failGeneration(
      artifactId: string,
      failureCode: string,
      attemptId: string,
      db: Database = database,
      failureDetail?: string,
    ) {
      return failArtifactGeneration({
        artifactId,
        attemptId,
        db,
        failureCode,
        ...(failureDetail ? { failureDetail } : {}),
        kind: config.kind,
      });
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
        ["ready", "failed", "cancelled"].includes(artifact.generationState) ||
        !artifact.generationAttemptId
      ) {
        return null;
      }
      const [attempt] = await db
        .select()
        .from(artifactGenerationAttempts)
        .where(
          and(
            eq(artifactGenerationAttempts.id, artifact.generationAttemptId),
            eq(artifactGenerationAttempts.artifactId, artifact.id),
          ),
        )
        .limit(1);
      if (!attempt || !["queued", "running"].includes(attempt.state)) return null;
      return {
        artifact,
        attempt,
        request: config.requestSchema.parse(artifact.generationRequest),
      };
    },

    async getDetailForConversation(
      actor: Actor,
      input: { artifactId: string; conversationId: string; workspaceId: string },
      db: Database = database,
    ) {
      return readModel.getDetailForConversation(actor, input, toDetail, db);
    },

    async purgeDeletedContent(artifactId: string, db: Database = database) {
      await db
        .delete(artifactSourceBundles)
        .where(eq(artifactSourceBundles.artifactId, artifactId));
      await purgeDeletedArtifactContent(artifactId, config.kind, db);
    },

    requirePrivateArtifactCreate,

    requirePrivateArtifactManage,

    retryGeneration(artifactId: string, queue: TaskAgentGenerationQueue, db: Database = database) {
      return retryArtifactGeneration({
        artifactId,
        createJob: (nextArtifactId, generationAttemptId) => ({
          artifactId: nextArtifactId,
          generationAttemptId,
        }),
        db,
        enqueue: (transaction, job) => queue.enqueue(transaction, job),
        errorLabel: config.errorLabel,
        executorKind: "task_agent",
        kind: config.kind,
      });
    },

    startGeneration(
      input: StartTaskAgentGenerationInput<Request>,
      queue: TaskAgentGenerationQueue,
      db: Database = database,
    ) {
      return startArtifactGeneration({
        ...input,
        createJob: (artifactId, generationAttemptId) => ({ artifactId, generationAttemptId }),
        db,
        enqueue: (transaction, job) => queue.enqueue(transaction, job),
        errorLabel: config.errorLabel,
        executorKind: "task_agent",
        kind: config.kind,
      });
    },

    toArtifact,

    toDetail,

    async tombstone(
      actor: Actor,
      input: { artifactId: string; conversationId: string; workspaceId: string },
      db: Database = database,
    ) {
      await requirePrivateArtifactManage(actor, input, db);
      return tombstoneArtifact({
        actorId: actor.principalId,
        ...input,
        db,
        kind: config.kind,
      });
    },

    updateStage(artifactId: string, attemptId: string, stage: Stage, db: Database = database) {
      const sequence = config.stages.indexOf(stage) + 1;
      if (sequence <= 0) throw new Error(`${config.kind}_stage_invalid`);
      return updateArtifactGeneration({
        artifactId,
        attemptId,
        db,
        draft: { phase: stage, schemaVersion: 1 },
        errorLabel: config.errorLabel,
        kind: config.kind,
        providerConversationId: stableTaskAgentConversationId(config.recipeVersion, attemptId),
        sequence,
        state: stage === "publishing" ? "finalizing" : "generating",
        taskAgentPhase: stage,
      });
    },
  };
}
