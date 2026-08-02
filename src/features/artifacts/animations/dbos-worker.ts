import "server-only";

import type { Pool } from "pg";
import type { Database } from "@/database/client";
import type { ArtifactRenderStorage } from "@/features/artifacts/render-storage.server";
import {
  registerTaskAgentAuthoringWorkflow,
  type TaskAgentAuthoringUpload,
} from "@/features/artifacts/task-agent/authoring-workflow.server";
import type { OpenHandsAuthoringEnvironment } from "@/features/artifacts/task-agent/config.server";
import { putImmutableArtifactObject } from "@/features/artifacts/task-agent/immutable-storage.server";
import type { OpenHandsAuthoringClient } from "@/features/artifacts/task-agent/openhands-client.server";
import { animationAuthoringInputs, animationAuthoringInstruction } from "./authoring-input";
import {
  type AnimationGenerationRequest,
  type AnimationRevisionContent,
  animationSourceManifestSchema,
} from "./contract";
import { ANIMATION_AUTHORING_DBOS_WORKFLOW } from "./dbos";
import { runAnimationPipeline } from "./pipeline.server";
import {
  ANIMATION_MEDIA_TYPES,
  claimAnimationGeneration,
  completeAnimationGeneration,
  failAnimationGeneration,
  getAnimationGenerationInputById,
  updateAnimationStage,
} from "./service";

type RegisterAnimationAuthoringInput = {
  client?: OpenHandsAuthoringClient;
  db: Database;
  environment?: OpenHandsAuthoringEnvironment;
  pool: Pool;
  runPipeline?: typeof runAnimationPipeline;
  storage?: ArtifactRenderStorage;
};

export function registerAnimationAuthoringDbosWorkflow(input: RegisterAnimationAuthoringInput) {
  const pipeline = input.runPipeline ?? runAnimationPipeline;
  return registerTaskAgentAuthoringWorkflow<
    AnimationGenerationRequest,
    AnimationRevisionContent,
    Parameters<typeof completeAnimationGeneration>[0]["outputs"]
  >({
    buildUploads(request) {
      const authoring = animationAuthoringInputs(request);
      return [
        { body: authoring.brief, contentType: "application/json", path: "brief.json" },
        ...authoring.evidence.map(
          (file): TaskAgentAuthoringUpload => ({
            ...file,
            contentType: "text/markdown",
          }),
        ),
      ];
    },
    claimGeneration: claimAnimationGeneration,
    cleanupObjectKeys(artifactId, attemptId) {
      const prefix = `artifacts/${artifactId}/attempts/${attemptId}`;
      return [`${prefix}/source/final.tar.gz`, `${prefix}/renders/final.mp4`];
    },
    client: input.client,
    async collect({ archive, artifactId, attemptId, storage, summary, title }) {
      const result = await pipeline({
        archive,
        summary,
        title: title ?? "",
      });
      const prefix = `artifacts/${artifactId}/attempts/${attemptId}`;
      const sourceKey = `${prefix}/source/final.tar.gz`;
      const mp4Key = `${prefix}/renders/final.mp4`;
      const [source, mp4] = await Promise.all([
        putImmutableArtifactObject(storage, {
          body: result.sourceArchive,
          contentType: "application/gzip",
          key: sourceKey,
        }),
        putImmutableArtifactObject(storage, {
          body: result.mp4,
          contentType: ANIMATION_MEDIA_TYPES.mp4,
          key: mp4Key,
        }),
      ]);
      return {
        content: result.content,
        publishInput: {
          mp4: {
            objectKey: mp4Key,
            objectVersionId: mp4.versionId,
            sha256: mp4.sha256,
            sizeBytes: mp4.sizeBytes,
          },
        },
        source: {
          manifest: result.sourceManifest,
          objectKey: sourceKey,
          objectVersionId: source.versionId,
          sha256: source.sha256,
          sizeBytes: source.sizeBytes,
        },
      };
    },
    collectStepName: "collectRenderAndStoreAnimation",
    collectTimeoutMs: 40 * 60 * 1_000,
    db: input.db,
    environment: input.environment,
    failGeneration: failAnimationGeneration,
    instruction: animationAuthoringInstruction,
    kind: "Animation",
    async loadGeneration(artifactId, db) {
      const generation = await getAnimationGenerationInputById(artifactId, db);
      if (!generation) return null;
      return {
        actorId: generation.artifact.createdByPrincipalId,
        request: generation.request,
        startedAt: generation.attempt.startedAt?.toISOString() ?? null,
        title: generation.artifact.title,
      };
    },
    pool: input.pool,
    preCollectStage: "rendering",
    async publish({ actorId, artifactId, attemptId, content, publishInput }, db) {
      const artifact = await completeAnimationGeneration(
        { actorId, artifactId, attemptId, content, outputs: publishInput },
        db,
      );
      return {
        artifactId: artifact.id,
        revisionId: artifact.currentRevision.id,
      };
    },
    recipeVersion: "animation-remotion-v1",
    sourceManifestSchema: animationSourceManifestSchema,
    storage: input.storage,
    updateStage: updateAnimationStage,
    workflowName: ANIMATION_AUTHORING_DBOS_WORKFLOW,
  });
}
