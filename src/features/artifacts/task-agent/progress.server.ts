import "server-only";

import { workerLogger } from "@/observability/server";
import { type ParsedPresentationProgress, parsePresentationProgressEvents } from "./progress";

const MAX_SEEN_PROGRESS_IDS = 1_000;

export type TaskAgentProgressLogContext = {
  artifactId: string;
  artifactKind: string;
  attemptId: string;
  component: "artifact-authoring";
  providerConversationId: string;
  workflowId: string;
};

export function observePresentationProgressEvents(input: {
  events: readonly unknown[];
  logContext: TaskAgentProgressLogContext;
  seenProgressIds: readonly string[];
}) {
  const seen = new Set(input.seenProgressIds);
  const parsedProgressEvents: ParsedPresentationProgress[] = [];
  for (const item of parsePresentationProgressEvents(input.events)) {
    if (seen.has(item.progressId)) continue;
    seen.add(item.progressId);
    parsedProgressEvents.push(item);
    const { issues, ...progress } = item.progress;
    try {
      workerLogger.info(
        {
          ...input.logContext,
          ...progress,
          ...(issues
            ? {
                boundsOutsideCount: issues.boundsOutside,
                overlapCount: issues.overlap,
                textOverflowCount: issues.textOverflow,
              }
            : {}),
          event: "artifact.authoring.progress",
          progressId: item.progressId,
          sourceEventId: item.observationEventId,
        },
        "Presentation authoring progress",
      );
    } catch {
      // Telemetry must not affect artifact generation.
    }
  }
  let condensationCount = 0;
  for (const event of input.events) {
    if (!event || typeof event !== "object") continue;
    const record = event as Record<string, unknown>;
    if (record.kind !== "Condensation" || typeof record.id !== "string" || !record.id) continue;
    const progressId = `condensation:${record.id}`;
    if (seen.has(progressId)) continue;
    seen.add(progressId);
    condensationCount += 1;
    try {
      workerLogger.info(
        {
          ...input.logContext,
          event: "artifact.authoring.condensation_observed",
          forgottenEventCount: Array.isArray(record.forgotten_event_ids)
            ? record.forgotten_event_ids.length
            : undefined,
          progressId,
          sourceEventId: record.id,
        },
        "Presentation authoring context condensation observed",
      );
    } catch {
      // Telemetry must not affect artifact generation.
    }
  }
  return {
    condensationCount,
    parsedProgressEvents,
    progressEvents: parsedProgressEvents.map((item) => item.progress),
    seenProgressIds: [...seen].slice(-MAX_SEEN_PROGRESS_IDS),
  };
}

export function logPresentationProgressEvents(input: {
  events: readonly unknown[];
  logContext: TaskAgentProgressLogContext;
  seenProgressIds: readonly string[];
}) {
  const { parsedProgressEvents: _parsedProgressEvents, ...result } =
    observePresentationProgressEvents(input);
  return result;
}
