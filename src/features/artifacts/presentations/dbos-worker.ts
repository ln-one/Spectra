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
import {
  PRESENTATION_COMPLETION_STANDARD,
  presentationAuthoringInputs,
  presentationAuthoringInstruction,
} from "./authoring-input";
import {
  type PresentationGenerationRequest,
  type PresentationRevisionContent,
  presentationSourceManifestSchema,
} from "./contract";
import { PRESENTATION_AUTHORING_DBOS_WORKFLOW } from "./dbos";
import { materializePresentationDraftEvent } from "./draft-preview.server";
import {
  PRESENTATION_DRAFT_MAX_FILE_BYTES,
  PRESENTATION_DRAFT_MAX_TOTAL_BYTES,
} from "./editor-policy";
import { inspectPresentationSourceArchive, runPresentationPipeline } from "./pipeline.server";
import { PRESENTATION_DRAFT_SEQUENCE_BASE, presentationDraftEventSchema } from "./realtime";
import {
  claimPresentationGeneration,
  completePresentationGeneration,
  failPresentationGeneration,
  getPresentationGenerationInputById,
  updatePresentationStage,
} from "./service";

type RegisterPresentationAuthoringInput = {
  client?: OpenHandsAuthoringClient;
  db: Database;
  environment?: OpenHandsAuthoringEnvironment;
  inspectSource?: typeof inspectPresentationSourceArchive;
  pool: Pool;
  runPipeline?: typeof runPresentationPipeline;
  storage?: ArtifactRenderStorage;
};

const PRESENTATION_CONTINUATION_MESSAGE = [
  "Finish the presentation task in the current workspace now. Do not report completion in a regular message.",
  PRESENTATION_COMPLETION_STANDARD,
  "Do not ask for human help. Call FinishTool when the hard correctness checks pass; warning-only findings must not delay delivery.",
].join("\n");

export function registerPresentationAuthoringDbosWorkflow(
  input: RegisterPresentationAuthoringInput,
) {
  const inspectSource = input.inspectSource ?? inspectPresentationSourceArchive;
  const pipeline = input.runPipeline ?? runPresentationPipeline;
  return registerTaskAgentAuthoringWorkflow<
    PresentationGenerationRequest,
    PresentationRevisionContent,
    null
  >({
    buildUploads(request) {
      const authoring = presentationAuthoringInputs(request);
      return [
        {
          body: authoring.brief,
          contentType: "application/json",
          path: "brief.json",
        },
        ...authoring.evidence.map(
          (file): TaskAgentAuthoringUpload => ({
            ...file,
            contentType: "text/markdown",
          }),
        ),
      ];
    },
    claimGeneration: claimPresentationGeneration,
    cleanupObjectKeys(artifactId, attemptId) {
      const prefix = `artifacts/${artifactId}/attempts/${attemptId}`;
      return [`${prefix}/source/final.tar.gz`];
    },
    client: input.client,
    async collect({ archive, artifactId, attemptId, summary, storage }) {
      await inspectSource(archive);
      const result = await pipeline({ archive, summary });
      const prefix = `artifacts/${artifactId}/attempts/${attemptId}`;
      const sourceKey = `${prefix}/source/final.tar.gz`;
      const source = await putImmutableArtifactObject(storage, {
        body: result.sourceArchive,
        contentType: "application/gzip",
        key: sourceKey,
      });
      return {
        content: result.content,
        publishInput: null,
        source: {
          manifest: result.sourceManifest,
          objectKey: sourceKey,
          objectVersionId: source.versionId,
          sha256: result.sourceArchiveSha256,
          sizeBytes: result.sourceArchive.byteLength,
        },
      };
    },
    collectStepName: "collectValidateAndStorePresentation",
    collectTimeoutMs: 300_000,
    db: input.db,
    environment: input.environment,
    failGeneration: failPresentationGeneration,
    finishRequirement: {
      continuationMessage: PRESENTATION_CONTINUATION_MESSAGE,
      maxContinuations: 2,
    },
    instruction: presentationAuthoringInstruction,
    kind: "Presentation",
    async loadGeneration(artifactId, db) {
      const generation = await getPresentationGenerationInputById(artifactId, db);
      if (!generation) return null;
      return {
        actorId: generation.artifact.createdByPrincipalId,
        request: generation.request,
        startedAt: generation.attempt.startedAt?.toISOString() ?? null,
        title: generation.artifact.title,
      };
    },
    pool: input.pool,
    progressStream: {
      eventSchema: presentationDraftEventSchema,
      materialize: materializePresentationDraftEvent,
      maxEventBytes: PRESENTATION_DRAFT_MAX_FILE_BYTES * 2 + 16 * 1024,
      maxTotalBytes: PRESENTATION_DRAFT_MAX_TOTAL_BYTES,
      sequenceBase: PRESENTATION_DRAFT_SEQUENCE_BASE,
    },
    async publish({ actorId, artifactId, attemptId, content, sourceObjectKey }, db) {
      const artifact = await completePresentationGeneration(
        { actorId, artifactId, attemptId, content },
        db,
      );
      return {
        artifactId: artifact.id,
        revisionId: artifact.currentRevision.id,
        sourceObjectKey,
      };
    },
    recipeVersion: "presentation-pptd-v1",
    salvageAuthoringFailure: true,
    sourceManifestSchema: presentationSourceManifestSchema,
    storage: input.storage,
    updateStage: updatePresentationStage,
    workflowName: PRESENTATION_AUTHORING_DBOS_WORKFLOW,
  });
}
