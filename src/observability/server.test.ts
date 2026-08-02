import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { serverEnvironment } from "@/environment/server";
import {
  createApplicationLogger,
  createChildLogger,
  flushApplicationLogger,
  safeLogError,
} from "./server";

let output: string[];

function records() {
  return output.flatMap((chunk) =>
    chunk
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>),
  );
}

beforeEach(() => {
  output = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    output.push(String(chunk));
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("application logger", () => {
  test("writes ISO-timestamped JSON with service and child bindings", () => {
    const logger = createApplicationLogger(
      "spectra-web",
      serverEnvironment({ LOG_LEVEL: "trace", NODE_ENV: "test" }),
    );

    createChildLogger(logger, {
      artifactKind: "teaching_document",
      component: "agent",
      conversationId: "conversation-1",
      generationId: "generation-1",
      queuedCount: 2,
      workspaceId: "workspace-1",
    }).info({ event: "agent.run.started", runId: "run-1" }, "Agent started");

    expect(records()).toEqual([
      expect.objectContaining({
        component: "agent",
        artifactKind: "teaching_document",
        conversationId: "conversation-1",
        environment: "test",
        event: "agent.run.started",
        generationId: "generation-1",
        level: 30,
        msg: "Agent started",
        runId: "run-1",
        service: "spectra-web",
        queuedCount: 2,
        workspaceId: "workspace-1",
      }),
    ]);
    expect(records()[0]?.time).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
  });

  test("filters records below the configured level", () => {
    const logger = createApplicationLogger(
      "spectra-worker",
      serverEnvironment({ LOG_LEVEL: "error", NODE_ENV: "test" }),
    );

    logger.info({ event: "worker.lifecycle.ready" });
    logger.error({ event: "worker.lifecycle.fatal" });

    expect(records()).toEqual([
      expect.objectContaining({
        event: "worker.lifecycle.fatal",
        level: 50,
        service: "spectra-worker",
      }),
    ]);
  });

  test("redacts sensitive fields at supported nesting depths", () => {
    const logger = createApplicationLogger(
      "spectra-web",
      serverEnvironment({ LOG_LEVEL: "info", NODE_ENV: "test" }),
    );

    logger.info({
      access_token: "root-access-token",
      apiKey: "root-key",
      event: "security.redaction.checked",
      request: {
        authorization: "Bearer nested-token",
        credentials: {
          client_secret: "nested-client-secret",
          secret: "nested-secret",
        },
        headers: { cookie: "session=secret" },
        url: "https://spectra.example.test/private?token=secret",
      },
      searchParams: { token: "secret" },
    });

    expect(records()[0]).toMatchObject({
      access_token: "[REDACTED]",
      apiKey: "[REDACTED]",
      request: {
        authorization: "[REDACTED]",
        credentials: {
          client_secret: "[REDACTED]",
          secret: "[REDACTED]",
        },
        headers: "[REDACTED]",
        url: "[REDACTED]",
      },
      searchParams: "[REDACTED]",
    });
  });

  test("serializes errors without unbounded messages or stacks", () => {
    const error = new TypeError("m".repeat(1_200));
    error.stack = "s".repeat(9_000);
    const logger = createApplicationLogger(
      "spectra-worker",
      serverEnvironment({ LOG_LEVEL: "info", NODE_ENV: "test" }),
    );

    logger.error({ error, event: "artifact.render.failed" });

    expect(records()[0]?.error).toEqual({
      message: "m".repeat(1_000),
      stack: "s".repeat(8_000),
      type: "TypeError",
    });
    expect(safeLogError({ reason: "unknown" })).toEqual({
      message: "[object Object]",
      type: "UnknownError",
    });
  });

  test("cleans URLs and credential fragments embedded in error strings", () => {
    const error = new Error(
      "POST https://user:password@spectra.example.test/private?token=secret " +
        "Authorization: Bearer header-secret API_KEY=api-secret " +
        'payload={"token":"secret value","client_secret":"client value"} ' +
        "access_token='access value'",
    );

    expect(safeLogError(error).message).toBe(
      "POST [REDACTED_URL] Authorization=[REDACTED] [REDACTED] API_KEY=[REDACTED] " +
        'payload={"token":"[REDACTED]","client_secret":"[REDACTED]"} ' +
        "access_token=[REDACTED]",
    );
    expect(safeLogError(error).stack).not.toContain("spectra.example.test");
    expect(safeLogError(error).stack).not.toContain("header-secret");
    expect(safeLogError(error).stack).not.toContain("api-secret");
    expect(safeLogError(error).stack).not.toContain("secret value");
    expect(safeLogError(error).stack).not.toContain("client value");
    expect(safeLogError(error).stack).not.toContain("access value");
  });

  test("waits for Pino to flush and propagates flush errors", async () => {
    const success = { flush: vi.fn((callback) => callback()) } as never;
    await expect(flushApplicationLogger(success)).resolves.toBeUndefined();

    const failure = new Error("flush failed");
    const failed = { flush: vi.fn((callback) => callback(failure)) } as never;
    await expect(flushApplicationLogger(failed)).rejects.toBe(failure);
  });
});
