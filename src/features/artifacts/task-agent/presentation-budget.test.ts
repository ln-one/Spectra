import { expect, test } from "vitest";
import type { OpenHandsTokenUsage } from "./openhands-client.server";
import {
  applyPresentationQualityProgress,
  initialPresentationQualityBudgetState,
  presentationTokenBudgetFailure,
  totalConversationTokens,
} from "./presentation-budget";
import type { PresentationProgress } from "./progress";

function failedCheck(
  boundsOutside: number,
  textOverflow: number,
  overlap: number,
): PresentationProgress {
  return {
    failureCode: "presentation_check_failed",
    issues: { boundsOutside, overlap, textOverflow },
    operation: "check",
    phase: "visual_check",
    status: "failed",
    version: 1,
  };
}

const usage = (promptTokens: number, completionTokens: number): OpenHandsTokenUsage => ({
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  completionTokens,
  contextWindow: 1_000_000,
  model: "openai/spectra-authoring",
  perTurnTokens: 0,
  promptTokens,
  reasoningTokens: completionTokens,
});

test("counts prompt and completion tokens once across usage ids", () => {
  const usageById = {
    "spectra-presentation-agent": usage(90, 10),
    "spectra-presentation-condenser": usage(15, 5),
  };
  expect(totalConversationTokens(usageById)).toBe(120);
  expect(presentationTokenBudgetFailure(usageById, 121)).toBeNull();
  expect(presentationTokenBudgetFailure(usageById, 120)).toBe(
    "presentation_agent_token_budget_exhausted",
  );
});

test("resets the stall count only for Pareto improvements", () => {
  const budget = { maxFailedChecks: 8, maxStalledChecks: 3 };
  let result = applyPresentationQualityProgress(
    initialPresentationQualityBudgetState(),
    [failedCheck(1, 69, 5)],
    budget,
  );
  expect(result.state).toMatchObject({ failedChecks: 1, stalledChecks: 0 });

  result = applyPresentationQualityProgress(result.state, [failedCheck(1, 64, 5)], budget);
  expect(result.state.stalledChecks).toBe(0);

  result = applyPresentationQualityProgress(result.state, [failedCheck(1, 21, 15)], budget);
  expect(result.state.stalledChecks).toBe(1);

  result = applyPresentationQualityProgress(result.state, [failedCheck(1, 19, 22)], budget);
  expect(result.state.stalledChecks).toBe(2);

  result = applyPresentationQualityProgress(result.state, [failedCheck(1, 18, 23)], budget);
  expect(result.warning).toBe("presentation_visual_repair_stalled");
});

test("reports a warning at the configured failed-check limit without a hard failure", () => {
  const progress = Array.from({ length: 8 }, (_, index) => failedCheck(8 - index, 0, 0));
  const result = applyPresentationQualityProgress(
    initialPresentationQualityBudgetState(),
    progress,
    { maxFailedChecks: 8, maxStalledChecks: 3 },
  );
  expect(result.warning).toBe("presentation_visual_repair_limit_exceeded");
  expect(result.state.failedChecks).toBe(8);
});

test("ignores non-failed visual-check progress", () => {
  const result = applyPresentationQualityProgress(
    initialPresentationQualityBudgetState(),
    [
      {
        issues: { boundsOutside: 0, overlap: 0, textOverflow: 0 },
        operation: "check",
        phase: "visual_check",
        status: "completed",
        version: 1,
      },
      {
        operation: "generated",
        pageNumber: 1,
        phase: "pptd",
        status: "progress",
        totalPages: 6,
        version: 1,
      },
    ],
    { maxFailedChecks: 8, maxStalledChecks: 3 },
  );
  expect(result.state).toEqual(initialPresentationQualityBudgetState());
  expect(result.warning).toBeNull();
});
