import "server-only";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { type Database, database } from "@/database/client";
import { artifactGenerationAttempts, artifacts, workspaces } from "@/database/schema";
import { serverEnvironment } from "@/environment/server";
import type { Actor } from "@/features/identity/types";
import { taskAgentAttemptPhaseSchema } from "./attempt";
import { openHandsAuthoringEnvironment, openHandsRuntimeDebugLinks } from "./config.server";
import {
  createOpenHandsAuthoringClient,
  stableTaskAgentConversationId,
} from "./openhands-client.server";

const attemptIdSchema = z.string().uuid();

function eventTime(event: Record<string, unknown>) {
  for (const key of ["timestamp", "created_at", "createdAt", "time"]) {
    const value = event[key];
    if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return value;
  }
  return null;
}

export async function getTaskAgentAttemptDiagnostics(
  actor: Actor,
  attemptId: string,
  db: Database = database,
) {
  const parsedAttemptId = attemptIdSchema.parse(attemptId);
  const environment = serverEnvironment();
  const [row] = await db
    .select({
      artifactId: artifacts.id,
      authoringStartedAt: artifactGenerationAttempts.authoringStartedAt,
      failureCode: artifactGenerationAttempts.failureCode,
      failureDetail: artifactGenerationAttempts.failureDetail,
      finishedAt: artifactGenerationAttempts.finishedAt,
      kind: artifacts.kind,
      phase: artifactGenerationAttempts.phase,
      providerConversationId: artifactGenerationAttempts.providerConversationId,
      providerStatus: artifactGenerationAttempts.providerStatus,
      provisioningStartedAt: artifactGenerationAttempts.provisioningStartedAt,
      publishingStartedAt: artifactGenerationAttempts.publishingStartedAt,
      renderingStartedAt: artifactGenerationAttempts.renderingStartedAt,
      startedAt: artifactGenerationAttempts.startedAt,
      state: artifactGenerationAttempts.state,
      workspaceId: artifacts.workspaceId,
    })
    .from(artifactGenerationAttempts)
    .innerJoin(artifacts, eq(artifacts.id, artifactGenerationAttempts.artifactId))
    .innerJoin(workspaces, eq(workspaces.id, artifacts.workspaceId))
    .where(
      and(
        eq(artifactGenerationAttempts.id, parsedAttemptId),
        eq(workspaces.ownerId, actor.principalId),
      ),
    )
    .limit(1);
  if (!row || (row.kind !== "presentation" && row.kind !== "animation")) {
    throw new Error("task_agent_attempt_not_found");
  }

  const recipeVersion =
    row.kind === "presentation" ? "presentation-pptd-v1" : "animation-remotion-v1";
  const conversationId =
    row.providerConversationId ?? stableTaskAgentConversationId(recipeVersion, parsedAttemptId);
  let events: Array<Record<string, unknown>> = [];
  let remoteStatus = row.providerStatus;
  let runtimeUrl: string | null = null;
  let runtimeError: string | null = null;
  try {
    const authoringEnvironment = openHandsAuthoringEnvironment(
      environment,
      recipeVersion,
      parsedAttemptId,
    );
    runtimeUrl = authoringEnvironment.runtimeUrl;
    const client = createOpenHandsAuthoringClient(authoringEnvironment);
    const [conversation, eventPage] = await Promise.all([
      client.getConversation({ conversationId }),
      client.listEvents({ conversationId, limit: 10, order: "newest" }),
    ]);
    remoteStatus = conversation.found ? conversation.status : "missing";
    events = [...eventPage.items].reverse();
  } catch (error) {
    runtimeError = error instanceof Error ? error.message : "runtime_unavailable";
  }

  return {
    artifactId: row.artifactId,
    attemptId: parsedAttemptId,
    conversationId,
    events,
    failureCode: row.failureCode,
    failureDetail: row.failureDetail,
    kind: row.kind,
    lastEventAt: events.map(eventTime).filter(Boolean).at(-1) ?? null,
    links: {
      runtime: runtimeUrl,
      ...openHandsRuntimeDebugLinks(environment, parsedAttemptId),
    },
    phase: taskAgentAttemptPhaseSchema.nullable().parse(row.phase),
    remoteStatus,
    runtimeError,
    state: row.state,
    timings: {
      authoringStartedAt: row.authoringStartedAt?.toISOString() ?? null,
      finishedAt: row.finishedAt?.toISOString() ?? null,
      provisioningStartedAt: row.provisioningStartedAt?.toISOString() ?? null,
      publishingStartedAt: row.publishingStartedAt?.toISOString() ?? null,
      renderingStartedAt: row.renderingStartedAt?.toISOString() ?? null,
      startedAt: row.startedAt?.toISOString() ?? null,
    },
    workspaceId: row.workspaceId,
  };
}
