import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { serverEnvironment } from "@/environment/server";

const execFileAsync = promisify(execFile);

const tracingState = vi.hoisted(() => ({
  exporterConfigurations: [] as unknown[],
  instrumentationConfigurations: [] as unknown[],
  sdkConfigurations: [] as unknown[],
  shutdownCount: 0,
  startCount: 0,
}));

vi.mock("@opentelemetry/exporter-trace-otlp-proto", () => ({
  OTLPTraceExporter: class {
    constructor(configuration: unknown) {
      tracingState.exporterConfigurations.push(configuration);
    }
  },
}));

vi.mock("@opentelemetry/instrumentation-pino", () => ({
  PinoInstrumentation: class {
    constructor(configuration: unknown) {
      tracingState.instrumentationConfigurations.push(configuration);
    }
  },
}));

vi.mock("@opentelemetry/sdk-node", () => {
  class Sampler {
    constructor(readonly configuration?: unknown) {}
  }
  return {
    core: {
      parseKeyPairsIntoRecord(value?: string) {
        return value === "authorization=local" ? { authorization: "local" } : {};
      },
    },
    NodeSDK: class {
      constructor(configuration: unknown) {
        tracingState.sdkConfigurations.push(configuration);
      }

      shutdown() {
        tracingState.shutdownCount += 1;
        return Promise.resolve();
      }

      start() {
        tracingState.startCount += 1;
      }
    },
    tracing: {
      AlwaysOffSampler: Sampler,
      AlwaysOnSampler: Sampler,
      ParentBasedSampler: Sampler,
      TraceIdRatioBasedSampler: Sampler,
    },
  };
});

describe("application tracing", () => {
  beforeEach(() => {
    vi.resetModules();
    tracingState.exporterConfigurations.length = 0;
    tracingState.instrumentationConfigurations.length = 0;
    tracingState.sdkConfigurations.length = 0;
    tracingState.shutdownCount = 0;
    tracingState.startCount = 0;
  });

  test("is a no-op when the OTLP endpoint is absent", async () => {
    const tracing = await import("./tracing.server");
    tracing.startApplicationTracing(
      "spectra-web",
      serverEnvironment({
        NODE_ENV: "test",
      }),
    );

    expect(tracingState.exporterConfigurations).toEqual([]);
    expect(tracingState.startCount).toBe(0);
    await tracing.shutdownApplicationTracing();
    expect(tracingState.shutdownCount).toBe(0);
  });

  test("starts once with official Pino correlation and shuts down once", async () => {
    const tracing = await import("./tracing.server");
    const environment = serverEnvironment({
      NODE_ENV: "test",
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318/collector",
      OTEL_EXPORTER_OTLP_HEADERS: "authorization=local",
      OTEL_TRACES_SAMPLER: "parentbased_traceidratio",
      OTEL_TRACES_SAMPLER_ARG: "0.25",
    });

    tracing.startApplicationTracing("spectra-worker", environment);
    tracing.startApplicationTracing("spectra-worker", environment);

    expect(tracingState.startCount).toBe(1);
    expect(tracingState.exporterConfigurations).toEqual([
      {
        headers: { authorization: "local" },
        url: "http://127.0.0.1:4318/collector/v1/traces",
      },
    ]);
    expect(tracingState.instrumentationConfigurations).toEqual([
      {
        disableLogSending: true,
        logKeys: {
          spanId: "span_id",
          traceFlags: "trace_flags",
          traceId: "trace_id",
        },
      },
    ]);

    await tracing.shutdownApplicationTracing();
    await tracing.shutdownApplicationTracing();
    expect(tracingState.shutdownCount).toBe(1);
  });

  test("injects official trace correlation fields into Pino JSON", async () => {
    const script = `
      import http from "node:http";
      const server = http.createServer((request, response) => {
        request.resume();
        response.writeHead(200, { "Content-Type": "application/x-protobuf" });
        response.end();
      });
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("trace_test_server_unavailable");
      const { serverEnvironment } = await import("./src/environment/server.ts");
      const tracing = await import("./src/observability/tracing.server.ts");
      tracing.startApplicationTracing(
        "spectra-web",
        serverEnvironment({
          NODE_ENV: "test",
          OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:" + address.port,
        }),
      );
      const { flushApplicationLogger, webLogger } = await import("./src/observability/server.ts");
      await tracing.applicationTracer.startActiveSpan("test.log.correlation", async (span) => {
        webLogger.info({ event: "test.log.correlation" }, "trace correlation probe");
        await flushApplicationLogger(webLogger);
        span.end();
      });
      await tracing.shutdownApplicationTracing();
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    `;
    const { stdout } = await execFileAsync(
      process.execPath,
      ["--conditions=react-server", "--import", "tsx", "--input-type=module", "--eval", script],
      {
        cwd: process.cwd(),
        env: { ...process.env, LOG_LEVEL: "info" },
        timeout: 10_000,
      },
    );
    const record = stdout
      .trim()
      .split("\n")
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as Record<string, unknown>];
        } catch {
          return [];
        }
      })
      .find((line) => line.event === "test.log.correlation");

    if (!record) throw new Error(`Missing Pino correlation record: ${JSON.stringify(stdout)}`);
    expect(record, stdout).toMatchObject({
      event: "test.log.correlation",
      service: "spectra-web",
      trace_flags: "01",
    });
    expect(record?.trace_id).toMatch(/^[0-9a-f]{32}$/);
    expect(record?.span_id).toMatch(/^[0-9a-f]{16}$/);
  });
});
