import { ApiError } from "@/lib/sdk/errors";

const ACTIVE_SESSION_STATES = new Set([
  "CONFIGURING",
  "ANALYZING",
  "DRAFTING_OUTLINE",
  "AWAITING_OUTLINE_CONFIRM",
  "GENERATING_CONTENT",
  "RENDERING",
]);

const RUN_CONFLICT_MESSAGE_HINTS = [
  "进行中的 run",
  "running run",
  "already running",
  "continue this run",
];

export interface ActiveRunConflictContext {
  runId: string | null;
  sessionId: string | null;
  runStatus: string | null;
  runStep: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function detailsOf(error: unknown): Record<string, unknown> | null {
  if (error instanceof ApiError) {
    return asRecord(error.details);
  }
  if (error && typeof error === "object" && "details" in error) {
    return asRecord((error as { details?: unknown }).details);
  }
  return null;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message || "";
  if (typeof error === "string") return error;
  return "";
}

function statusOf(error: unknown): number | null {
  if (error instanceof ApiError) {
    return typeof error.status === "number" ? error.status : null;
  }
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    return typeof status === "number" ? status : null;
  }
  return null;
}

export function isSessionRunActive(state: string | null | undefined): boolean {
  return ACTIVE_SESSION_STATES.has(String(state || "").toUpperCase());
}

export function parseActiveRunConflict(
  error: unknown
): ActiveRunConflictContext | null {
  const status = statusOf(error);
  if (status !== 409) return null;

  const details = detailsOf(error);
  const message = messageOf(error).toLowerCase();
  const run = asRecord(details?.run);

  const runId =
    readString(details?.run_id) ??
    readString(run?.run_id) ??
    readString(run?.id) ??
    null;
  const sessionId =
    readString(details?.session_id) ??
    readString(run?.session_id) ??
    readString(run?.sessionId) ??
    null;
  const runStatus =
    readString(details?.run_status) ??
    readString(run?.run_status) ??
    readString(run?.status) ??
    null;
  const runStep =
    readString(details?.run_step) ??
    readString(run?.run_step) ??
    readString(run?.step) ??
    null;

  const hasRunMeta =
    Boolean(runId) || Boolean(sessionId) || Boolean(runStatus) || Boolean(runStep);
  const hasMessageHint = RUN_CONFLICT_MESSAGE_HINTS.some((hint) =>
    message.includes(hint)
  );

  if (!hasRunMeta && !hasMessageHint) return null;

  return {
    runId,
    sessionId,
    runStatus,
    runStep,
  };
}
