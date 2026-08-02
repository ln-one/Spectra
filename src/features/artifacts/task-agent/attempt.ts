import { z } from "zod";

export const taskAgentAttemptPhaseSchema = z.enum([
  "queued",
  "provisioning",
  "authoring",
  "rendering",
  "publishing",
  "succeeded",
  "failed",
  "cancelled",
]);

export type TaskAgentAttemptPhase = z.infer<typeof taskAgentAttemptPhaseSchema>;

const SECRET_VALUE =
  /((?:api[_-]?key|authorization|token|secret|password|signature)\s*[:=]\s*["']?)[^"',\s}]+/gi;
const BEARER_VALUE = /(bearer\s+)[a-z0-9._~+/-]+/gi;
const URL_QUERY = /([?&](?:key|token|signature|x-amz-[^=]+)=)[^&\s]+/gi;
const PROVIDER_KEY = /\b(?:sk|sess|key)-[a-z0-9_-]{16,}\b/gi;
const URL_CREDENTIALS = /(https?:\/\/)[^/@\s:]+:[^/@\s]+@/gi;

export function redactedTaskAgentFailureDetail(error: unknown) {
  const record = error && typeof error === "object" ? (error as Record<string, unknown>) : null;
  const parts = [
    error instanceof Error ? error.message : String(error),
    record?.value === undefined
      ? null
      : typeof record.value === "string"
        ? record.value
        : JSON.stringify(record.value),
  ].filter((value): value is string => Boolean(value));
  return parts
    .join("\n")
    .replace(SECRET_VALUE, "$1[REDACTED]")
    .replace(BEARER_VALUE, "$1[REDACTED]")
    .replace(URL_QUERY, "$1[REDACTED]")
    .replace(PROVIDER_KEY, "[REDACTED]")
    .replace(URL_CREDENTIALS, "$1[REDACTED]@")
    .slice(0, 4_000);
}
