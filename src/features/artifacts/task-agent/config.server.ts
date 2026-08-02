import "server-only";

import { type ServerEnvironment, serverEnvironment } from "@/environment/server";
import type {
  ArtifactCreationCapabilities,
  ArtifactCreationCapability,
} from "./creation-capabilities";
import type { TaskAgentRecipeVersion } from "./recipe";

export { animationRenderEnvironment } from "./render-config";

const ATTEMPT_TEMPLATE_TOKEN = "{attemptId}";
const CAPABILITY_PROBE_ATTEMPT_ID = "00000000-0000-4000-8000-000000000000";

function isLoopbackHostname(value: string) {
  const hostname = value.toLowerCase().replace(/^\[(.*)]$/, "$1");
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    /^127(?:\.\d{1,3}){3}$/.test(hostname) ||
    hostname === "::1" ||
    /^::ffff:127(?:\.\d{1,3}){3}$/.test(hostname)
  );
}

function validRuntimeUrl(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" || (url.protocol === "http:" && isLoopbackHostname(url.hostname))
    );
  } catch {
    return false;
  }
}

function runtimeBinding(environment: ServerEnvironment, attemptId: string) {
  const fixed = environment.OPENHANDS_RUNTIME_URL;
  const template = environment.OPENHANDS_RUNTIME_URL_TEMPLATE;
  if (Boolean(fixed) === Boolean(template)) return null;
  if (template) {
    if (template.split(ATTEMPT_TEMPLATE_TOKEN).length !== 2) return null;
    const runtimeUrl = template.replace(ATTEMPT_TEMPLATE_TOKEN, attemptId);
    if (!validRuntimeUrl(runtimeUrl)) return null;
    return { runtimeUrl, workspaceIsolation: "remote_per_attempt" as const };
  }
  if (!fixed || !validRuntimeUrl(fixed)) return null;
  return { runtimeUrl: fixed, workspaceIsolation: "local_development" as const };
}

export type OpenHandsAuthoringEnvironment = {
  apiKey: string;
  condenserMaxEvents: number;
  condenserMaxOutputTokens: number;
  condenserMaxTokens: number;
  enabled: boolean;
  llmApiKey: string;
  llmBaseUrl: string;
  llmEnableThinking: boolean;
  llmModel: string;
  llmReasoningEffort: "high" | "low" | "medium" | "none" | "xhigh";
  llmTimeoutSeconds: number;
  maxDurationMs: number;
  maxIterations: number;
  pollIntervalMs: number;
  recipeVersion: TaskAgentRecipeVersion;
  runtimeUrl: string;
  presentationBudget: {
    collectionReserveMs: number;
    maxAccumulatedTokens: number;
    maxFailedVisualChecks: number;
    maxStalledVisualChecks: number;
  } | null;
  workspaceIsolation: "local_development" | "remote_per_attempt";
  workspaceRoot: string;
};
export type OpenHandsRuntimeEnvironment = OpenHandsAuthoringEnvironment;

export function openHandsAuthoringEnvironment(
  environment: ServerEnvironment = serverEnvironment(),
  recipeVersion: TaskAgentRecipeVersion = "presentation-pptd-v1",
  attemptId = CAPABILITY_PROBE_ATTEMPT_ID,
): OpenHandsAuthoringEnvironment {
  if (!environment.OPENHANDS_EXECUTION_ENABLED) throw new Error("openhands_runtime_disabled");
  const runtime = runtimeBinding(environment, attemptId);
  if (
    !runtime ||
    !environment.OPENHANDS_RUNTIME_API_KEY ||
    !environment.OPENHANDS_LLM_API_KEY ||
    !environment.OPENHANDS_LLM_BASE_URL ||
    !environment.OPENHANDS_LLM_MODEL
  ) {
    throw new Error("openhands_runtime_invalid");
  }
  if (
    environment.NODE_ENV === "production" &&
    runtime.workspaceIsolation !== "remote_per_attempt"
  ) {
    throw new Error("openhands_attempt_runtime_required");
  }
  if (
    recipeVersion === "presentation-pptd-v1" &&
    environment.PRESENTATION_COLLECTION_RESERVE_MS >= environment.PRESENTATION_ATTEMPT_TIMEOUT_MS
  ) {
    throw new Error("presentation_authoring_budget_invalid");
  }
  return {
    apiKey: environment.OPENHANDS_RUNTIME_API_KEY,
    condenserMaxEvents: environment.OPENHANDS_CONDENSER_MAX_EVENTS,
    condenserMaxOutputTokens: environment.OPENHANDS_CONDENSER_MAX_OUTPUT_TOKENS,
    condenserMaxTokens: environment.OPENHANDS_CONDENSER_MAX_TOKENS,
    enabled: true,
    llmApiKey: environment.OPENHANDS_LLM_API_KEY,
    llmBaseUrl: environment.OPENHANDS_LLM_BASE_URL,
    llmEnableThinking: environment.OPENHANDS_LLM_ENABLE_THINKING,
    llmModel: environment.OPENHANDS_LLM_MODEL,
    llmReasoningEffort: environment.OPENHANDS_LLM_REASONING_EFFORT,
    llmTimeoutSeconds: environment.OPENHANDS_LLM_TIMEOUT_SECONDS,
    maxDurationMs:
      recipeVersion === "presentation-pptd-v1"
        ? environment.PRESENTATION_ATTEMPT_TIMEOUT_MS
        : environment.ANIMATION_ATTEMPT_TIMEOUT_MS,
    maxIterations: environment.OPENHANDS_AGENT_MAX_ITERATIONS,
    pollIntervalMs: environment.OPENHANDS_POLL_INTERVAL_MS,
    presentationBudget:
      recipeVersion === "presentation-pptd-v1"
        ? {
            collectionReserveMs: environment.PRESENTATION_COLLECTION_RESERVE_MS,
            maxAccumulatedTokens: environment.PRESENTATION_AGENT_MAX_ACCUMULATED_TOKENS,
            maxFailedVisualChecks: environment.PRESENTATION_MAX_FAILED_VISUAL_CHECKS,
            maxStalledVisualChecks: environment.PRESENTATION_MAX_STALLED_VISUAL_CHECKS,
          }
        : null,
    recipeVersion,
    ...runtime,
    workspaceRoot: environment.OPENHANDS_WORKSPACE_ROOT,
  };
}

function optionalAttemptUrl(template: string | undefined, attemptId: string) {
  if (template?.split(ATTEMPT_TEMPLATE_TOKEN).length !== 2) return null;
  const value = template.replace(ATTEMPT_TEMPLATE_TOKEN, attemptId);
  return validRuntimeUrl(value) ? value : null;
}

export function openHandsRuntimeDebugLinks(environment: ServerEnvironment, attemptId: string) {
  return {
    vnc: optionalAttemptUrl(environment.OPENHANDS_VNC_URL_TEMPLATE, attemptId),
    vscode: optionalAttemptUrl(environment.OPENHANDS_VSCODE_URL_TEMPLATE, attemptId),
    workspace: optionalAttemptUrl(environment.OPENHANDS_WORKSPACE_URL_TEMPLATE, attemptId),
  };
}

function runtimeAvailable(environment: ServerEnvironment, recipeVersion: TaskAgentRecipeVersion) {
  try {
    openHandsAuthoringEnvironment(environment, recipeVersion, CAPABILITY_PROBE_ATTEMPT_ID);
    return true;
  } catch {
    return false;
  }
}

export function openHandsExecutionEnabled(environment: ServerEnvironment = serverEnvironment()) {
  return runtimeAvailable(environment, "presentation-pptd-v1");
}

export function animationExecutionEnabled(environment: ServerEnvironment = serverEnvironment()) {
  return (
    environment.ANIMATION_EXECUTION_ENABLED &&
    runtimeAvailable(environment, "animation-remotion-v1")
  );
}

export function artifactCreationCapabilities(
  environment: ServerEnvironment = serverEnvironment(),
): ArtifactCreationCapabilities {
  const capabilities = new Set<ArtifactCreationCapability>();
  if (openHandsExecutionEnabled(environment)) capabilities.add("presentation");
  if (animationExecutionEnabled(environment)) capabilities.add("animation");
  return capabilities;
}

export function artifactPublishedCapabilities(
  environment: ServerEnvironment = serverEnvironment(),
): ArtifactCreationCapabilities {
  if (environment.NODE_ENV !== "production") return new Set(["presentation", "animation"]);
  const capabilities = new Set<ArtifactCreationCapability>();
  if (environment.PRESENTATION_PUBLISHED) capabilities.add("presentation");
  if (environment.ANIMATION_PUBLISHED) capabilities.add("animation");
  return capabilities;
}
