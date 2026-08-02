import { expect, test } from "vitest";
import { testServerEnvironment } from "@/environment/test";
import {
  animationExecutionEnabled,
  animationRenderEnvironment,
  artifactCreationCapabilities,
  artifactPublishedCapabilities,
  openHandsAuthoringEnvironment,
  openHandsExecutionEnabled,
} from "./config.server";

const validInput = {
  ANIMATION_EXECUTION_ENABLED: "true",
  OPENHANDS_EXECUTION_ENABLED: "true",
  OPENHANDS_LLM_API_KEY: "llm-key",
  OPENHANDS_LLM_BASE_URL: "https://llm.example.test/v1",
  OPENHANDS_LLM_MODEL: "openai/spectra-authoring",
  OPENHANDS_RUNTIME_API_KEY: "runtime-key",
  OPENHANDS_RUNTIME_URL: "http://127.0.0.1:8000",
} satisfies Record<string, string>;
const valid = testServerEnvironment(validInput);

test("enables one configured OpenHands runtime without Skill path variables", () => {
  expect(openHandsExecutionEnabled(valid)).toBe(true);
  expect(animationExecutionEnabled(valid)).toBe(true);
  expect(artifactCreationCapabilities(valid)).toEqual(new Set(["presentation", "animation"]));
  expect(
    openHandsExecutionEnabled(testServerEnvironment({ ...validInput, OPENHANDS_LLM_API_KEY: "" })),
  ).toBe(false);
});

test("uses one attempt-scoped HTTPS runtime in production", () => {
  const attemptScoped = testServerEnvironment({
    ...validInput,
    OPENHANDS_RUNTIME_URL: "",
    OPENHANDS_RUNTIME_URL_TEMPLATE: "https://runtime.example.test/attempts/{attemptId}",
  });
  const runtime = openHandsAuthoringEnvironment(
    attemptScoped,
    "presentation-pptd-v1",
    "00000000-0000-4000-8000-000000000123",
  );
  expect(runtime.runtimeUrl).toBe(
    "https://runtime.example.test/attempts/00000000-0000-4000-8000-000000000123",
  );
  expect(runtime.workspaceIsolation).toBe("remote_per_attempt");
  expect(
    openHandsAuthoringEnvironment(
      testServerEnvironment({
        ...validInput,
        NODE_ENV: "production",
        OPENHANDS_RUNTIME_URL: "",
        OPENHANDS_RUNTIME_URL_TEMPLATE: "https://runtime.example.test/attempts/{attemptId}",
      }),
      "presentation-pptd-v1",
      "00000000-0000-4000-8000-000000000123",
    ),
  ).toMatchObject({
    recipeVersion: "presentation-pptd-v1",
    runtimeUrl: "https://runtime.example.test/attempts/00000000-0000-4000-8000-000000000123",
    workspaceIsolation: "remote_per_attempt",
  });
  expect(
    openHandsExecutionEnabled(testServerEnvironment({ ...validInput, NODE_ENV: "production" })),
  ).toBe(false);
});

test("uses the fixed single-model defaults and configurable budgets", () => {
  const runtime = openHandsAuthoringEnvironment(
    testServerEnvironment({
      ...validInput,
      OPENHANDS_AGENT_MAX_ITERATIONS: "120",
      OPENHANDS_CONDENSER_MAX_EVENTS: "60",
      OPENHANDS_LLM_REASONING_EFFORT: "low",
      OPENHANDS_POLL_INTERVAL_MS: "20000",
      PRESENTATION_AGENT_MAX_ACCUMULATED_TOKENS: "9000000",
      PRESENTATION_ATTEMPT_TIMEOUT_MS: "600000",
      PRESENTATION_COLLECTION_RESERVE_MS: "120000",
      PRESENTATION_MAX_FAILED_VISUAL_CHECKS: "7",
      PRESENTATION_MAX_STALLED_VISUAL_CHECKS: "2",
    }),
    "presentation-pptd-v1",
  );
  expect(runtime).toMatchObject({
    llmEnableThinking: true,
    llmModel: "openai/spectra-authoring",
    llmReasoningEffort: "low",
    maxDurationMs: 600000,
    maxIterations: 120,
    pollIntervalMs: 20000,
    presentationBudget: {
      collectionReserveMs: 120000,
      maxAccumulatedTokens: 9000000,
      maxFailedVisualChecks: 7,
      maxStalledVisualChecks: 2,
    },
  });
});

test("rejects a presentation reserve that consumes the entire attempt", () => {
  expect(() =>
    openHandsAuthoringEnvironment(
      testServerEnvironment({
        ...validInput,
        PRESENTATION_ATTEMPT_TIMEOUT_MS: "600000",
        PRESENTATION_COLLECTION_RESERVE_MS: "600000",
      }),
      "presentation-pptd-v1",
    ),
  ).toThrow("presentation_authoring_budget_invalid");
});

test("keeps cards visible in development and uses release flags in production", () => {
  expect(artifactPublishedCapabilities(testServerEnvironment({ NODE_ENV: "development" }))).toEqual(
    new Set(["presentation", "animation"]),
  );
  expect(
    artifactPublishedCapabilities(
      testServerEnvironment({
        ANIMATION_PUBLISHED: "false",
        NODE_ENV: "production",
        PRESENTATION_PUBLISHED: "true",
      }),
    ),
  ).toEqual(new Set(["presentation"]));
});

test("reads renderer settings without host-specific fallback paths", () => {
  expect(animationRenderEnvironment(testServerEnvironment())).toEqual({
    concurrency: 1,
    timeoutMs: 1_200_000,
  });
  expect(
    animationRenderEnvironment(
      testServerEnvironment({
        ANIMATION_RENDER_CONCURRENCY: "2",
        ANIMATION_RENDER_TIMEOUT_MS: "900000",
        REMOTION_BROWSER_EXECUTABLE: "/usr/bin/chromium",
      }),
    ),
  ).toEqual({
    browserExecutable: "/usr/bin/chromium",
    concurrency: 2,
    timeoutMs: 900000,
  });
});
