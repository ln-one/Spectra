import "server-only";

import { DBOS } from "@dbos-inc/dbos-sdk";
import { DrizzleDataSource } from "@dbos-inc/drizzle-datasource";
import { type Span, SpanStatusCode } from "@opentelemetry/api";
import { eq } from "drizzle-orm";
import type { Pool } from "pg";
import { z } from "zod";
import type { Database } from "@/database/client";
import * as databaseSchema from "@/database/schema";
import { ARTIFACT_DBOS_SCHEMA } from "@/features/artifacts/dbos-queue.server";
import { artifactDbosStreamKey } from "@/features/artifacts/dbos-realtime.server";
import {
  type ArtifactRenderStorage,
  createArtifactRenderStorage,
} from "@/features/artifacts/render-storage.server";
import {
  discardStagedArtifactSourceBundle,
  stageArtifactSourceBundle,
} from "@/features/artifacts/source-bundles.server";
import { workerLogger } from "@/observability/server";
import { applicationTracer } from "@/observability/tracing.server";
import { redactedTaskAgentFailureDetail, type TaskAgentAttemptPhase } from "./attempt";
import { waitForVerifiedTaskAgentFinish } from "./completion";
import { type OpenHandsAuthoringEnvironment, openHandsAuthoringEnvironment } from "./config.server";
import {
  createOpenHandsAuthoringClient,
  type OpenHandsAuthoringClient,
  stableTaskAgentConversationId,
} from "./openhands-client.server";
import {
  initialPresentationQualityBudgetState,
  type PresentationQualityBudgetState,
} from "./presentation-budget";
import type { ParsedPresentationProgress } from "./progress";
import { serializeTaskAgentProgressEvent } from "./progress-stream.server";
import type { TaskAgentRecipeVersion } from "./recipe";
import { isTransientTaskAgentError, registerTaskAgentRemoteSteps } from "./remote-steps.server";

type ActiveAuthoringStage = Extract<
  TaskAgentAttemptPhase,
  "authoring" | "provisioning" | "publishing" | "rendering"
>;

export type TaskAgentAuthoringUpload = {
  body: Uint8Array;
  contentType: string;
  path: string;
};

type TaskAgentStoredSource = {
  manifest: unknown;
  objectKey: string;
  objectVersionId: string;
  sha256: string;
  sizeBytes: number;
};

type LoadedGeneration<Request> = {
  actorId: string;
  request: Request;
  startedAt: string | null;
  title: string;
};

type CollectedGeneration<Content, PublishInput> = {
  content: Content;
  publishInput: PublishInput;
  source: TaskAgentStoredSource;
};

type PublishedGeneration = {
  artifactId: string;
  revisionId: string;
};

type RegisterTaskAgentAuthoringInput<Request extends { prompt: string }, Content, PublishInput> = {
  buildUploads(request: Request): TaskAgentAuthoringUpload[];
  claimGeneration(artifactId: string, attemptId: string, db: Database): Promise<unknown>;
  cleanupObjectKeys(artifactId: string, attemptId: string): string[];
  client?: OpenHandsAuthoringClient | undefined;
  collect(input: {
    archive: Uint8Array;
    artifactId: string;
    attemptId: string;
    summary: string;
    storage: ArtifactRenderStorage;
    title: string;
  }): Promise<CollectedGeneration<Content, PublishInput>>;
  collectStepName: string;
  collectTimeoutMs: number;
  db: Database;
  environment?: OpenHandsAuthoringEnvironment | undefined;
  instruction(): string;
  kind: "Animation" | "Presentation";
  loadGeneration(artifactId: string, db: Database): Promise<LoadedGeneration<Request> | null>;
  pool: Pool;
  preCollectStage?: ActiveAuthoringStage;
  progressStream?: {
    eventSchema: z.ZodType<{ sequence: number }>;
    materialize(input: {
      deliveredPagePaths: readonly string[];
      downloadFile(path: string, maxBytes?: number): Promise<Uint8Array>;
      isInitialEvent: boolean;
      progress: ParsedPresentationProgress["progress"];
      workspacePath: string;
    }): Promise<unknown>;
    maxEventBytes: number;
    maxTotalBytes: number;
    sequenceBase?: number;
  };
  publish(
    input: {
      actorId: string;
      artifactId: string;
      attemptId: string;
      content: Content;
      publishInput: PublishInput;
      sourceObjectKey: string;
    },
    db: Database,
  ): Promise<PublishedGeneration>;
  recipeVersion: TaskAgentRecipeVersion;
  // Publish whatever the agent already wrote when authoring fails, so the user
  // lands in the editor with the generated content instead of a dead-end
  // failure. The shared pipeline validation decides whether the draft is
  // publishable; an incomplete draft falls through to the normal failure path.
  salvageAuthoringFailure?: boolean;
  sourceManifestSchema: z.ZodType;
  storage?: ArtifactRenderStorage | undefined;
  updateStage(
    artifactId: string,
    attemptId: string,
    stage: ActiveAuthoringStage,
    db: Database,
  ): Promise<unknown>;
  failGeneration(
    artifactId: string,
    failureCode: string,
    attemptId: string,
    db: Database,
    failureDetail: string,
  ): Promise<unknown>;
  finishRequirement?: {
    continuationMessage: string;
    maxContinuations: number;
  };
  workflowName: string;
};

function nestedFailureCode(error: unknown, depth = 0): string | null {
  if (depth >= 6 || !error || typeof error !== "object") return null;
  if ("errors" in error && Array.isArray(Reflect.get(error, "errors"))) {
    const errors = Reflect.get(error, "errors") as unknown[];
    for (const nested of [...errors].reverse()) {
      const code = nestedFailureCode(nested, depth + 1);
      if (code) return code;
    }
  }
  const message = error instanceof Error ? error.message : null;
  if (message && /^[a-z0-9_]+$/.test(message) && message.length <= 100) return message;
  if ("cause" in error) {
    const cause = Reflect.get(error, "cause");
    if (cause !== error) {
      const code = nestedFailureCode(cause, depth + 1);
      if (code) return code;
    }
  }
  return null;
}

function normalizedFailureCode(error: unknown, artifactCode: string) {
  if (error instanceof z.ZodError) return `${artifactCode}_output_invalid`;
  const fallback = `${artifactCode}_authoring_failed`;
  const code = nestedFailureCode(error) ?? fallback;
  if (
    artifactCode === "presentation" &&
    (code === "task_agent_deadline_exceeded" || code === "presentation_remote_budget_exhausted")
  ) {
    return "presentation_agent_time_budget_exhausted";
  }
  return z
    .string()
    .regex(/^[a-z0-9_]+$/)
    .max(100)
    .catch(fallback)
    .parse(code);
}

export function registerTaskAgentAuthoringWorkflow<
  Request extends { prompt: string },
  Content,
  PublishInput,
>(input: RegisterTaskAgentAuthoringInput<Request, Content, PublishInput>) {
  const artifactCode = input.kind.toLowerCase();
  const environmentForAttempt = (attemptId: string) =>
    input.environment ?? openHandsAuthoringEnvironment(undefined, input.recipeVersion, attemptId);
  const clientForAttempt = (attemptId: string) =>
    input.client ?? createOpenHandsAuthoringClient(environmentForAttempt(attemptId));
  const storage = input.storage ?? createArtifactRenderStorage();
  const dataSource = new DrizzleDataSource<Database>(
    `spectra-${artifactCode}-product`,
    input.pool,
    databaseSchema,
    ARTIFACT_DBOS_SCHEMA,
  );
  const remote = registerTaskAgentRemoteSteps({
    clientForAttempt,
    name: input.kind,
    observePresentationProgress: input.kind === "Presentation",
  });
  const progressStream = input.progressStream;
  const materializeProgress = progressStream
    ? DBOS.registerStep(
        (
          attemptId: string,
          workspacePath: string,
          deadlineAt: string,
          progress: ParsedPresentationProgress["progress"],
          isInitialEvent: boolean,
          deliveredPagePaths: readonly string[],
        ) => {
          const client = clientForAttempt(attemptId);
          return progressStream.materialize({
            deliveredPagePaths,
            downloadFile: (path, maxBytes) =>
              client.downloadFile({
                deadlineAt,
                ...(maxBytes === undefined ? {} : { maxBytes }),
                path,
                signal: DBOS.stepStatus?.timeoutSignal,
              }),
            isInitialEvent,
            progress,
            workspacePath,
          });
        },
        {
          backoffRate: 2,
          intervalSeconds: 1,
          maxAttempts: 3,
          name: `materialize${input.kind}AuthoringProgress`,
          retriesAllowed: true,
          shouldRetry: isTransientTaskAgentError,
          timeoutMS: 30_000,
        },
      )
    : null;

  const loadGeneration = dataSource.registerTransaction(
    (artifactId: string) => input.loadGeneration(artifactId, dataSource.client),
    { name: `load${input.kind}Generation` },
  );
  const claimGeneration = dataSource.registerTransaction(
    (artifactId: string, attemptId: string) =>
      input.claimGeneration(artifactId, attemptId, dataSource.client),
    { name: `claim${input.kind}Generation` },
  );
  const setStage = dataSource.registerTransaction(
    (artifactId: string, attemptId: string, stage: ActiveAuthoringStage) =>
      input.updateStage(artifactId, attemptId, stage, dataSource.client),
    { name: `update${input.kind}AuthoringStage` },
  );
  const failGeneration = dataSource.registerTransaction(
    (artifactId: string, attemptId: string, code: string, detail: string) =>
      input.failGeneration(artifactId, code, attemptId, dataSource.client, detail),
    { name: `fail${input.kind}Authoring` },
  );
  const publishGeneration = dataSource.registerTransaction(
    (
      artifactId: string,
      attemptId: string,
      actorId: string,
      content: Content,
      publishInput: PublishInput,
      sourceObjectKey: string,
    ) =>
      input.publish(
        {
          actorId,
          artifactId,
          attemptId,
          content,
          publishInput,
          sourceObjectKey,
        },
        dataSource.client,
      ),
    { name: `publish${input.kind}Generation` },
  );
  const publishedAttempt = dataSource.registerTransaction(
    async (attemptId: string) => {
      const [bundle] = await dataSource.client
        .select({
          artifactId: databaseSchema.artifactSourceBundles.artifactId,
          revisionId: databaseSchema.artifactSourceBundles.artifactRevisionId,
          state: databaseSchema.artifactSourceBundles.state,
        })
        .from(databaseSchema.artifactSourceBundles)
        .where(eq(databaseSchema.artifactSourceBundles.generationAttemptId, attemptId))
        .limit(1);
      return bundle?.state === "published" && bundle.revisionId
        ? { artifactId: bundle.artifactId, revisionId: bundle.revisionId }
        : null;
    },
    { name: `loadPublished${input.kind}Attempt` },
  );
  const discardStagedSource = dataSource.registerTransaction(
    (attemptId: string) => discardStagedArtifactSourceBundle(attemptId, dataSource.client),
    { name: `discardStaged${input.kind}SourceBundle` },
  );
  const observeStageTransition = DBOS.registerStep(
    async (
      context: ReturnType<typeof taskAgentLogContext>,
      stage: ActiveAuthoringStage,
      previousStage: ActiveAuthoringStage | null,
      previousStageStartedAt: number | null,
    ) => {
      const changedAt = Date.now();
      try {
        workerLogger.info(
          {
            ...context,
            event: "artifact.authoring.stage_changed",
            previousStage,
            previousStageDurationMs:
              previousStageStartedAt === null
                ? undefined
                : Math.max(0, changedAt - previousStageStartedAt),
            stage,
            stageEventId: `${context.attemptId}:${stage}`,
          },
          `${input.kind} authoring stage changed`,
        );
      } catch {
        // Telemetry must not affect artifact generation.
      }
      return changedAt;
    },
    { name: `observe${input.kind}AuthoringStageTransition` },
  );
  const observeStageCompletion = DBOS.registerStep(
    async (
      context: ReturnType<typeof taskAgentLogContext>,
      stage: ActiveAuthoringStage,
      stageStartedAt: number,
      outcome: "failed" | "recovered" | "succeeded",
      failureCode?: string,
    ) => {
      try {
        workerLogger.info(
          {
            ...context,
            event: "artifact.authoring.stage_completed",
            failureCode,
            outcome,
            stage,
            stageDurationMs: Math.max(0, Date.now() - stageStartedAt),
            stageEventId: `${context.attemptId}:${stage}:${outcome}`,
          },
          `${input.kind} authoring stage completed`,
        );
      } catch {
        // Telemetry must not affect artifact generation.
      }
    },
    { name: `observe${input.kind}AuthoringStageCompletion` },
  );

  const uploadInputs = DBOS.registerStep(
    async (
      attemptId: string,
      workspacePath: string,
      uploads: TaskAgentAuthoringUpload[],
      deadlineAt: string,
    ) => {
      for (const upload of uploads) {
        await clientForAttempt(attemptId).uploadFile({
          body: upload.body,
          contentType: upload.contentType,
          deadlineAt,
          path: `${workspacePath}/${upload.path}`,
          ...(DBOS.stepStatus?.timeoutSignal ? { signal: DBOS.stepStatus.timeoutSignal } : {}),
        });
      }
    },
    {
      backoffRate: 2,
      intervalSeconds: 5,
      maxAttempts: 5,
      name: `upload${input.kind}AuthoringInputs`,
      retriesAllowed: true,
      shouldRetry: isTransientTaskAgentError,
      timeoutMS: 150_000,
    },
  );
  const collectAndStore = DBOS.registerStep(
    async (
      artifactId: string,
      attemptId: string,
      workspacePath: string,
      deadlineAt: string,
      summary: string,
      title: string,
    ) => {
      const downloaded = await clientForAttempt(attemptId).downloadArchive({
        deadlineAt,
        path: `${workspacePath}/out`,
        signal: DBOS.stepStatus?.timeoutSignal,
      });
      return input.collect({
        archive: downloaded.archive,
        artifactId,
        attemptId,
        summary,
        storage,
        title,
      });
    },
    {
      backoffRate: 2,
      intervalSeconds: 5,
      maxAttempts: 3,
      name: input.collectStepName,
      retriesAllowed: true,
      shouldRetry: isTransientTaskAgentError,
      timeoutMS: input.collectTimeoutMs,
    },
  );
  const stageSource = DBOS.registerStep(
    (artifactId: string, attemptId: string, source: TaskAgentStoredSource) =>
      stageArtifactSourceBundle(
        {
          artifactId,
          generationAttemptId: attemptId,
          manifest: input.sourceManifestSchema.parse(source.manifest),
          mediaType: "application/gzip",
          objectKey: source.objectKey,
          objectVersionId: source.objectVersionId,
          recipeVersion: input.recipeVersion,
          sha256: source.sha256,
          sizeBytes: source.sizeBytes,
        },
        input.db,
      ),
    { name: `stage${input.kind}SourceBundle` },
  );
  const deleteUnpublishedObjects = DBOS.registerStep(
    async (artifactId: string, attemptId: string) => {
      for (const key of input.cleanupObjectKeys(artifactId, attemptId)) {
        for (const versionId of await storage.listVersions({ key })) {
          await storage.delete({ key, versionId });
        }
      }
    },
    {
      backoffRate: 2,
      intervalSeconds: 5,
      maxAttempts: 5,
      name: `deleteUnpublished${input.kind}Objects`,
      retriesAllowed: true,
    },
  );

  function taskAgentLogContext(artifactId: string, attemptId: string, conversationId: string) {
    return {
      artifactId,
      artifactKind: artifactCode,
      attemptId,
      component: "artifact-authoring" as const,
      providerConversationId: conversationId,
      workflowId: DBOS.workflowID ?? attemptId,
    };
  }

  async function authorArtifactWithTracing(
    artifactId: string,
    attemptId: string,
    authoringSpan: Span,
  ) {
    const environment = environmentForAttempt(attemptId);
    const conversationId = stableTaskAgentConversationId(input.recipeVersion, attemptId);
    const workspacePath = `${environment.workspaceRoot}/${attemptId}`;
    let attemptStartedAt: string | null = null;
    let activeStage: ActiveAuthoringStage | null = null;
    let activeStageStartedAt: number | null = null;
    let condensationCount = 0;
    let conversationStarted = false;
    let qualityBudgetState: PresentationQualityBudgetState =
      initialPresentationQualityBudgetState();
    let seenProgressIds: string[] = [];
    let progressSequence = input.progressStream?.sequenceBase ?? 0;
    let progressStreamBytes = 0;
    // Pages already delivered to the draft preview stream. Passed to each
    // materialization so a page that failed once (or was edited outside the
    // hooked tool) is retried on the next progress event instead of being
    // stranded, while already-delivered pages are not re-sent needlessly.
    const deliveredPagePaths = new Set<string>();
    let progressDeadlineAt: string | null = null;
    const logContext = () => taskAgentLogContext(artifactId, attemptId, conversationId);
    const durationMs = () =>
      attemptStartedAt ? Math.max(0, Date.now() - new Date(attemptStartedAt).getTime()) : undefined;
    const setObservedStage = async (stage: ActiveAuthoringStage) => {
      authoringSpan.setAttribute("spectra.stage", stage);
      await setStage(artifactId, attemptId, stage);
      const previousStage = activeStage;
      const changedAt = await observeStageTransition(
        logContext(),
        stage,
        previousStage,
        activeStageStartedAt,
      );
      activeStage = stage;
      activeStageStartedAt = changedAt;
    };
    const completeObservedStage = async (
      outcome: "failed" | "recovered" | "succeeded",
      failureCode?: string,
    ) => {
      if (!activeStage || activeStageStartedAt === null) return;
      await observeStageCompletion(
        logContext(),
        activeStage,
        activeStageStartedAt,
        outcome,
        failureCode,
      );
    };
    const publishProgress = async (events: readonly ParsedPresentationProgress[]) => {
      if (!input.progressStream || !materializeProgress) return;
      for (const item of events) {
        try {
          const materialized = await materializeProgress(
            attemptId,
            workspacePath,
            progressDeadlineAt ?? new Date(Date.now() + 30_000).toISOString(),
            item.progress,
            progressSequence === (input.progressStream.sequenceBase ?? 0),
            [...deliveredPagePaths],
          );
          if (!Array.isArray(materialized)) continue;
          for (const pageEvent of materialized) {
            const event = input.progressStream.eventSchema.parse({
              ...pageEvent,
              sequence: progressSequence + 1,
            });
            const serialized = serializeTaskAgentProgressEvent(event, progressStreamBytes, {
              maxEventBytes: input.progressStream.maxEventBytes,
              maxTotalBytes: input.progressStream.maxTotalBytes,
            });
            await DBOS.writeStream(artifactDbosStreamKey(attemptId), serialized.body);
            progressStreamBytes = serialized.totalBytes;
            progressSequence = event.sequence;
            if (typeof pageEvent.pagePath === "string") {
              deliveredPagePaths.add(pageEvent.pagePath);
            }
          }
        } catch (error) {
          workerLogger.warn(
            {
              ...logContext(),
              event: "artifact.authoring.preview_unavailable",
              failureCode: normalizedFailureCode(error, `${artifactCode}_preview`),
              progressId: item.progressId,
            },
            `${input.kind} authoring preview update was unavailable`,
          );
        }
      }
    };
    try {
      let loaded = await loadGeneration(artifactId);
      if (!loaded) {
        authoringSpan.setStatus({ code: SpanStatusCode.OK });
        return null;
      }
      workerLogger.info(
        {
          ...logContext(),
          event: "artifact.authoring.started",
        },
        `${input.kind} authoring started`,
      );
      await claimGeneration(artifactId, attemptId);
      loaded = await loadGeneration(artifactId);
      if (!loaded?.startedAt) throw new Error(`${artifactCode}_attempt_start_missing`);
      attemptStartedAt = loaded.startedAt;
      const workflowDeadlineAt = new Date(
        new Date(loaded.startedAt).getTime() + environment.maxDurationMs,
      ).toISOString();
      const authoringDeadlineAt = new Date(
        new Date(workflowDeadlineAt).getTime() -
          (environment.presentationBudget?.collectionReserveMs ?? 0),
      ).toISOString();
      const authoringBudgetMs = Math.max(
        environment.pollIntervalMs,
        environment.maxDurationMs - (environment.presentationBudget?.collectionReserveMs ?? 0),
      );
      progressDeadlineAt = authoringDeadlineAt;
      await setObservedStage("provisioning");
      await remote.checkRuntime(attemptId, authoringDeadlineAt);
      await uploadInputs(
        attemptId,
        workspacePath,
        input.buildUploads(loaded.request),
        authoringDeadlineAt,
      );
      await setObservedStage("authoring");
      conversationStarted = true;
      await remote.createConversation(
        attemptId,
        conversationId,
        workspacePath,
        input.instruction(),
        authoringDeadlineAt,
      );
      const finishRequirement = input.finishRequirement;
      if (finishRequirement) {
        const finish = await waitForVerifiedTaskAgentFinish({
          async continueConversation(continuationCount) {
            workerLogger.info(
              {
                ...logContext(),
                continuationCount,
                event: "artifact.authoring.continuation_requested",
                reason: "agent_message_without_finish_action",
                terminalEventType: "agent_message",
              },
              `${input.kind} authoring requested continuation after an incomplete agent message`,
            );
            await remote.continueConversation(
              attemptId,
              conversationId,
              authoringDeadlineAt,
              finishRequirement.continuationMessage,
            );
          },
          async listNewestEvents() {
            return (await remote.listEvents(attemptId, conversationId, authoringDeadlineAt)).items;
          },
          maxContinuations: finishRequirement.maxContinuations,
          waitBeforeRecheck: () => DBOS.sleep(environment.pollIntervalMs),
          async waitForTerminal() {
            const terminal = await remote.wait({
              attemptId,
              conversationId,
              condensationCount,
              deadlineAt: authoringDeadlineAt,
              maxDurationMs: authoringBudgetMs,
              pollIntervalMs: environment.pollIntervalMs,
              logContext: logContext(),
              ...(environment.presentationBudget
                ? { presentationBudget: environment.presentationBudget, qualityBudgetState }
                : {}),
              onProgress: publishProgress,
              seenProgressIds,
            });
            seenProgressIds = terminal.seenProgressIds;
            condensationCount = terminal.condensationCount;
            qualityBudgetState = terminal.qualityBudgetState;
            workerLogger.info(
              {
                ...logContext(),
                event: "artifact.authoring.remote_terminal",
                remoteStatus: terminal.status,
              },
              `${input.kind} authoring remote task reached a terminal state`,
            );
            return terminal;
          },
        });
        if (finish.kind === "remote_terminal") {
          throw new Error(`${artifactCode}_remote_${finish.status}`);
        }
        if (finish.kind === "incomplete") {
          throw new Error(`${artifactCode}_agent_incomplete`);
        }
        workerLogger.info(
          {
            ...logContext(),
            continuationCount: finish.continuationCount,
            event: "artifact.authoring.finish_verified",
            terminalEventType: finish.evidence,
          },
          `${input.kind} authoring finish action verified`,
        );
      } else {
        const terminal = await remote.wait({
          attemptId,
          condensationCount,
          conversationId,
          deadlineAt: authoringDeadlineAt,
          maxDurationMs: authoringBudgetMs,
          pollIntervalMs: environment.pollIntervalMs,
          logContext: logContext(),
          onProgress: publishProgress,
          seenProgressIds,
        });
        seenProgressIds = terminal.seenProgressIds;
        condensationCount = terminal.condensationCount;
        workerLogger.info(
          {
            ...logContext(),
            event: "artifact.authoring.remote_terminal",
            remoteStatus: terminal.status,
          },
          `${input.kind} authoring remote task reached a terminal state`,
        );
        if (terminal.status !== "finished") {
          throw new Error(`${artifactCode}_remote_${terminal.status}`);
        }
      }
      if (input.preCollectStage) {
        await setObservedStage(input.preCollectStage);
      }
      const collected = await applicationTracer.startActiveSpan(
        "artifact.openhands.render",
        {
          attributes: {
            "spectra.artifact.id": artifactId,
            "spectra.artifact.kind": artifactCode,
            "spectra.attempt.id": attemptId,
            "spectra.stage": input.preCollectStage ?? "publishing",
            "spectra.workflow.id": DBOS.workflowID ?? attemptId,
          },
        },
        async (renderSpan) => {
          try {
            const result = await collectAndStore(
              artifactId,
              attemptId,
              workspacePath,
              workflowDeadlineAt,
              loaded.request.prompt,
              loaded.title,
            );
            renderSpan.setStatus({ code: SpanStatusCode.OK });
            return result;
          } catch (error) {
            const failureCode = normalizedFailureCode(error, `${artifactCode}_render`);
            renderSpan.setAttribute("spectra.failure.code", failureCode);
            renderSpan.setStatus({ code: SpanStatusCode.ERROR, message: failureCode });
            throw error;
          } finally {
            renderSpan.end();
          }
        },
      );
      await stageSource(artifactId, attemptId, collected.source);
      await setObservedStage("publishing");
      const published = await applicationTracer.startActiveSpan(
        "artifact.openhands.publish",
        {
          attributes: {
            "spectra.artifact.id": artifactId,
            "spectra.artifact.kind": artifactCode,
            "spectra.attempt.id": attemptId,
            "spectra.stage": "publishing",
            "spectra.workflow.id": DBOS.workflowID ?? attemptId,
          },
        },
        async (publishSpan) => {
          try {
            const result = await publishGeneration(
              artifactId,
              attemptId,
              loaded.actorId,
              collected.content,
              collected.publishInput,
              collected.source.objectKey,
            );
            publishSpan.setStatus({ code: SpanStatusCode.OK });
            return result;
          } catch (error) {
            const failureCode = normalizedFailureCode(error, `${artifactCode}_publish`);
            publishSpan.setAttribute("spectra.failure.code", failureCode);
            publishSpan.setStatus({ code: SpanStatusCode.ERROR, message: failureCode });
            throw error;
          } finally {
            publishSpan.end();
          }
        },
      );
      await completeObservedStage("succeeded");
      authoringSpan.setAttributes({
        "spectra.duration_ms": durationMs() ?? 0,
        "spectra.revision.id": published.revisionId,
      });
      authoringSpan.setStatus({ code: SpanStatusCode.OK });
      workerLogger.info(
        {
          ...logContext(),
          durationMs: durationMs(),
          event: "artifact.authoring.completed",
          revisionId: published.revisionId,
        },
        `${input.kind} authoring completed`,
      );
      return published;
    } catch (error) {
      const code = normalizedFailureCode(error, artifactCode);
      const published = await publishedAttempt(attemptId);
      if (published) {
        await completeObservedStage("recovered");
        authoringSpan.setAttributes({
          "spectra.duration_ms": durationMs() ?? 0,
          "spectra.recovery": true,
          "spectra.revision.id": published.revisionId,
        });
        authoringSpan.setStatus({ code: SpanStatusCode.OK });
        workerLogger.info(
          {
            ...logContext(),
            durationMs: durationMs(),
            event: "artifact.authoring.completed",
            recovery: true,
            revisionId: published.revisionId,
          },
          `${input.kind} authoring recovered a published attempt`,
        );
        return published;
      }
      let conversationInterrupted = false;
      const interruptRemoteConversation = async () => {
        if (!conversationStarted || conversationInterrupted) return;
        conversationInterrupted = true;
        workerLogger.info(
          {
            ...logContext(),
            event: "artifact.authoring.interrupt_requested",
            failureCode: code,
          },
          `${input.kind} authoring requested remote interruption`,
        );
        try {
          await remote.stopConversation(attemptId, conversationId);
          workerLogger.info(
            {
              ...logContext(),
              event: "artifact.authoring.interrupt_completed",
              failureCode: code,
            },
            `${input.kind} authoring remote interruption completed`,
          );
        } catch (interruptError) {
          workerLogger.warn(
            {
              ...logContext(),
              error: interruptError,
              event: "artifact.authoring.interrupt_failed",
              failureCode: code,
            },
            `${input.kind} authoring remote interruption failed`,
          );
        }
      };
      // A failed authoring run often still has a complete draft in the
      // workspace, for example when the visual repair budget runs out after
      // every page was written. Publish that draft through the regular
      // pipeline so the user lands in the editor with the generated content
      // instead of a dead-end failure; pipeline validation rejects incomplete
      // drafts and falls through to the normal failure path.
      const salvageLoaded =
        input.salvageAuthoringFailure && conversationStarted
          ? await loadGeneration(artifactId)
          : null;
      if (salvageLoaded?.startedAt) {
        const salvageDeadlineAt = new Date(
          new Date(salvageLoaded.startedAt).getTime() + environment.maxDurationMs,
        ).toISOString();
        await interruptRemoteConversation();
        try {
          const collected = await collectAndStore(
            artifactId,
            attemptId,
            workspacePath,
            salvageDeadlineAt,
            salvageLoaded.request.prompt,
            salvageLoaded.title,
          );
          await stageSource(artifactId, attemptId, collected.source);
          await setObservedStage("publishing");
          const salvaged = await publishGeneration(
            artifactId,
            attemptId,
            salvageLoaded.actorId,
            collected.content,
            collected.publishInput,
            collected.source.objectKey,
          );
          await completeObservedStage("recovered", code);
          authoringSpan.setAttributes({
            "spectra.duration_ms": durationMs() ?? 0,
            "spectra.revision.id": salvaged.revisionId,
            "spectra.salvage": true,
            "spectra.salvage.failure_code": code,
          });
          authoringSpan.setStatus({ code: SpanStatusCode.OK });
          workerLogger.info(
            {
              ...logContext(),
              durationMs: durationMs(),
              event: "artifact.authoring.salvaged",
              failureCode: code,
              revisionId: salvaged.revisionId,
            },
            `${input.kind} authoring salvaged a publishable draft after failure`,
          );
          return salvaged;
        } catch (salvageError) {
          workerLogger.warn(
            {
              ...logContext(),
              error: salvageError,
              event: "artifact.authoring.salvage_unavailable",
              failureCode: code,
            },
            `${input.kind} authoring salvage did not produce a publishable draft`,
          );
          // The salvage publish transaction can commit to the product database
          // before its output is recorded, so a crashed run replays it and the
          // re-executed completion guard throws even though the revision is
          // already published. Recover in that case instead of deleting the
          // source object the published revision references.
          const salvagedPublished = await publishedAttempt(attemptId);
          if (salvagedPublished) {
            await completeObservedStage("recovered", code);
            authoringSpan.setAttributes({
              "spectra.duration_ms": durationMs() ?? 0,
              "spectra.revision.id": salvagedPublished.revisionId,
              "spectra.salvage": true,
              "spectra.salvage.failure_code": code,
            });
            authoringSpan.setStatus({ code: SpanStatusCode.OK });
            workerLogger.info(
              {
                ...logContext(),
                durationMs: durationMs(),
                event: "artifact.authoring.salvaged",
                failureCode: code,
                recovery: true,
                revisionId: salvagedPublished.revisionId,
              },
              `${input.kind} authoring recovered a salvage publish that committed before replay`,
            );
            return salvagedPublished;
          }
        }
      }
      await interruptRemoteConversation();
      await deleteUnpublishedObjects(artifactId, attemptId);
      await discardStagedSource(attemptId);
      await failGeneration(artifactId, attemptId, code, redactedTaskAgentFailureDetail(error));
      await completeObservedStage("failed", code);
      authoringSpan.setAttributes({
        "spectra.duration_ms": durationMs() ?? 0,
        "spectra.failure.code": code,
      });
      authoringSpan.setStatus({ code: SpanStatusCode.ERROR, message: code });
      workerLogger.error(
        {
          ...logContext(),
          durationMs: durationMs(),
          error,
          event: "artifact.authoring.failed",
          failureCode: code,
        },
        `${input.kind} authoring failed`,
      );
      return null;
    } finally {
      if (input.progressStream) {
        await DBOS.closeStream(artifactDbosStreamKey(attemptId)).catch(() => undefined);
      }
    }
  }

  async function authorArtifact(artifactId: string, attemptId: string) {
    return applicationTracer.startActiveSpan(
      "artifact.openhands.authoring",
      {
        attributes: {
          "gen_ai.operation.name": "invoke_agent",
          "gen_ai.provider.name": "openhands",
          "spectra.artifact.id": artifactId,
          "spectra.artifact.kind": artifactCode,
          "spectra.attempt.id": attemptId,
          "spectra.recipe.version": input.recipeVersion,
          "spectra.workflow.id": DBOS.workflowID ?? attemptId,
        },
      },
      async (authoringSpan) => {
        authoringSpan.setAttribute("spectra.stage", "initializing");
        try {
          return await authorArtifactWithTracing(artifactId, attemptId, authoringSpan);
        } catch (error) {
          const failureCode = normalizedFailureCode(error, `${artifactCode}_authoring`);
          authoringSpan.setAttribute("spectra.failure.code", failureCode);
          authoringSpan.setStatus({ code: SpanStatusCode.ERROR, message: failureCode });
          throw error;
        } finally {
          authoringSpan.end();
        }
      },
    );
  }

  return DBOS.registerWorkflow(authorArtifact, {
    inputSchema: z.tuple([z.string().uuid(), z.string().uuid()]),
    name: input.workflowName,
    serialization: "portable",
  });
}
