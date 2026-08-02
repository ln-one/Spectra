import "server-only";

import { DBOS } from "@dbos-inc/dbos-sdk";
import { database, productPool } from "@/database/client";
import { DBOS_MAINTENANCE_QUEUE } from "@/database/dbos";
import { databasePoolProfiles } from "@/database/pool-profiles";
import { databaseUrl } from "@/database/url";
import { type ServerEnvironment, serverEnvironment } from "@/environment/server";
import { registerArtifactPlanDbosWorkflow } from "@/features/agents/artifact-plan-dbos-worker.server";
import { registerAnimationAuthoringDbosWorkflow } from "@/features/artifacts/animations/dbos-worker";
import { ARTIFACT_DBOS_SCHEMA } from "@/features/artifacts/dbos-queue.server";
import { registerTeachingDocumentDbosWorkflow } from "@/features/artifacts/documents/dbos-worker";
import { registerArtifactSuggestionDbosWorkflows } from "@/features/artifacts/documents/suggestion-dbos-worker";
import { artifactDbosExecutorId } from "@/features/artifacts/executor-identity";
import { registerGameDbosWorkflow } from "@/features/artifacts/games/dbos-worker";
import { registerMindMapDbosWorkflow } from "@/features/artifacts/mind-maps/dbos-worker";
import { registerPresentationAuthoringDbosWorkflow } from "@/features/artifacts/presentations/dbos-worker";
import { registerPresentationRefinementDbosWorkflow } from "@/features/artifacts/presentations/refine-dbos-worker";
import { registerQuizDbosWorkflow } from "@/features/artifacts/quizzes/dbos-worker";
import { registerArtifactRenderDbosWorkflow } from "@/features/artifacts/render-dbos-worker";
import {
  animationExecutionEnabled,
  openHandsExecutionEnabled,
} from "@/features/artifacts/task-agent/config.server";
import { knowledgeEnvironment, knowledgeIndexingEnabled } from "@/features/knowledge/config";
import { queueKnowledgeIndexForIngestion } from "@/features/knowledge/dbos";
import { registerKnowledgeIndexingDbosWorkflow } from "@/features/knowledge/dbos-worker";
import { registerCleanupDbosWorkflows } from "@/features/maintenance/cleanup-dbos-worker";
import { registerSourceIngestionDbosWorkflow } from "@/features/sources/ingestion/dbos-worker";
import { DbosPinoLogger } from "@/observability/dbos.server";
import { assertDbosQueuesRegistered, DBOS_QUEUE_NAMES } from "./dbos-queues.server";
import type { DbosScheduleDefinition } from "./dbos-schedules";

let workflowsRegistered = false;

function registerWorkerWorkflows(): DbosScheduleDefinition[] {
  if (workflowsRegistered) return [];
  const knowledgeEnabled = knowledgeIndexingEnabled();
  if (knowledgeEnabled) knowledgeEnvironment();
  registerArtifactPlanDbosWorkflow();
  registerTeachingDocumentDbosWorkflow({ db: database, pool: productPool });
  registerMindMapDbosWorkflow({ db: database, pool: productPool });
  registerQuizDbosWorkflow({ db: database, pool: productPool });
  registerGameDbosWorkflow({ db: database, pool: productPool });
  if (openHandsExecutionEnabled()) {
    registerPresentationAuthoringDbosWorkflow({ db: database, pool: productPool });
    registerPresentationRefinementDbosWorkflow({ db: database, pool: productPool });
  }
  if (animationExecutionEnabled()) {
    registerAnimationAuthoringDbosWorkflow({ db: database, pool: productPool });
  }
  const suggestionSchedules = registerArtifactSuggestionDbosWorkflows({
    db: database,
    maintenanceQueueName: DBOS_MAINTENANCE_QUEUE,
    pool: productPool,
  });
  registerArtifactRenderDbosWorkflow({ db: database });
  const scheduleReadyIngestion = async (ingestionId: string) => {
    await queueKnowledgeIndexForIngestion(ingestionId, productPool);
  };
  registerSourceIngestionDbosWorkflow({
    db: database,
    knowledgeIndexingEnabled: knowledgeEnabled,
    pool: productPool,
    scheduleReadyIngestion,
  });
  const knowledgeSchedules = registerKnowledgeIndexingDbosWorkflow(productPool);
  const cleanupSchedules = registerCleanupDbosWorkflows({ db: database });
  workflowsRegistered = true;
  return [...suggestionSchedules, ...knowledgeSchedules, ...cleanupSchedules];
}

export async function startDbosRuntime(environment: ServerEnvironment = serverEnvironment()) {
  await assertDbosQueuesRegistered(productPool);
  const schedules = registerWorkerWorkflows();
  DBOS.setConfig({
    executorID: artifactDbosExecutorId(),
    listenQueues: [...DBOS_QUEUE_NAMES],
    logger: new DbosPinoLogger(),
    name: "spectra-worker",
    otelAttributeFormat: "semconv",
    runAdminServer: false,
    systemDatabasePoolSize: databasePoolProfiles.artifactWorkflowSystem.max,
    systemDatabaseSchemaName: ARTIFACT_DBOS_SCHEMA,
    systemDatabaseUrl: databaseUrl(),
    tracingEnabled: Boolean(environment.OTEL_EXPORTER_OTLP_ENDPOINT),
    useListenNotify: true,
  });
  await DBOS.launch();
  await DBOS.applySchedules(schedules);
}

export async function stopDbosRuntime() {
  await DBOS.shutdown();
}
