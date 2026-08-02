import { Writable } from "node:stream";
import type { ContextualMetadata, StackTrace } from "@dbos-inc/dbos-sdk";
import pino from "pino";
import { describe, expect, test } from "vitest";
import { DbosPinoLogger, dbosLogBindings } from "./dbos.server";
import { safeLogError } from "./server";

function recordingLogger() {
  const output: string[] = [];
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      output.push(String(chunk));
      callback();
    },
  });
  return {
    logger: pino(
      {
        base: null,
        level: "trace",
        serializers: { error: safeLogError },
        timestamp: false,
      },
      destination,
    ),
    records: () => output.map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

function metadata(attributes: Record<string, string>) {
  return {
    span: { attributes },
  } as unknown as ContextualMetadata;
}

describe("DBOS Pino adapter", () => {
  test("maps the four DBOS levels to Pino", () => {
    const recording = recordingLogger();
    const adapter = new DbosPinoLogger(recording.logger);

    adapter.debug("debug");
    adapter.info("info");
    adapter.warn("warn");
    adapter.error(new Error("error"));

    expect(recording.records().map(({ level }) => level)).toEqual([20, 30, 40, 50]);
    expect(recording.records().every(({ event }) => event === "dbos.internal")).toBe(true);
  });

  test("allows only semconv operation, workflow, and executor metadata", () => {
    const input = metadata({
      "dbos.executor.id": "executor-1",
      "dbos.operation.name": "renderArtifact",
      "dbos.operation.type": "workflow",
      "dbos.operation.workflow_id": "workflow-1",
      "private.prompt": "must-not-appear",
    });

    expect(dbosLogBindings(input)).toEqual({
      dbosOperation: "renderArtifact",
      dbosOperationType: "workflow",
      executorId: "executor-1",
      workflowId: "workflow-1",
    });
  });

  test("serializes the DBOS error and explicit stack safely", () => {
    const recording = recordingLogger();
    const adapter = new DbosPinoLogger(recording.logger);
    const input = {
      ...metadata({ "dbos.operation.workflow_id": "workflow-2" }),
      stack: "dbos stack",
    } as ContextualMetadata & StackTrace;

    adapter.error(new TypeError("render failed"), input);

    expect(recording.records()[0]).toMatchObject({
      error: {
        message: "render failed",
        stack: "dbos stack",
        type: "TypeError",
      },
      workflowId: "workflow-2",
    });
  });

  test("cleans credentials and complete URLs from DBOS messages", () => {
    const recording = recordingLogger();
    const adapter = new DbosPinoLogger(recording.logger);

    adapter.error(
      new Error("Request https://spectra.example.test/private?token=secret with Bearer credential"),
    );

    expect(recording.records()[0]).toMatchObject({
      error: {
        message: "Request [REDACTED_URL] with Bearer [REDACTED]",
      },
      msg: "Error: Request [REDACTED_URL] with Bearer [REDACTED]",
    });
  });
});
