import "server-only";

import type { ContextualMetadata, DLogger, StackTrace } from "@dbos-inc/dbos-sdk";
import type { Logger } from "pino";
import { safeLogText, workerLogger } from "./server";

const MAX_DBOS_MESSAGE_LENGTH = 2_000;

function stringAttribute(
  metadata: ContextualMetadata | undefined,
  key: string,
): string | undefined {
  const value = metadata?.span?.attributes[key];
  return typeof value === "string" ? value : undefined;
}

export function dbosLogBindings(metadata?: ContextualMetadata) {
  return {
    ...(stringAttribute(metadata, "dbos.executor.id")
      ? { executorId: stringAttribute(metadata, "dbos.executor.id") }
      : {}),
    ...(stringAttribute(metadata, "dbos.operation.name")
      ? { dbosOperation: stringAttribute(metadata, "dbos.operation.name") }
      : {}),
    ...(stringAttribute(metadata, "dbos.operation.type")
      ? { dbosOperationType: stringAttribute(metadata, "dbos.operation.type") }
      : {}),
    ...(stringAttribute(metadata, "dbos.operation.workflow_id")
      ? { workflowId: stringAttribute(metadata, "dbos.operation.workflow_id") }
      : {}),
  };
}

function messageFor(logEntry: unknown) {
  const message = safeLogText(typeof logEntry === "string" ? logEntry : String(logEntry));
  return message.length <= MAX_DBOS_MESSAGE_LENGTH
    ? message
    : message.slice(0, MAX_DBOS_MESSAGE_LENGTH);
}

function errorFor(inputError: unknown, metadata?: ContextualMetadata & StackTrace) {
  const error = new Error(
    inputError instanceof Error ? inputError.message : messageFor(inputError),
  );
  error.name = inputError instanceof Error ? inputError.name : "Error";
  const stack = metadata?.stack ?? (inputError instanceof Error ? inputError.stack : undefined);
  if (stack) error.stack = stack;
  return error;
}

export class DbosPinoLogger implements DLogger {
  constructor(private readonly logger: Logger = workerLogger) {}

  debug(logEntry: unknown, metadata?: ContextualMetadata): void {
    this.logger.debug(
      { component: "dbos", event: "dbos.internal", ...dbosLogBindings(metadata) },
      messageFor(logEntry),
    );
  }

  error(inputError: unknown, metadata?: ContextualMetadata & StackTrace): void {
    this.logger.error(
      {
        component: "dbos",
        error: errorFor(inputError, metadata),
        event: "dbos.internal",
        ...dbosLogBindings(metadata),
      },
      messageFor(inputError),
    );
  }

  info(logEntry: unknown, metadata?: ContextualMetadata): void {
    this.logger.info(
      { component: "dbos", event: "dbos.internal", ...dbosLogBindings(metadata) },
      messageFor(logEntry),
    );
  }

  warn(logEntry: unknown, metadata?: ContextualMetadata): void {
    this.logger.warn(
      { component: "dbos", event: "dbos.internal", ...dbosLogBindings(metadata) },
      messageFor(logEntry),
    );
  }
}
