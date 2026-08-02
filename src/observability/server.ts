import "server-only";

import pino, { type Logger, type LoggerOptions } from "pino";
import { type ServerEnvironment, serverEnvironment } from "@/environment/server";

export type SpectraService = "spectra-web" | "spectra-worker" | "spectra-worker-setup";

export type SpectraLogBindings = {
  artifactId?: string;
  artifactKind?: string;
  attemptId?: string;
  component?: string;
  conversationId?: string;
  durationMs?: number;
  event?: string;
  failureCode?: string;
  failedCount?: number;
  garbageCollectedCount?: number;
  garbageCollectionFailureCount?: number;
  generationId?: string;
  ingestionId?: string;
  renderJobId?: string;
  retryable?: boolean;
  runId?: string;
  sourceId?: string;
  stage?: string;
  staleRunCount?: number;
  queuedCount?: number;
  recoveryArtifactCount?: number;
  recoveryConversationCount?: number;
  recoverySourceCount?: number;
  resourceType?: string;
  deletedCount?: number;
  pageCount?: number;
  payloadBytes?: number;
  readCount?: number;
  conversationCount?: number;
  messageCount?: number;
  sourceCount?: number;
  artifactHistoryCount?: number;
  workflowId?: string;
  workspaceId?: string;
};

const MAX_ERROR_MESSAGE_LENGTH = 1_000;
const MAX_ERROR_STACK_LENGTH = 8_000;
const REDACTED = "[REDACTED]";
const REDACTED_URL = "[REDACTED_URL]";

const SENSITIVE_LOG_KEYS = [
  "accessToken",
  "access_token",
  "apiKey",
  "authorization",
  "body",
  "clientSecret",
  "client_secret",
  "content",
  "cookie",
  "headers",
  "idToken",
  "id_token",
  "input",
  "messages",
  "output",
  "password",
  "prompt",
  "query",
  "refreshToken",
  "refresh_token",
  "searchParams",
  "secret",
  "sessionToken",
  "session_token",
  "setCookie",
  "token",
  "url",
] as const;

const SENSITIVE_LOG_PATHS = SENSITIVE_LOG_KEYS.flatMap((key) => [key, `*.${key}`, `*.*.${key}`]);

const SENSITIVE_TEXT_KEY_PATTERN =
  "authorization|api[ _-]?key|access[ _-]?token|client[ _-]?secret|refresh[ _-]?token|id[ _-]?token|session[ _-]?token|token|secret|password|cookie";
const JSON_SENSITIVE_ASSIGNMENT = new RegExp(
  `(["'])(${SENSITIVE_TEXT_KEY_PATTERN})\\1\\s*:\\s*(["'])(?:\\\\.|(?!\\3).)*\\3`,
  "giu",
);
const QUOTED_SENSITIVE_ASSIGNMENT = new RegExp(
  `\\b(${SENSITIVE_TEXT_KEY_PATTERN})\\b\\s*[:=]\\s*(["'])(?:\\\\.|(?!\\2).)*\\2`,
  "giu",
);
const UNQUOTED_SENSITIVE_ASSIGNMENT = new RegExp(
  `\\b(${SENSITIVE_TEXT_KEY_PATTERN})\\b\\s*[:=]\\s*[^\\s,;}]+`,
  "giu",
);

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength ? value : value.slice(0, maxLength);
}

export function safeLogText(value: string): string {
  return value
    .replace(/\b(?:https?|wss?|redis(?:s)?|postgres(?:ql)?):\/\/[^\s"'<>]+/giu, REDACTED_URL)
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/=._~-]+/giu, `$1 ${REDACTED}`)
    .replace(JSON_SENSITIVE_ASSIGNMENT, (_match, quote: string, key: string) => {
      return `${quote}${key}${quote}:${quote}${REDACTED}${quote}`;
    })
    .replace(QUOTED_SENSITIVE_ASSIGNMENT, `$1=${REDACTED}`)
    .replace(UNQUOTED_SENSITIVE_ASSIGNMENT, `$1=${REDACTED}`);
}

export function safeLogError(error: unknown): {
  message: string;
  stack?: string;
  type: string;
} {
  if (error instanceof Error) {
    return {
      message: truncate(safeLogText(error.message), MAX_ERROR_MESSAGE_LENGTH),
      ...(error.stack ? { stack: truncate(safeLogText(error.stack), MAX_ERROR_STACK_LENGTH) } : {}),
      type: error.name,
    };
  }
  return {
    message: truncate(safeLogText(String(error)), MAX_ERROR_MESSAGE_LENGTH),
    type: "UnknownError",
  };
}

function loggerOptions(service: SpectraService, environment: ServerEnvironment): LoggerOptions {
  return {
    base: {
      environment: environment.NODE_ENV,
      service,
    },
    level: environment.LOG_LEVEL,
    redact: {
      censor: REDACTED,
      paths: [...SENSITIVE_LOG_PATHS],
    },
    serializers: {
      error: safeLogError,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
}

export function createApplicationLogger(
  service: SpectraService,
  environment: ServerEnvironment = serverEnvironment(),
): Logger {
  return pino(loggerOptions(service, environment));
}

export function createChildLogger(logger: Logger, bindings: SpectraLogBindings): Logger {
  return logger.child(bindings);
}

export function flushApplicationLogger(logger: Logger): Promise<void> {
  return new Promise((resolve, reject) => {
    logger.flush((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export const webLogger = createApplicationLogger("spectra-web");
export const workerLogger = createApplicationLogger("spectra-worker");
