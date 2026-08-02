import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { OPENHANDS_AGENT_SERVER_VERSION, REQUIRED_OPENHANDS_TOOLS } from "./agent-server-contract";
import type { OpenHandsRuntimeEnvironment } from "./config.server";
import { type TaskAgentRecipeVersion, taskAgentRecipes } from "./recipe";

const MAX_OUTPUT_ARCHIVE_BYTES = 100 * 1024 * 1024;
const MAX_OUTPUT_FILE_BYTES = 25 * 1024 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const ARCHIVE_REQUEST_TIMEOUT_MS = 120_000;
const BASH_REQUEST_TIMEOUT_MS = 30_000;

const executionStatusSchema = z.enum([
  "idle",
  "running",
  "paused",
  "waiting_for_confirmation",
  "finished",
  "error",
  "stuck",
  "deleting",
]);
const tokenUsageSchema = z
  .object({
    cache_read_tokens: z.number().int().nonnegative().default(0),
    cache_write_tokens: z.number().int().nonnegative().default(0),
    completion_tokens: z.number().int().nonnegative().default(0),
    context_window: z.number().int().nonnegative().default(0),
    model: z.string().default(""),
    per_turn_token: z.number().int().nonnegative().default(0),
    prompt_tokens: z.number().int().nonnegative().default(0),
    reasoning_tokens: z.number().int().nonnegative().default(0),
  })
  .loose();
const usageMetricSchema = z
  .object({
    accumulated_token_usage: tokenUsageSchema.nullish(),
  })
  .loose();
const conversationStatsSchema = z
  .object({
    usage_to_metrics: z.record(z.string(), usageMetricSchema).default({}),
  })
  .loose();
const metricsSnapshotSchema = z
  .object({
    accumulated_token_usage: tokenUsageSchema.nullish(),
  })
  .loose();
const conversationSchema = z
  .object({
    execution_status: executionStatusSchema,
    id: z.string().uuid(),
    metrics: metricsSnapshotSchema.nullish(),
    stats: conversationStatsSchema.optional(),
  })
  .loose();
const eventsSchema = z
  .object({
    items: z.array(z.record(z.string(), z.unknown())),
    next_page_id: z.string().nullable(),
  })
  .loose();
const serverInfoSchema = z
  .object({
    usable_tools: z.array(z.string()),
    version: z.string().min(1),
  })
  .loose();
const successSchema = z.object({ success: z.literal(true) }).loose();
const bashResultSchema = z
  .object({
    exit_code: z.number().int(),
    stderr: z
      .string()
      .nullish()
      .transform((value) => value ?? ""),
    stdout: z
      .string()
      .nullish()
      .transform((value) => value ?? ""),
  })
  .loose();

type OpenHandsConversationStatus = z.infer<typeof executionStatusSchema>;

export type OpenHandsTokenUsage = {
  cacheReadTokens: number;
  cacheWriteTokens: number;
  completionTokens: number;
  contextWindow: number;
  model: string;
  perTurnTokens: number;
  promptTokens: number;
  reasoningTokens: number;
};

export type OpenHandsAuthoringClient = {
  continueConversation(input: {
    conversationId: string;
    deadlineAt?: string;
    idempotencyKey?: string;
    message: string;
    signal?: AbortSignal | undefined;
  }): Promise<void>;
  createConversation(input: {
    conversationId: string;
    deadlineAt?: string;
    instruction: string;
    signal?: AbortSignal | undefined;
    workspacePath: string;
  }): Promise<{ conversationId: string; status: OpenHandsConversationStatus }>;
  downloadArchive(input: {
    deadlineAt?: string;
    path: string;
    signal?: AbortSignal | undefined;
  }): Promise<{ archive: Uint8Array; sha256: string }>;
  downloadFile(input: {
    deadlineAt?: string;
    maxBytes?: number;
    path: string;
    signal?: AbortSignal | undefined;
  }): Promise<Uint8Array>;
  executeBashCommand?(input: {
    command: string;
    cwd: string;
    deadlineAt?: string;
    signal?: AbortSignal | undefined;
    timeout?: number;
  }): Promise<{ exitCode: number; stderr: string; stdout: string }>;
  getConversation(input: {
    conversationId: string;
    deadlineAt?: string;
    signal?: AbortSignal | undefined;
  }): Promise<
    | { found: false }
    | {
        found: true;
        status: OpenHandsConversationStatus;
        usageById: Record<string, OpenHandsTokenUsage>;
      }
  >;
  getServerInfo(input?: {
    deadlineAt?: string;
    signal?: AbortSignal | undefined;
  }): Promise<{ usable_tools: string[]; version: string }>;
  listEvents(input: {
    conversationId: string;
    cursor?: string | null;
    deadlineAt?: string;
    limit?: number;
    order?: "newest" | "oldest";
    signal?: AbortSignal | undefined;
  }): Promise<{ cursor: string | null; items: Array<Record<string, unknown>> }>;
  stopConversation(input: {
    conversationId: string;
    signal?: AbortSignal | undefined;
  }): Promise<void>;
  uploadFile(input: {
    body: Uint8Array;
    contentType: string;
    deadlineAt?: string;
    path: string;
    signal?: AbortSignal;
  }): Promise<void>;
};

function noTrailingSlash(url: string) {
  return url.replace(/\/+$/, "");
}

function requestHeaders(environment: OpenHandsRuntimeEnvironment) {
  return { "X-Session-API-Key": environment.apiKey };
}

function boundedTimeout(defaultTimeoutMs: number, deadlineAt?: string) {
  if (!deadlineAt) return defaultTimeoutMs;
  const remaining = new Date(deadlineAt).getTime() - Date.now();
  if (remaining <= 0) throw new Error("task_agent_deadline_exceeded");
  return Math.min(defaultTimeoutMs, remaining);
}

function normalizedTokenUsage(value: z.infer<typeof tokenUsageSchema>): OpenHandsTokenUsage {
  return {
    cacheReadTokens: value.cache_read_tokens,
    cacheWriteTokens: value.cache_write_tokens,
    completionTokens: value.completion_tokens,
    contextWindow: value.context_window,
    model: value.model,
    perTurnTokens: value.per_turn_token,
    promptTokens: value.prompt_tokens,
    reasoningTokens: value.reasoning_tokens,
  };
}

function conversationUsage(conversation: z.infer<typeof conversationSchema>) {
  const usageById: Record<string, OpenHandsTokenUsage> = {};
  for (const [usageId, metrics] of Object.entries(conversation.stats?.usage_to_metrics ?? {})) {
    if (metrics.accumulated_token_usage) {
      usageById[usageId] = normalizedTokenUsage(metrics.accumulated_token_usage);
    }
  }
  if (Object.keys(usageById).length === 0 && conversation.metrics?.accumulated_token_usage) {
    usageById.conversation = normalizedTokenUsage(conversation.metrics.accumulated_token_usage);
  }
  return usageById;
}

function withTimeout(
  init: RequestInit,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): RequestInit {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return {
    ...init,
    signal: externalSignal ? AbortSignal.any([externalSignal, timeoutSignal]) : timeoutSignal,
  };
}

async function responseJson(response: Response) {
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`openhands_http_${response.status}`);
    Object.assign(error, { status: response.status, value });
    throw error;
  }
  return value;
}

async function boundedResponseBytes(response: Response, maxBytes: number, sizeError: string) {
  if (!response.ok) await responseJson(response);
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error(sizeError);
  }
  if (!response.body) throw new Error("openhands_output_archive_missing");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error(sizeError);
    }
    chunks.push(chunk.value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export function stableTaskAgentConversationId(
  recipeVersion: TaskAgentRecipeVersion,
  generationAttemptId: string,
) {
  const hex = createHash("sha256")
    .update(`spectra:${recipeVersion}:${generationAttemptId}`)
    .digest("hex")
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(
    17,
    20,
  )}-${hex.slice(20)}`;
}

function conversationRequest(
  environment: OpenHandsRuntimeEnvironment,
  input: {
    conversationId: string;
    instruction: string;
    workspacePath: string;
  },
) {
  const recipe = taskAgentRecipes[environment.recipeVersion];
  const isPresentation = environment.recipeVersion === "presentation-pptd-v1";
  const condenserUsageId = isPresentation
    ? "spectra-presentation-condenser"
    : "spectra-animation-condenser";
  const llm = {
    api_key: environment.llmApiKey,
    base_url: environment.llmBaseUrl,
    litellm_extra_body: environment.llmEnableThinking ? { enable_thinking: true } : {},
    model: environment.llmModel,
    native_tool_calling: true,
    num_retries: 2,
    ...(isPresentation ? { reasoning_effort: environment.llmReasoningEffort } : {}),
    retry_max_wait: 8,
    retry_min_wait: 2,
    retry_multiplier: 2,
    stream: true,
    timeout: environment.llmTimeoutSeconds,
    usage_id: isPresentation ? "spectra-presentation-agent" : "spectra-task-agent",
  };
  return {
    agent: {
      condenser: {
        keep_first: 4,
        kind: "LLMSummarizingCondenser",
        llm: {
          ...llm,
          litellm_extra_body: { enable_thinking: false },
          max_output_tokens: environment.condenserMaxOutputTokens,
          reasoning_effort: "none",
          stream: false,
          usage_id: condenserUsageId,
        },
        max_size: environment.condenserMaxEvents,
        max_tokens: environment.condenserMaxTokens,
        minimum_progress: 0.1,
      },
      include_default_tools: ["FinishTool", "ThinkTool"],
      kind: "Agent",
      llm,
      security_policy_filename: "",
      tools: [{ name: "terminal" }, { name: "file_editor" }, { name: "task_tracker" }],
    },
    autotitle: false,
    conversation_id: input.conversationId,
    initial_message: {
      content: [{ text: input.instruction }],
      role: "user",
      run: false,
    },
    max_iterations: environment.maxIterations,
    plugins: [{ source: recipe.pluginPath }],
    stuck_detection: true,
    tags: { recipe: recipe.recipeVersion },
    workspace: { kind: "LocalWorkspace", working_dir: input.workspacePath },
    worktree: false,
  };
}

export function createOpenHandsAuthoringClient(
  environment: OpenHandsRuntimeEnvironment,
  fetchImplementation: typeof fetch = fetch,
): OpenHandsAuthoringClient {
  const baseUrl = noTrailingSlash(environment.runtimeUrl);
  const headers = requestHeaders(environment);
  const getConversation: OpenHandsAuthoringClient["getConversation"] = async (input) => {
    const response = await fetchImplementation(
      `${baseUrl}/api/conversations/${input.conversationId}`,
      withTimeout(
        { headers },
        boundedTimeout(DEFAULT_REQUEST_TIMEOUT_MS, input.deadlineAt),
        input.signal,
      ),
    );
    if (response.status === 404) return { found: false };
    const conversation = conversationSchema.parse(await responseJson(response));
    if (conversation.id !== input.conversationId) {
      throw new Error("openhands_conversation_identity_conflict");
    }
    return {
      found: true,
      status: conversation.execution_status,
      usageById: conversationUsage(conversation),
    };
  };
  const listEvents: OpenHandsAuthoringClient["listEvents"] = async (input) => {
    const query = new URLSearchParams({
      limit: String(input.limit ?? 10),
      sort_order: input.order === "newest" ? "TIMESTAMP_DESC" : "TIMESTAMP",
    });
    if (input.cursor) query.set("page_id", input.cursor);
    const response = await fetchImplementation(
      `${baseUrl}/api/conversations/${input.conversationId}/events/search?${query}`,
      withTimeout(
        { headers },
        boundedTimeout(DEFAULT_REQUEST_TIMEOUT_MS, input.deadlineAt),
        input.signal,
      ),
    );
    const events = eventsSchema.parse(await responseJson(response));
    const lastEventId = events.items.at(-1)?.id;
    return {
      cursor:
        events.next_page_id ??
        (typeof lastEventId === "string" ? lastEventId : (input.cursor ?? null)),
      items: events.items,
    };
  };
  const submitInstruction = async (input: {
    conversationId: string;
    deadlineAt?: string;
    idempotencyKey?: string;
    instruction: string;
    signal?: AbortSignal | undefined;
  }) => {
    const response = await fetchImplementation(
      `${baseUrl}/api/conversations/${input.conversationId}/events`,
      withTimeout(
        {
          body: JSON.stringify({
            content: [{ text: input.instruction }],
            role: "user",
            run: true,
          }),
          headers: {
            ...headers,
            ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}),
            "content-type": "application/json",
          },
          method: "POST",
        },
        boundedTimeout(DEFAULT_REQUEST_TIMEOUT_MS, input.deadlineAt),
        input.signal,
      ),
    );
    successSchema.parse(await responseJson(response));
  };
  const runConversation = async (input: {
    conversationId: string;
    deadlineAt?: string;
    signal?: AbortSignal | undefined;
  }) => {
    const response = await fetchImplementation(
      `${baseUrl}/api/conversations/${input.conversationId}/run`,
      withTimeout(
        { headers, method: "POST" },
        boundedTimeout(DEFAULT_REQUEST_TIMEOUT_MS, input.deadlineAt),
        input.signal,
      ),
    );
    if (response.status !== 409) successSchema.parse(await responseJson(response));
  };

  return {
    async continueConversation(input) {
      if (input.idempotencyKey) {
        const existing = await listEvents({
          conversationId: input.conversationId,
          ...(input.deadlineAt ? { deadlineAt: input.deadlineAt } : {}),
          limit: 50,
          order: "newest",
          ...(input.signal ? { signal: input.signal } : {}),
        });
        if (
          existing.items.some((event) =>
            JSON.stringify(event).includes(input.idempotencyKey as string),
          )
        ) {
          return;
        }
      }
      const instruction = input.idempotencyKey
        ? `${input.message}\n\n[Spectra internal continuation marker: ${input.idempotencyKey}]`
        : input.message;
      await submitInstruction({ ...input, instruction });
    },
    async getServerInfo(input = {}) {
      const response = await fetchImplementation(
        `${baseUrl}/server_info`,
        withTimeout(
          { headers },
          boundedTimeout(DEFAULT_REQUEST_TIMEOUT_MS, input.deadlineAt),
          input.signal,
        ),
      );
      const info = serverInfoSchema.parse(await responseJson(response));
      if (info.version !== OPENHANDS_AGENT_SERVER_VERSION) {
        throw new Error("openhands_server_version_conflict");
      }
      if (REQUIRED_OPENHANDS_TOOLS.some((tool) => !info.usable_tools.includes(tool))) {
        throw new Error("openhands_required_tools_missing");
      }
      return info;
    },
    getConversation,
    async createConversation(input) {
      const existing = await getConversation(input);
      if (existing.found) {
        if (existing.status === "idle" || existing.status === "paused") {
          const events = await listEvents({
            ...input,
            limit: 50,
            order: "newest",
          });
          const hasUserMessage = events.items.some(
            (event) => event.source === "user" || event.role === "user",
          );
          if (hasUserMessage) {
            await runConversation(input);
          } else {
            await submitInstruction(input);
          }
          return { conversationId: input.conversationId, status: "running" };
        }
        return {
          conversationId: input.conversationId,
          status: existing.status,
        };
      }
      const response = await fetchImplementation(
        `${baseUrl}/api/conversations`,
        withTimeout(
          {
            body: JSON.stringify(conversationRequest(environment, input)),
            headers: { ...headers, "content-type": "application/json" },
            method: "POST",
          },
          boundedTimeout(DEFAULT_REQUEST_TIMEOUT_MS, input.deadlineAt),
          input.signal,
        ),
      );
      const conversation = conversationSchema.parse(await responseJson(response));
      if (conversation.id !== input.conversationId) {
        throw new Error("openhands_conversation_identity_conflict");
      }
      if (conversation.execution_status === "idle" || conversation.execution_status === "paused") {
        await runConversation(input);
        return { conversationId: conversation.id, status: "running" };
      }
      return {
        conversationId: conversation.id,
        status: conversation.execution_status,
      };
    },
    listEvents,
    async executeBashCommand(input) {
      const response = await fetchImplementation(
        `${baseUrl}/api/bash/execute_bash_command`,
        withTimeout(
          {
            body: JSON.stringify({
              command: input.command,
              cwd: input.cwd,
              timeout: input.timeout ?? 30,
            }),
            headers: { ...headers, "content-type": "application/json" },
            method: "POST",
          },
          boundedTimeout(BASH_REQUEST_TIMEOUT_MS, input.deadlineAt),
          input.signal,
        ),
      );
      const result = bashResultSchema.parse(await responseJson(response));
      return { exitCode: result.exit_code, stderr: result.stderr, stdout: result.stdout };
    },
    async uploadFile(input) {
      const body = new FormData();
      const bytes = new Uint8Array(input.body.byteLength);
      bytes.set(input.body);
      body.append("file", new Blob([bytes.buffer], { type: input.contentType }), "input");
      const response = await fetchImplementation(
        `${baseUrl}/api/file/upload?path=${encodeURIComponent(input.path)}`,
        withTimeout(
          { body, headers, method: "POST" },
          boundedTimeout(ARCHIVE_REQUEST_TIMEOUT_MS, input.deadlineAt),
          input.signal,
        ),
      );
      successSchema.parse(await responseJson(response));
    },
    async downloadArchive(input) {
      const query = new URLSearchParams({
        format: "tar.gz",
        path: input.path,
        use_default_excludes: "true",
      });
      const response = await fetchImplementation(
        `${baseUrl}/api/file/archive?${query}`,
        withTimeout(
          { headers },
          boundedTimeout(ARCHIVE_REQUEST_TIMEOUT_MS, input.deadlineAt),
          input.signal,
        ),
      );
      const archive = await boundedResponseBytes(
        response,
        MAX_OUTPUT_ARCHIVE_BYTES,
        "openhands_output_archive_size",
      );
      return {
        archive,
        sha256: createHash("sha256").update(archive).digest("hex"),
      };
    },
    async downloadFile(input) {
      const maxBytes = Math.min(input.maxBytes ?? MAX_OUTPUT_FILE_BYTES, MAX_OUTPUT_FILE_BYTES);
      if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
        throw new Error("openhands_output_file_size");
      }
      const query = new URLSearchParams({ path: input.path });
      const response = await fetchImplementation(
        `${baseUrl}/api/file/download?${query}`,
        withTimeout(
          { headers },
          boundedTimeout(DEFAULT_REQUEST_TIMEOUT_MS, input.deadlineAt),
          input.signal,
        ),
      );
      return boundedResponseBytes(response, maxBytes, "openhands_output_file_size");
    },
    async stopConversation(input) {
      const response = await fetchImplementation(
        `${baseUrl}/api/conversations/${input.conversationId}/interrupt`,
        withTimeout({ headers, method: "POST" }, DEFAULT_REQUEST_TIMEOUT_MS, input.signal),
      );
      if (![400, 404].includes(response.status)) {
        successSchema.parse(await responseJson(response));
      }
    },
  };
}
