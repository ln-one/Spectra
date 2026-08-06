import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const booleanValue = z.enum(["true", "false"]).transform((value) => value === "true");
const positiveInteger = z.coerce.number().int().positive();
const optionalUrl = z.url().optional();
function hasProtocol(value: string, protocols: readonly string[]) {
  try {
    return protocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
const httpsUrl = z
  .url()
  .refine((value) => hasProtocol(value, ["https:"]), "DASHSCOPE_BASE_URL must use HTTPS");
const postgresUrl = z
  .url()
  .refine((value) => hasProtocol(value, ["postgres:", "postgresql:"]), "URL must use PostgreSQL");
const redisUrl = z
  .url()
  .refine(
    (value) => hasProtocol(value, ["redis:", "rediss:"]),
    "REDIS_URL must use redis:// or rediss://",
  );
const optionalOtlpHttpUrl = z
  .url()
  .refine(
    (value) => hasProtocol(value, ["http:", "https:"]),
    "OTEL_EXPORTER_OTLP_ENDPOINT must use HTTP or HTTPS",
  )
  .optional();
const otelTraceSampler = z
  .enum([
    "always_off",
    "always_on",
    "parentbased_always_off",
    "parentbased_always_on",
    "parentbased_traceidratio",
    "traceidratio",
  ])
  .default("parentbased_always_on");
const otelTraceSamplerArgument = z.coerce.number().min(0).max(1).default(1);

const serverEnvironmentSchema = {
  ANIMATION_ATTEMPT_TIMEOUT_MS: positiveInteger.default(2_700_000),
  ANIMATION_EXECUTION_ENABLED: booleanValue.default(false),
  ANIMATION_PUBLISHED: booleanValue.default(false),
  ANIMATION_RENDER_CONCURRENCY: positiveInteger.default(1),
  ANIMATION_RENDER_SANDBOX_EXECUTABLE: z.string().trim().min(1).optional(),
  ANIMATION_RENDER_TIMEOUT_MS: positiveInteger.default(20 * 60_000),
  AUTH_SIGN_UP_ENABLED: booleanValue.optional(),
  BETTER_AUTH_SECRET: z.string().trim().min(1).optional(),
  BETTER_AUTH_URL: optionalUrl,
  EMAIL_FROM: z.string().trim().min(1).optional(),
  DATABASE_URL: postgresUrl.optional(),
  DASHSCOPE_API_KEY: z.string().trim().min(1).optional(),
  DASHSCOPE_BASE_URL: httpsUrl.optional(),
  DASHSCOPE_RERANK_URL: z
    .url()
    .default("https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank"),
  DBOS__VMID: z.string().trim().min(1).optional(),
  KNOWLEDGE_EMBEDDING_DIMENSION: positiveInteger.default(512),
  KNOWLEDGE_EMBEDDING_MODEL: z.string().trim().min(1).default("text-embedding-v4"),
  KNOWLEDGE_INDEXING_ENABLED: booleanValue.default(false),
  KNOWLEDGE_RERANK_MODEL: z.string().trim().min(1).default("qwen3-rerank"),
  KNOWLEDGE_RERANK_TIMEOUT_MS: positiveInteger.default(12_000),
  SPECTRA_VISUAL_DESCRIPTION_MODEL_ID: z.string().trim().min(1).default("qwen3.7-plus"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"]).default("info"),
  MASTRA_OBSERVABILITY_DATABASE_URL: postgresUrl.optional(),
  MINERU_API_TOKEN: z.string().trim().min(1).optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  OPENHANDS_AGENT_MAX_ITERATIONS: positiveInteger.default(200),
  OPENHANDS_CONDENSER_MAX_EVENTS: positiveInteger.default(80),
  OPENHANDS_CONDENSER_MAX_OUTPUT_TOKENS: positiveInteger.default(4_096),
  OPENHANDS_CONDENSER_MAX_TOKENS: positiveInteger.default(200_000),
  OPENHANDS_EXECUTION_ENABLED: booleanValue.default(false),
  OPENHANDS_LLM_API_KEY: z.string().trim().min(1).optional(),
  OPENHANDS_LLM_BASE_URL: z.url().optional(),
  OPENHANDS_LLM_ENABLE_THINKING: booleanValue.default(true),
  OPENHANDS_LLM_MODEL: z.string().trim().min(1).optional(),
  OPENHANDS_LLM_REASONING_EFFORT: z
    .enum(["low", "medium", "high", "xhigh", "none"])
    .default("medium"),
  OPENHANDS_LLM_TIMEOUT_SECONDS: positiveInteger.default(900),
  OPENHANDS_POLL_INTERVAL_MS: positiveInteger.default(15_000),
  OPENHANDS_RUNTIME_API_KEY: z.string().trim().min(1).optional(),
  OPENHANDS_RUNTIME_URL: optionalUrl,
  OPENHANDS_RUNTIME_URL_TEMPLATE: z.string().trim().min(1).optional(),
  OPENHANDS_VNC_URL_TEMPLATE: z.string().trim().min(1).optional(),
  OPENHANDS_VSCODE_URL_TEMPLATE: z.string().trim().min(1).optional(),
  OPENHANDS_WORKSPACE_ROOT: z
    .string()
    .regex(/^\/[a-zA-Z0-9._/-]+$/)
    .default("/workspace/spectra"),
  OPENHANDS_WORKSPACE_URL_TEMPLATE: z.string().trim().min(1).optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalOtlpHttpUrl,
  OTEL_EXPORTER_OTLP_HEADERS: z.string().trim().min(1).optional(),
  OTEL_TRACES_SAMPLER: otelTraceSampler,
  OTEL_TRACES_SAMPLER_ARG: otelTraceSamplerArgument,
  PRESENTATION_AGENT_MAX_ACCUMULATED_TOKENS: positiveInteger.default(12_000_000),
  PRESENTATION_ATTEMPT_TIMEOUT_MS: positiveInteger.default(2_100_000),
  PRESENTATION_COLLECTION_RESERVE_MS: positiveInteger.default(300_000),
  PRESENTATION_MAX_FAILED_VISUAL_CHECKS: positiveInteger.default(8),
  PRESENTATION_MAX_STALLED_VISUAL_CHECKS: positiveInteger.default(3),
  PRESENTATION_PUBLISHED: booleanValue.default(false),
  REDIS_URL: redisUrl.optional(),
  REMOTION_BROWSER_EXECUTABLE: z.string().trim().min(1).optional(),
  STORAGE_ACCESS_KEY_ID: z.string().trim().min(1).optional(),
  STORAGE_BUCKET: z
    .string()
    .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/)
    .optional(),
  STORAGE_ENDPOINT: optionalUrl,
  STORAGE_FORCE_PATH_STYLE: booleanValue.default(false),
  STORAGE_REGION: z.string().trim().min(1).optional(),
  STORAGE_SECRET_ACCESS_KEY: z.string().trim().min(1).optional(),
  SMTP_HOST: z.string().trim().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
  SMTP_SECURE: booleanValue.default(true),
  SMTP_USER: z.string().trim().min(1).optional(),
  STRATUMIND_API_KEY: z.string().trim().min(1).optional(),
  STRATUMIND_COLLECTION: z.string().trim().min(1).default("spectra-knowledge-v1-512"),
  STRATUMIND_URL: z.url().default("http://127.0.0.1:6333"),
  WORKER_HEALTH_PORT: positiveInteger.default(8_787),
} satisfies Record<string, z.ZodType>;

const coreEnvironmentSchema = z.object({
  DASHSCOPE_API_KEY: z.string().min(1),
  DASHSCOPE_BASE_URL: z.url(),
  STORAGE_ACCESS_KEY_ID: z.string().min(1),
  STORAGE_BUCKET: z.string().min(1),
  STORAGE_ENDPOINT: z.url(),
  STORAGE_REGION: z.string().min(1),
  STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
});

const webEnvironmentSchema = coreEnvironmentSchema.extend({
  BETTER_AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_URL: z.url(),
  REDIS_URL: z.url(),
});

const workerEnvironmentSchema = coreEnvironmentSchema.extend({
  DBOS__VMID: z.string().min(1).optional(),
});

export function serverEnvironment(
  runtimeEnvironment: Readonly<Record<string, string | undefined>> = process.env,
) {
  return createEnv({
    emptyStringAsUndefined: true,
    isServer: runtimeEnvironment.NODE_ENV === "test" || typeof window === "undefined",
    runtimeEnv: {
      ANIMATION_ATTEMPT_TIMEOUT_MS: runtimeEnvironment.ANIMATION_ATTEMPT_TIMEOUT_MS,
      ANIMATION_EXECUTION_ENABLED: runtimeEnvironment.ANIMATION_EXECUTION_ENABLED,
      ANIMATION_PUBLISHED: runtimeEnvironment.ANIMATION_PUBLISHED,
      ANIMATION_RENDER_CONCURRENCY: runtimeEnvironment.ANIMATION_RENDER_CONCURRENCY,
      ANIMATION_RENDER_SANDBOX_EXECUTABLE: runtimeEnvironment.ANIMATION_RENDER_SANDBOX_EXECUTABLE,
      ANIMATION_RENDER_TIMEOUT_MS: runtimeEnvironment.ANIMATION_RENDER_TIMEOUT_MS,
      AUTH_SIGN_UP_ENABLED: runtimeEnvironment.AUTH_SIGN_UP_ENABLED,
      BETTER_AUTH_SECRET: runtimeEnvironment.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: runtimeEnvironment.BETTER_AUTH_URL,
      EMAIL_FROM: runtimeEnvironment.EMAIL_FROM,
      DATABASE_URL: runtimeEnvironment.DATABASE_URL,
      DASHSCOPE_API_KEY: runtimeEnvironment.DASHSCOPE_API_KEY,
      DASHSCOPE_BASE_URL: runtimeEnvironment.DASHSCOPE_BASE_URL,
      DASHSCOPE_RERANK_URL: runtimeEnvironment.DASHSCOPE_RERANK_URL,
      DBOS__VMID: runtimeEnvironment.DBOS__VMID,
      KNOWLEDGE_EMBEDDING_DIMENSION: runtimeEnvironment.KNOWLEDGE_EMBEDDING_DIMENSION,
      KNOWLEDGE_EMBEDDING_MODEL: runtimeEnvironment.KNOWLEDGE_EMBEDDING_MODEL,
      KNOWLEDGE_INDEXING_ENABLED: runtimeEnvironment.KNOWLEDGE_INDEXING_ENABLED,
      KNOWLEDGE_RERANK_MODEL: runtimeEnvironment.KNOWLEDGE_RERANK_MODEL,
      KNOWLEDGE_RERANK_TIMEOUT_MS: runtimeEnvironment.KNOWLEDGE_RERANK_TIMEOUT_MS,
      SPECTRA_VISUAL_DESCRIPTION_MODEL_ID: runtimeEnvironment.SPECTRA_VISUAL_DESCRIPTION_MODEL_ID,
      LOG_LEVEL: runtimeEnvironment.LOG_LEVEL,
      MASTRA_OBSERVABILITY_DATABASE_URL: runtimeEnvironment.MASTRA_OBSERVABILITY_DATABASE_URL,
      MINERU_API_TOKEN: runtimeEnvironment.MINERU_API_TOKEN,
      NODE_ENV: runtimeEnvironment.NODE_ENV,
      OPENHANDS_AGENT_MAX_ITERATIONS: runtimeEnvironment.OPENHANDS_AGENT_MAX_ITERATIONS,
      OPENHANDS_CONDENSER_MAX_EVENTS: runtimeEnvironment.OPENHANDS_CONDENSER_MAX_EVENTS,
      OPENHANDS_CONDENSER_MAX_OUTPUT_TOKENS:
        runtimeEnvironment.OPENHANDS_CONDENSER_MAX_OUTPUT_TOKENS,
      OPENHANDS_CONDENSER_MAX_TOKENS: runtimeEnvironment.OPENHANDS_CONDENSER_MAX_TOKENS,
      OPENHANDS_EXECUTION_ENABLED: runtimeEnvironment.OPENHANDS_EXECUTION_ENABLED,
      OPENHANDS_LLM_API_KEY: runtimeEnvironment.OPENHANDS_LLM_API_KEY,
      OPENHANDS_LLM_BASE_URL: runtimeEnvironment.OPENHANDS_LLM_BASE_URL,
      OPENHANDS_LLM_ENABLE_THINKING: runtimeEnvironment.OPENHANDS_LLM_ENABLE_THINKING,
      OPENHANDS_LLM_MODEL: runtimeEnvironment.OPENHANDS_LLM_MODEL,
      OPENHANDS_LLM_REASONING_EFFORT: runtimeEnvironment.OPENHANDS_LLM_REASONING_EFFORT,
      OPENHANDS_LLM_TIMEOUT_SECONDS: runtimeEnvironment.OPENHANDS_LLM_TIMEOUT_SECONDS,
      OPENHANDS_POLL_INTERVAL_MS: runtimeEnvironment.OPENHANDS_POLL_INTERVAL_MS,
      OPENHANDS_RUNTIME_API_KEY: runtimeEnvironment.OPENHANDS_RUNTIME_API_KEY,
      OPENHANDS_RUNTIME_URL: runtimeEnvironment.OPENHANDS_RUNTIME_URL,
      OPENHANDS_RUNTIME_URL_TEMPLATE: runtimeEnvironment.OPENHANDS_RUNTIME_URL_TEMPLATE,
      OPENHANDS_VNC_URL_TEMPLATE: runtimeEnvironment.OPENHANDS_VNC_URL_TEMPLATE,
      OPENHANDS_VSCODE_URL_TEMPLATE: runtimeEnvironment.OPENHANDS_VSCODE_URL_TEMPLATE,
      OPENHANDS_WORKSPACE_ROOT: runtimeEnvironment.OPENHANDS_WORKSPACE_ROOT,
      OPENHANDS_WORKSPACE_URL_TEMPLATE: runtimeEnvironment.OPENHANDS_WORKSPACE_URL_TEMPLATE,
      OTEL_EXPORTER_OTLP_ENDPOINT: runtimeEnvironment.OTEL_EXPORTER_OTLP_ENDPOINT,
      OTEL_EXPORTER_OTLP_HEADERS: runtimeEnvironment.OTEL_EXPORTER_OTLP_HEADERS,
      OTEL_TRACES_SAMPLER: runtimeEnvironment.OTEL_TRACES_SAMPLER,
      OTEL_TRACES_SAMPLER_ARG: runtimeEnvironment.OTEL_TRACES_SAMPLER_ARG,
      PRESENTATION_AGENT_MAX_ACCUMULATED_TOKENS:
        runtimeEnvironment.PRESENTATION_AGENT_MAX_ACCUMULATED_TOKENS,
      PRESENTATION_ATTEMPT_TIMEOUT_MS: runtimeEnvironment.PRESENTATION_ATTEMPT_TIMEOUT_MS,
      PRESENTATION_COLLECTION_RESERVE_MS: runtimeEnvironment.PRESENTATION_COLLECTION_RESERVE_MS,
      PRESENTATION_MAX_FAILED_VISUAL_CHECKS:
        runtimeEnvironment.PRESENTATION_MAX_FAILED_VISUAL_CHECKS,
      PRESENTATION_MAX_STALLED_VISUAL_CHECKS:
        runtimeEnvironment.PRESENTATION_MAX_STALLED_VISUAL_CHECKS,
      PRESENTATION_PUBLISHED: runtimeEnvironment.PRESENTATION_PUBLISHED,
      REDIS_URL: runtimeEnvironment.REDIS_URL,
      REMOTION_BROWSER_EXECUTABLE: runtimeEnvironment.REMOTION_BROWSER_EXECUTABLE,
      STORAGE_ACCESS_KEY_ID: runtimeEnvironment.STORAGE_ACCESS_KEY_ID,
      STORAGE_BUCKET: runtimeEnvironment.STORAGE_BUCKET,
      STORAGE_ENDPOINT: runtimeEnvironment.STORAGE_ENDPOINT,
      STORAGE_FORCE_PATH_STYLE: runtimeEnvironment.STORAGE_FORCE_PATH_STYLE,
      STORAGE_REGION: runtimeEnvironment.STORAGE_REGION,
      STORAGE_SECRET_ACCESS_KEY: runtimeEnvironment.STORAGE_SECRET_ACCESS_KEY,
      SMTP_HOST: runtimeEnvironment.SMTP_HOST,
      SMTP_PASSWORD: runtimeEnvironment.SMTP_PASSWORD,
      SMTP_PORT: runtimeEnvironment.SMTP_PORT,
      SMTP_SECURE: runtimeEnvironment.SMTP_SECURE,
      SMTP_USER: runtimeEnvironment.SMTP_USER,
      STRATUMIND_API_KEY: runtimeEnvironment.STRATUMIND_API_KEY,
      STRATUMIND_COLLECTION: runtimeEnvironment.STRATUMIND_COLLECTION,
      STRATUMIND_URL: runtimeEnvironment.STRATUMIND_URL,
      WORKER_HEALTH_PORT: runtimeEnvironment.WORKER_HEALTH_PORT,
    },
    server: serverEnvironmentSchema,
  });
}

export type ServerEnvironment = ReturnType<typeof serverEnvironment>;

function validateDatabaseEnvironment(environment: ServerEnvironment) {
  if (environment.NODE_ENV === "production" && !environment.DATABASE_URL) {
    throw new Error("DATABASE_URL is required in production");
  }
}

export function validateWebEnvironment(
  environment: ServerEnvironment = serverEnvironment(),
): ServerEnvironment {
  validateDatabaseEnvironment(environment);
  const validated = webEnvironmentSchema.parse(environment);
  if (environment.NODE_ENV === "production" && validated.BETTER_AUTH_SECRET.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must be at least 32 characters in production");
  }
  return environment;
}

export function validateWorkerEnvironment(
  environment: ServerEnvironment = serverEnvironment(),
): ServerEnvironment {
  validateDatabaseEnvironment(environment);
  workerEnvironmentSchema.parse(environment);
  if (environment.NODE_ENV === "production" && !environment.DBOS__VMID) {
    throw new Error("DBOS__VMID is required in production");
  }
  return environment;
}

export const applicationEnvironmentKeys = Object.freeze(
  Object.keys(serverEnvironmentSchema).sort(),
);
