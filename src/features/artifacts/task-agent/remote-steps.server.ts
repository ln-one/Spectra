import "server-only";

import { DBOS } from "@dbos-inc/dbos-sdk";
import { workerLogger } from "@/observability/server";
import { waitForTaskAgentTerminal } from "./executor";
import type { OpenHandsAuthoringClient, OpenHandsTokenUsage } from "./openhands-client.server";
import {
  latestPresentationAgentActivityAt,
  presentationAgentStalled,
} from "./presentation-activity";
import {
  applyPresentationQualityProgress,
  initialPresentationQualityBudgetState,
  type PresentationQualityBudgetState,
  type PresentationQualityWarning,
  presentationTokenBudgetFailure,
  totalConversationTokens,
} from "./presentation-budget";
import { type ParsedPresentationProgress, parsePresentationProgressEvents } from "./progress";
import {
  observePresentationProgressEvents,
  type TaskAgentProgressLogContext,
} from "./progress.server";

const PROGRESS_EVENT_PAGE_SIZE = 100;
const MAX_PROGRESS_EVENT_PAGES = 10;
const MAX_TERMINAL_PROGRESS_DRAIN_BATCHES = 4;
const PROGRESS_OBSERVATION_BUDGET_MS = 5_000;

type PresentationRemoteBudget = {
  maxAccumulatedTokens: number;
  maxFailedVisualChecks: number;
  maxStalledVisualChecks: number;
};

function httpStatus(error: unknown) {
  return error && typeof error === "object" && "status" in error
    ? Number(Reflect.get(error, "status"))
    : null;
}

function transientTaskAgentError(error: unknown, depth: number): boolean {
  const status = httpStatus(error);
  if (status) return status === 408 || status === 429 || status >= 500;
  if (error instanceof TypeError) return true;
  if (
    ["AbortError", "TimeoutError"].includes(
      error && typeof error === "object" && "name" in error
        ? String(Reflect.get(error, "name"))
        : "",
    )
  ) {
    return true;
  }
  if (depth >= 4 || !error || typeof error !== "object" || !("cause" in error)) return false;
  const cause = Reflect.get(error, "cause");
  return cause !== error && transientTaskAgentError(cause, depth + 1);
}

export function isTransientTaskAgentError(error: unknown) {
  return transientTaskAgentError(error, 0);
}

export function registerTaskAgentRemoteSteps(input: {
  clientForAttempt: (attemptId: string) => OpenHandsAuthoringClient;
  name: "Animation" | "Presentation";
  observePresentationProgress?: boolean;
  stepNamePrefix?: string;
}) {
  const stepName = (name: string) => `${input.stepNamePrefix ?? ""}${name}`;
  const stepOptions = {
    backoffRate: 2,
    intervalSeconds: 5,
    maxAttempts: 3,
    retriesAllowed: true,
    shouldRetry: isTransientTaskAgentError,
    timeoutMS: 45_000,
  } as const;

  const checkRuntime = DBOS.registerStep(
    (attemptId: string, deadlineAt: string) =>
      input
        .clientForAttempt(attemptId)
        .getServerInfo({ deadlineAt, signal: DBOS.stepStatus?.timeoutSignal }),
    { ...stepOptions, name: stepName(`check${input.name}OpenHandsRuntime`) },
  );
  const createConversation = DBOS.registerStep(
    (
      attemptId: string,
      conversationId: string,
      workspacePath: string,
      instruction: string,
      deadlineAt: string,
    ) =>
      input.clientForAttempt(attemptId).createConversation({
        conversationId,
        deadlineAt,
        instruction,
        signal: DBOS.stepStatus?.timeoutSignal,
        workspacePath,
      }),
    { ...stepOptions, name: stepName(`create${input.name}OpenHandsConversation`) },
  );
  const getConversation = DBOS.registerStep(
    (attemptId: string, conversationId: string, deadlineAt: string) =>
      input.clientForAttempt(attemptId).getConversation({
        conversationId,
        deadlineAt,
        signal: DBOS.stepStatus?.timeoutSignal,
      }),
    { ...stepOptions, name: stepName(`get${input.name}OpenHandsConversation`) },
  );
  const listEvents = DBOS.registerStep(
    (attemptId: string, conversationId: string, deadlineAt: string) =>
      input.clientForAttempt(attemptId).listEvents({
        conversationId,
        deadlineAt,
        limit: 50,
        order: "newest",
        signal: DBOS.stepStatus?.timeoutSignal,
      }),
    { ...stepOptions, name: stepName(`list${input.name}OpenHandsEvents`) },
  );
  const observeProgress = input.observePresentationProgress
    ? DBOS.registerStep(
        async (
          attemptId: string,
          conversationId: string,
          scanDeadlineAt: string,
          authoringDeadlineAt: string,
          logContext: TaskAgentProgressLogContext,
          seenProgressIds: string[],
          resumeCursor: string | null,
          requiredForBudget: boolean,
        ) => {
          try {
            const pages: Array<Array<Record<string, unknown>>> = [];
            let cursor = resumeCursor;
            let nextCursor: string | null = resumeCursor;
            const visitedCursors = new Set<string | null>();
            const seen = new Set(seenProgressIds);
            const scanDeadline = Date.parse(scanDeadlineAt);
            const progressDeadlineAt = new Date(
              Math.min(
                Number.isFinite(scanDeadline) ? scanDeadline : Number.POSITIVE_INFINITY,
                Date.now() + PROGRESS_OBSERVATION_BUDGET_MS,
              ),
            ).toISOString();
            for (let page = 0; page < MAX_PROGRESS_EVENT_PAGES; page += 1) {
              if (visitedCursors.has(cursor)) {
                nextCursor = null;
                break;
              }
              visitedCursors.add(cursor);
              const events = await input.clientForAttempt(attemptId).listEvents({
                conversationId,
                cursor,
                deadlineAt: progressDeadlineAt,
                limit: PROGRESS_EVENT_PAGE_SIZE,
                order: "newest",
                signal: DBOS.stepStatus?.timeoutSignal,
              });
              if (events.items.length === 0) {
                nextCursor = null;
                break;
              }
              pages.push(events.items);
              if (
                parsePresentationProgressEvents(events.items).some((item) =>
                  seen.has(item.progressId),
                )
              ) {
                nextCursor = null;
                break;
              }
              if (
                events.items.length < PROGRESS_EVENT_PAGE_SIZE ||
                !events.cursor ||
                events.cursor === cursor
              ) {
                nextCursor = null;
                break;
              }
              cursor = events.cursor;
              nextCursor = events.cursor;
            }
            const chronologicalEvents = pages.reverse().flatMap((page) => [...page].reverse());
            const observed = observePresentationProgressEvents({
              events: chronologicalEvents,
              logContext,
              seenProgressIds,
            });
            return {
              condensationCount: observed.condensationCount,
              eventsAvailable: true,
              latestAgentActivityAt: latestPresentationAgentActivityAt(chronologicalEvents),
              nextCursor,
              parsedProgressEvents: observed.parsedProgressEvents,
              progressEvents: observed.progressEvents,
              seenProgressIds: observed.seenProgressIds,
            };
          } catch (error) {
            if (requiredForBudget) {
              const deadlineRemainingMs = Date.parse(authoringDeadlineAt) - Date.now();
              if (deadlineRemainingMs <= 1_000) {
                throw new Error("presentation_agent_time_budget_exhausted", { cause: error });
              }
            }
            try {
              workerLogger.warn(
                {
                  ...logContext,
                  event: "artifact.authoring.progress_unavailable",
                  failureCode: "presentation_progress_unavailable",
                  progressRequiredForBudget: requiredForBudget,
                },
                "Presentation progress events were temporarily unavailable",
              );
            } catch {
              // Telemetry must not affect artifact generation.
            }
            return {
              condensationCount: 0,
              eventsAvailable: false,
              latestAgentActivityAt: null,
              nextCursor: null,
              parsedProgressEvents: [],
              progressEvents: [],
              seenProgressIds,
            };
          }
        },
        { ...stepOptions, name: stepName(`observe${input.name}OpenHandsProgress`) },
      )
    : null;
  const terminalProgressDeadline = input.observePresentationProgress
    ? DBOS.registerStep(
        async (authoringDeadlineAt: string) => {
          const now = Date.now();
          const latestProgressDeadline = Date.parse(authoringDeadlineAt);
          if (!Number.isFinite(latestProgressDeadline) || latestProgressDeadline <= now)
            return null;
          return new Date(
            Math.min(latestProgressDeadline, now + PROGRESS_OBSERVATION_BUDGET_MS),
          ).toISOString();
        },
        { name: stepName(`reserve${input.name}TerminalProgressBudget`) },
      )
    : null;
  const continueConversation = DBOS.registerStep(
    (
      attemptId: string,
      conversationId: string,
      deadlineAt: string,
      message: string,
      idempotencyKey?: string,
    ) =>
      input.clientForAttempt(attemptId).continueConversation({
        conversationId,
        deadlineAt,
        ...(idempotencyKey ? { idempotencyKey } : {}),
        message,
        signal: DBOS.stepStatus?.timeoutSignal,
      }),
    { ...stepOptions, name: stepName(`continue${input.name}OpenHandsConversation`) },
  );
  const stopConversation = DBOS.registerStep(
    (attemptId: string, conversationId: string) =>
      input.clientForAttempt(attemptId).stopConversation({
        conversationId,
        signal: DBOS.stepStatus?.timeoutSignal,
      }),
    { ...stepOptions, name: stepName(`stop${input.name}OpenHandsConversation`) },
  );

  return {
    checkRuntime,
    continueConversation,
    createConversation,
    listEvents,
    stopConversation,
    async wait(waitInput: {
      attemptId: string;
      conversationId: string;
      maxDurationMs: number;
      pollIntervalMs: number;
      deadlineAt: string;
      logContext?: TaskAgentProgressLogContext;
      condensationCount?: number;
      presentationBudget?: PresentationRemoteBudget;
      qualityBudgetState?: PresentationQualityBudgetState;
      onProgress?: (events: readonly ParsedPresentationProgress[]) => Promise<void>;
      seenProgressIds?: string[];
    }) {
      let seenProgressIds = waitInput.seenProgressIds ?? [];
      let progressCursor: string | null = null;
      let qualityBudgetState =
        waitInput.qualityBudgetState ?? initialPresentationQualityBudgetState();
      let condensationCount = waitInput.condensationCount ?? 0;
      let latestAgentActivityAt = Date.now();
      let progressEventsAvailable = false;
      let latestUsageById: Record<string, OpenHandsTokenUsage> = {};
      const reportedQualityWarnings = new Set<PresentationQualityWarning>();
      const failBudget = (failureCode: string) => {
        if (waitInput.logContext) {
          workerLogger.warn(
            {
              ...waitInput.logContext,
              condensationCount,
              event: "artifact.authoring.budget_exhausted",
              failedVisualChecks: qualityBudgetState.failedChecks,
              failureCode,
              stalledVisualChecks: qualityBudgetState.stalledChecks,
              totalTokens: totalConversationTokens(latestUsageById),
            },
            "Presentation authoring budget exhausted",
          );
        }
        throw new Error(failureCode);
      };
      const reportQualityWarning = (warningCode: PresentationQualityWarning) => {
        if (reportedQualityWarnings.has(warningCode)) return;
        reportedQualityWarnings.add(warningCode);
        if (!waitInput.logContext) return;
        workerLogger.warn(
          {
            ...waitInput.logContext,
            event: "artifact.authoring.quality_warning",
            failedVisualChecks: qualityBudgetState.failedChecks,
            stalledVisualChecks: qualityBudgetState.stalledChecks,
            warningCode,
          },
          "Presentation visual warning budget reached; validating the current draft for publish",
        );
      };
      const inspectProgress = async (progressDeadlineAt = waitInput.deadlineAt) => {
        if (!observeProgress || !waitInput.logContext) return;
        const progress = await observeProgress(
          waitInput.attemptId,
          waitInput.conversationId,
          progressDeadlineAt,
          waitInput.deadlineAt,
          waitInput.logContext,
          seenProgressIds,
          progressCursor,
          Boolean(waitInput.presentationBudget),
        );
        seenProgressIds = progress.seenProgressIds;
        progressCursor = progress.nextCursor;
        condensationCount += progress.condensationCount;
        progressEventsAvailable = progress.eventsAvailable;
        latestAgentActivityAt = Math.max(
          latestAgentActivityAt,
          progress.latestAgentActivityAt ?? latestAgentActivityAt,
        );
        if (waitInput.presentationBudget) {
          const quality = applyPresentationQualityProgress(
            qualityBudgetState,
            progress.progressEvents,
            {
              maxFailedChecks: waitInput.presentationBudget.maxFailedVisualChecks,
              maxStalledChecks: waitInput.presentationBudget.maxStalledVisualChecks,
            },
          );
          qualityBudgetState = quality.state;
          if (quality.warning) {
            reportQualityWarning(quality.warning);
            failBudget(quality.warning);
          }
        }
        if (progress.parsedProgressEvents.length > 0) {
          await waitInput.onProgress?.(progress.parsedProgressEvents);
        }
      };
      const failStalledPresentationAgent = (status: string) => {
        if (
          !waitInput.presentationBudget ||
          !progressEventsAvailable ||
          !presentationAgentStalled(latestAgentActivityAt, Date.now(), status)
        ) {
          return;
        }
        if (waitInput.logContext) {
          workerLogger.warn(
            {
              ...waitInput.logContext,
              event: "artifact.authoring.agent_stalled",
              failureCode: "presentation_agent_stalled",
              inactivityMs: Math.max(0, Date.now() - latestAgentActivityAt),
            },
            "Presentation authoring stopped after five minutes without agent activity",
          );
        }
        throw new Error("presentation_agent_stalled");
      };
      const terminal = await waitForTaskAgentTerminal({
        budget: { pollIntervalMs: waitInput.pollIntervalMs },
        inspect: async () => {
          const result = await getConversation(
            waitInput.attemptId,
            waitInput.conversationId,
            waitInput.deadlineAt,
          );
          if (result.found) {
            latestUsageById = result.usageById;
            const tokenFailure = waitInput.presentationBudget
              ? presentationTokenBudgetFailure(
                  result.usageById,
                  waitInput.presentationBudget.maxAccumulatedTokens,
                )
              : null;
            if (tokenFailure) failBudget(tokenFailure);
          }
          if (result.found && (result.status === "idle" || result.status === "running")) {
            await inspectProgress();
            failStalledPresentationAgent(result.status);
          }
          if (waitInput.logContext && waitInput.presentationBudget) {
            const agentUsage = latestUsageById["spectra-presentation-agent"];
            const condenserUsage = latestUsageById["spectra-presentation-condenser"];
            workerLogger.info(
              {
                ...waitInput.logContext,
                agentTokens: agentUsage ? agentUsage.promptTokens + agentUsage.completionTokens : 0,
                condensationCount,
                condenserTokens: condenserUsage
                  ? condenserUsage.promptTokens + condenserUsage.completionTokens
                  : 0,
                event: "artifact.authoring.budget_snapshot",
                failedVisualChecks: qualityBudgetState.failedChecks,
                stalledVisualChecks: qualityBudgetState.stalledChecks,
                totalTokens: totalConversationTokens(latestUsageById),
              },
              "Presentation authoring budget snapshot",
            );
          }
          return result.found
            ? { found: true as const, status: result.status }
            : { found: false as const, status: null };
        },
        remainingPolls: Math.ceil(waitInput.maxDurationMs / waitInput.pollIntervalMs),
        sleep: DBOS.sleep,
      });
      const terminalProgressDeadlineAt = terminalProgressDeadline
        ? await terminalProgressDeadline(waitInput.deadlineAt)
        : null;
      if (
        waitInput.presentationBudget &&
        terminalProgressDeadlineAt === null &&
        observeProgress !== null
      ) {
        failBudget("presentation_agent_time_budget_exhausted");
      }
      progressCursor = null;
      if (terminalProgressDeadlineAt) {
        await inspectProgress(terminalProgressDeadlineAt);
      }
      const drainedCursors = new Set<string>();
      let drainBatches = 0;
      while (
        terminalProgressDeadlineAt &&
        progressCursor &&
        drainBatches < MAX_TERMINAL_PROGRESS_DRAIN_BATCHES &&
        !drainedCursors.has(progressCursor)
      ) {
        drainedCursors.add(progressCursor);
        drainBatches += 1;
        await inspectProgress(terminalProgressDeadlineAt);
      }
      const drainWasTruncated =
        progressCursor !== null ||
        (terminalProgressDeadlineAt === null && observeProgress !== null);

      // New events can arrive while an older cursor is being drained. Rescan the head once so
      // final conversion, screenshot, and check markers are not stranded ahead of that cursor.
      progressCursor = null;
      if (terminalProgressDeadlineAt) {
        await inspectProgress(terminalProgressDeadlineAt);
      }
      if (drainWasTruncated || progressCursor !== null) {
        if (waitInput.presentationBudget) failBudget("presentation_progress_unavailable");
        try {
          workerLogger.warn(
            {
              ...waitInput.logContext,
              event: "artifact.authoring.progress_truncated",
              failureCode: "presentation_progress_scan_limit",
            },
            "Presentation progress scan reached its telemetry-only limit",
          );
        } catch {
          // Telemetry must not affect artifact generation.
        }
      }
      if (waitInput.presentationBudget && terminal.status === "budget_exhausted") {
        failBudget("presentation_agent_time_budget_exhausted");
      }
      return { ...terminal, condensationCount, qualityBudgetState, seenProgressIds };
    },
  };
}
