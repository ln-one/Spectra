import "server-only";

import type { AnySpan, SpanOutputProcessor } from "@mastra/core/observability";
import { InMemoryStore } from "@mastra/core/storage";
import { MastraStorageExporter, Observability, SensitiveDataFilter } from "@mastra/observability";
import { PostgresStoreVNext } from "@mastra/pg";
import { type ServerEnvironment, serverEnvironment } from "@/environment/server";

const REDACTED = "[REDACTED]";
const CONTENT_KEYS = new Set([
  "args",
  "content",
  "input",
  "messages",
  "object",
  "output",
  "prompt",
  "reasoning",
  "reasoningdetails",
  "result",
  "text",
  "toolcalls",
  "toolargs",
  "toolresult",
]);
const SAFE_ATTRIBUTE_SUFFIXES = new Set([
  "cachehit",
  "candidatecount",
  "conversationid",
  "cost",
  "costmicrousd",
  "durationms",
  "finishreason",
  "generationstate",
  "kind",
  "latencyms",
  "modelid",
  "newevidencecount",
  "operationname",
  "provider",
  "round",
  "rootrunid",
  "spanname",
  "status",
  "statuscode",
  "stopreason",
  "surfacetype",
  "toolname",
  "workspaceid",
]);

function containsContentKey(key: string) {
  const segments = key
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (
    segments.includes("usage") &&
    segments.some((segment) => segment === "token" || segment === "tokens" || segment === "cost")
  ) {
    return false;
  }
  return segments.some((segment) => CONTENT_KEYS.has(segment));
}

export function redactAgentTraceContent(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactAgentTraceContent);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, candidate]) => [
      key,
      containsContentKey(key) || CONTENT_KEYS.has(key.toLowerCase().replaceAll(/[^a-z0-9]/g, ""))
        ? REDACTED
        : redactAgentTraceContent(candidate),
    ]),
  );
}

function safeTraceAttribute(key: string) {
  const normalized = key.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
  if ([...SAFE_ATTRIBUTE_SUFFIXES].some((suffix) => normalized.endsWith(suffix))) return true;
  return (
    (normalized.includes("usage") || normalized.includes("metric")) &&
    (normalized.includes("token") || normalized.includes("cost"))
  );
}

export function redactAgentTraceAttributes(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return REDACTED;
  return Object.fromEntries(
    Object.entries(value).map(([key, candidate]) => [
      key,
      safeTraceAttribute(key) ? redactAgentTraceContent(candidate) : REDACTED,
    ]),
  );
}

export class SpectraContentPrivacyProcessor implements SpanOutputProcessor {
  readonly name = "spectra-content-privacy";

  process(span: AnySpan): AnySpan {
    if (span.attributes !== undefined) {
      span.attributes = redactAgentTraceAttributes(span.attributes) as NonNullable<
        AnySpan["attributes"]
      >;
    }
    if (span.input !== undefined) span.input = REDACTED;
    if (span.metadata !== undefined) span.metadata = { privacy: REDACTED };
    if (span.output !== undefined) {
      span.output =
        span.name === "knowledge.search.result"
          ? redactAgentTraceAttributes(span.output)
          : REDACTED;
    }
    return span;
  }

  async shutdown() {}
}

function postgresDatabaseIdentity(connectionString: string) {
  try {
    const url = new URL(connectionString);
    const postgres = url.protocol === "postgres:" || url.protocol === "postgresql:";
    const protocol = postgres ? "postgresql:" : url.protocol;
    const port = url.port || (postgres ? "5432" : "");
    return `${protocol}//${url.hostname.toLowerCase()}:${port}${decodeURIComponent(url.pathname).replace(/\/$/, "")}`;
  } catch {
    return connectionString.trim();
  }
}

export function createAgentObservabilityResources(
  environment: ServerEnvironment = serverEnvironment(),
) {
  const connectionString = environment.MASTRA_OBSERVABILITY_DATABASE_URL;
  if (environment.NODE_ENV === "production" && !connectionString) return {};
  const productConnectionString = environment.DATABASE_URL;
  if (
    environment.NODE_ENV === "production" &&
    connectionString &&
    productConnectionString &&
    postgresDatabaseIdentity(connectionString) === postgresDatabaseIdentity(productConnectionString)
  ) {
    throw new Error("MASTRA_OBSERVABILITY_DATABASE_URL must use a separate database");
  }

  const storage = connectionString
    ? new PostgresStoreVNext({
        connectionString,
        id: "spectra-observability",
        observability: { connectionString, schemaName: "mastra_observability" },
        schemaName: "mastra_observability_runtime",
      })
    : new InMemoryStore({ id: "spectra-observability-memory" });
  const observability = new Observability({
    configs: {
      default: {
        cardinality: { blockUUIDs: false },
        exporters: [new MastraStorageExporter({ strategy: "insert-only" })],
        logging: { enabled: false },
        requestContextKeys: [
          "rootRunId",
          "conversationId",
          "workspaceId",
          "surface.type",
          "surface.kind",
        ],
        serializationOptions: {
          maxArrayLength: 20,
          maxDepth: 4,
          maxObjectKeys: 40,
          maxStringLength: 512,
        },
        serviceName: "spectra-workspace-agent",
        spanOutputProcessors: [
          new SpectraContentPrivacyProcessor(),
          new SensitiveDataFilter({ redactionStyle: "full" }),
        ],
      },
    },
    sensitiveDataFilter: false,
  });
  return { observability, storage };
}
