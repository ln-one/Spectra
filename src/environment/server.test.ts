import { describe, expect, test } from "vitest";
import {
  applicationEnvironmentKeys,
  serverEnvironment,
  validateWebEnvironment,
  validateWorkerEnvironment,
} from "./server";

const coreEnvironment = {
  BETTER_AUTH_SECRET: "a".repeat(32),
  BETTER_AUTH_URL: "https://spectra.example.test",
  DASHSCOPE_API_KEY: "dashscope-key",
  DASHSCOPE_BASE_URL: "https://dashscope.example.test/v1",
  REDIS_URL: "redis://localhost:6379",
  STORAGE_ACCESS_KEY_ID: "access-key",
  STORAGE_BUCKET: "spectra-test",
  STORAGE_ENDPOINT: "http://localhost:7070",
  STORAGE_REGION: "us-east-1",
  STORAGE_SECRET_ACCESS_KEY: "secret-key",
} satisfies Record<string, string>;

describe("server environment contract", () => {
  test("normalizes empty strings and typed defaults at one boundary", () => {
    const environment = serverEnvironment({
      ANIMATION_RENDER_CONCURRENCY: "2",
      KNOWLEDGE_INDEXING_ENABLED: "true",
      MINERU_API_TOKEN: "",
      NODE_ENV: "test",
      OPENHANDS_LLM_ENABLE_THINKING: "false",
    });

    expect(environment).toMatchObject({
      ANIMATION_RENDER_CONCURRENCY: 2,
      KNOWLEDGE_EMBEDDING_DIMENSION: 512,
      KNOWLEDGE_INDEXING_ENABLED: true,
      LOG_LEVEL: "info",
      MINERU_API_TOKEN: undefined,
      OPENHANDS_CONDENSER_MAX_EVENTS: 80,
      OPENHANDS_CONDENSER_MAX_OUTPUT_TOKENS: 4_096,
      OPENHANDS_CONDENSER_MAX_TOKENS: 200_000,
      OPENHANDS_LLM_ENABLE_THINKING: false,
      OPENHANDS_LLM_REASONING_EFFORT: "medium",
      OPENHANDS_LLM_TIMEOUT_SECONDS: 900,
      OTEL_EXPORTER_OTLP_ENDPOINT: undefined,
      OTEL_TRACES_SAMPLER: "parentbased_always_on",
      OTEL_TRACES_SAMPLER_ARG: 1,
      PRESENTATION_AGENT_MAX_ACCUMULATED_TOKENS: 12_000_000,
      PRESENTATION_ATTEMPT_TIMEOUT_MS: 2_100_000,
      PRESENTATION_COLLECTION_RESERVE_MS: 300_000,
      PRESENTATION_MAX_FAILED_VISUAL_CHECKS: 8,
      PRESENTATION_MAX_STALLED_VISUAL_CHECKS: 3,
    });
  });

  test.each([
    [{ KNOWLEDGE_INDEXING_ENABLED: "yes" }, "KNOWLEDGE_INDEXING_ENABLED"],
    [{ ANIMATION_RENDER_CONCURRENCY: "0" }, "ANIMATION_RENDER_CONCURRENCY"],
    [{ DASHSCOPE_BASE_URL: "not a URL" }, "DASHSCOPE_BASE_URL"],
    [{ LOG_LEVEL: "verbose" }, "LOG_LEVEL"],
    [{ OTEL_EXPORTER_OTLP_ENDPOINT: "not a URL" }, "OTEL_EXPORTER_OTLP_ENDPOINT"],
    [{ OTEL_EXPORTER_OTLP_ENDPOINT: "ftp://collector.local" }, "OTEL_EXPORTER_OTLP_ENDPOINT"],
    [{ OTEL_TRACES_SAMPLER: "custom" }, "OTEL_TRACES_SAMPLER"],
    [{ OTEL_TRACES_SAMPLER_ARG: "1.1" }, "OTEL_TRACES_SAMPLER_ARG"],
  ])("rejects invalid typed values", (input, _key) => {
    expect(() => serverEnvironment({ NODE_ENV: "test", ...input })).toThrow(
      "Invalid environment variables",
    );
  });

  test("fails Web startup when a core dependency is missing", () => {
    const environment = serverEnvironment({ ...coreEnvironment, REDIS_URL: "", NODE_ENV: "test" });
    expect(() => validateWebEnvironment(environment)).toThrow();
  });

  test("fails Worker startup when its production identity is missing", () => {
    const environment = serverEnvironment({
      ...coreEnvironment,
      DATABASE_URL: "postgresql://spectra:spectra@localhost:5432/spectra",
      NODE_ENV: "production",
    });
    expect(() => validateWorkerEnvironment(environment)).toThrow("DBOS__VMID");
  });

  test("accepts complete Web and Worker startup roles", () => {
    const environment = serverEnvironment({
      ...coreEnvironment,
      DATABASE_URL: "postgresql://spectra:spectra@localhost:5432/spectra",
      DBOS__VMID: "artifact-worker-1",
      NODE_ENV: "production",
    });
    expect(validateWebEnvironment(environment)).toBe(environment);
    expect(validateWorkerEnvironment(environment)).toBe(environment);
  });

  test("does not require Web-only auth and Redis configuration from Worker", () => {
    const {
      BETTER_AUTH_SECRET: _secret,
      BETTER_AUTH_URL: _url,
      REDIS_URL: _redis,
      ...workerCore
    } = coreEnvironment;
    const environment = serverEnvironment({
      ...workerCore,
      DBOS__VMID: "artifact-worker-1",
      NODE_ENV: "test",
    });
    expect(validateWorkerEnvironment(environment)).toBe(environment);
  });

  test("publishes a stable list of application keys", () => {
    expect(new Set(applicationEnvironmentKeys).size).toBe(applicationEnvironmentKeys.length);
    expect(applicationEnvironmentKeys).toContain("DATABASE_URL");
    expect(applicationEnvironmentKeys).toContain("LOG_LEVEL");
    expect(applicationEnvironmentKeys).toContain("OTEL_EXPORTER_OTLP_ENDPOINT");
  });

  test("accepts every Pino log level", () => {
    for (const level of ["trace", "debug", "info", "warn", "error", "fatal", "silent"]) {
      expect(serverEnvironment({ LOG_LEVEL: level, NODE_ENV: "test" }).LOG_LEVEL).toBe(level);
    }
  });
});
