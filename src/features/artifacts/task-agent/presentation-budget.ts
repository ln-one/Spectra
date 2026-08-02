import type { OpenHandsTokenUsage } from "./openhands-client.server";
import type { PresentationProgress } from "./progress";

type PresentationIssueCounts = {
  boundsOutside: number;
  overlap: number;
  textOverflow: number;
};

export type PresentationQualityBudgetState = {
  failedChecks: number;
  previousIssues: PresentationIssueCounts | null;
  stalledChecks: number;
};

// These thresholds stop an unproductive repair loop and emit advisory telemetry. They are not a
// publish gate; structural pipeline errors remain the publish gate.
export type PresentationQualityBudget = {
  maxFailedChecks: number;
  maxStalledChecks: number;
};

export type PresentationQualityWarning =
  | "presentation_visual_repair_limit_exceeded"
  | "presentation_visual_repair_stalled";

export type PresentationBudgetFailure = "presentation_agent_token_budget_exhausted";

export function initialPresentationQualityBudgetState(): PresentationQualityBudgetState {
  return {
    failedChecks: 0,
    previousIssues: null,
    stalledChecks: 0,
  };
}

export function totalConversationTokens(usageById: Record<string, OpenHandsTokenUsage>) {
  return Object.values(usageById).reduce(
    (total, usage) => total + usage.promptTokens + usage.completionTokens,
    0,
  );
}

function isStableImprovement(previous: PresentationIssueCounts, current: PresentationIssueCounts) {
  const keys = ["boundsOutside", "overlap", "textOverflow"] as const;
  return (
    keys.every((key) => current[key] <= previous[key]) &&
    keys.some((key) => current[key] < previous[key])
  );
}

export function applyPresentationQualityProgress(
  state: PresentationQualityBudgetState,
  progressEvents: readonly PresentationProgress[],
  budget: PresentationQualityBudget,
): {
  warning: PresentationQualityWarning | null;
  state: PresentationQualityBudgetState;
} {
  let next = state;
  for (const progress of progressEvents) {
    if (
      progress.phase !== "visual_check" ||
      progress.operation !== "check" ||
      progress.status !== "failed" ||
      !progress.issues
    ) {
      continue;
    }

    const stalledChecks =
      next.previousIssues === null || isStableImprovement(next.previousIssues, progress.issues)
        ? 0
        : next.stalledChecks + 1;
    next = {
      failedChecks: next.failedChecks + 1,
      previousIssues: progress.issues,
      stalledChecks,
    };

    if (next.failedChecks >= budget.maxFailedChecks) {
      return { state: next, warning: "presentation_visual_repair_limit_exceeded" };
    }
    if (next.stalledChecks >= budget.maxStalledChecks) {
      return { state: next, warning: "presentation_visual_repair_stalled" };
    }
  }
  return { state: next, warning: null };
}

export function presentationTokenBudgetFailure(
  usageById: Record<string, OpenHandsTokenUsage>,
  maxAccumulatedTokens: number,
): PresentationBudgetFailure | null {
  return totalConversationTokens(usageById) >= maxAccumulatedTokens
    ? "presentation_agent_token_budget_exhausted"
    : null;
}
