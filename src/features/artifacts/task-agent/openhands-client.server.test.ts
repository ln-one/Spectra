import { createHash } from "node:crypto";
import { expect, test, vi } from "vitest";
import type { OpenHandsAuthoringEnvironment } from "./config.server";
import {
  createOpenHandsAuthoringClient,
  stableTaskAgentConversationId,
} from "./openhands-client.server";

const environment: OpenHandsAuthoringEnvironment = {
  apiKey: "runtime-key",
  condenserMaxEvents: 80,
  condenserMaxOutputTokens: 4_096,
  condenserMaxTokens: 200_000,
  enabled: true,
  llmApiKey: "llm-key",
  llmBaseUrl: "http://openhands-llm-proxy:4000/v1",
  llmEnableThinking: true,
  llmModel: "openai/spectra-authoring",
  llmReasoningEffort: "medium",
  llmTimeoutSeconds: 900,
  maxDurationMs: 30 * 60_000,
  maxIterations: 200,
  pollIntervalMs: 15_000,
  presentationBudget: {
    collectionReserveMs: 300_000,
    maxAccumulatedTokens: 12_000_000,
    maxFailedVisualChecks: 8,
    maxStalledVisualChecks: 3,
  },
  recipeVersion: "presentation-pptd-v1",
  runtimeUrl: "http://127.0.0.1:8000",
  workspaceIsolation: "local_development",
  workspaceRoot: "/workspace/spectra",
};

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
    status,
  });
}

test("uses a stable conversation id for one generation attempt", () => {
  const first = stableTaskAgentConversationId(
    "presentation-pptd-v1",
    "00000000-0000-4000-8000-000000000001",
  );
  expect(first).toBe(
    stableTaskAgentConversationId("presentation-pptd-v1", "00000000-0000-4000-8000-000000000001"),
  );
  expect(first).toMatch(/^[0-9a-f-]{36}$/);
});

test("checks the pinned official Agent Server version", async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    jsonResponse({
      usable_tools: ["file_editor", "task_tracker", "terminal"],
      version: "1.37.1",
    }),
  );
  const client = createOpenHandsAuthoringClient(environment, fetchMock);
  await expect(client.getServerInfo()).resolves.toEqual({
    usable_tools: ["file_editor", "task_tracker", "terminal"],
    version: "1.37.1",
  });
  expect(fetchMock.mock.calls[0]?.[0]).toBe("http://127.0.0.1:8000/server_info");
});

test("creates and runs a conversation with the pinned plugin and single model", async () => {
  const conversationId = "00000000-0000-4000-8000-000000000011";
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(jsonResponse({}, 404))
    .mockResolvedValueOnce(jsonResponse({ execution_status: "idle", id: conversationId }))
    .mockResolvedValueOnce(jsonResponse({ success: true }));
  const client = createOpenHandsAuthoringClient(environment, fetchMock);

  await expect(
    client.createConversation({
      conversationId,
      instruction: "Create the presentation.",
      workspacePath: "/workspace/spectra/00000000-0000-4000-8000-000000000001",
    }),
  ).resolves.toEqual({ conversationId, status: "running" });

  const createCall = fetchMock.mock.calls[1];
  const request = createCall?.[1];
  const body = JSON.parse(String(request?.body));
  expect(body).toMatchObject({
    agent: {
      condenser: {
        keep_first: 4,
        kind: "LLMSummarizingCondenser",
        llm: {
          litellm_extra_body: { enable_thinking: false },
          max_output_tokens: 4_096,
          reasoning_effort: "none",
          stream: false,
          usage_id: "spectra-presentation-condenser",
        },
        max_size: 80,
        max_tokens: 200_000,
        minimum_progress: 0.1,
      },
      llm: {
        litellm_extra_body: { enable_thinking: true },
        model: "openai/spectra-authoring",
        reasoning_effort: "medium",
        usage_id: "spectra-presentation-agent",
      },
      tools: [{ name: "terminal" }, { name: "file_editor" }, { name: "task_tracker" }],
    },
    plugins: [{ source: "/opt/spectra/plugins/presentation" }],
    stuck_detection: true,
  });
  expect(fetchMock.mock.calls.map((call) => String(call[0]))).not.toContainEqual(
    expect.stringContaining("/spectra/"),
  );
});

test("enables context condensation for animation conversations", async () => {
  const conversationId = "00000000-0000-4000-8000-000000000014";
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(jsonResponse({}, 404))
    .mockResolvedValueOnce(jsonResponse({ execution_status: "idle", id: conversationId }))
    .mockResolvedValueOnce(jsonResponse({ success: true }));
  const client = createOpenHandsAuthoringClient(
    { ...environment, presentationBudget: null, recipeVersion: "animation-remotion-v1" },
    fetchMock,
  );

  await expect(
    client.createConversation({
      conversationId,
      instruction: "Create the animation.",
      workspacePath: "/workspace/spectra/00000000-0000-4000-8000-000000000001",
    }),
  ).resolves.toEqual({ conversationId, status: "running" });

  const createCall = fetchMock.mock.calls[1];
  const request = createCall?.[1];
  const body = JSON.parse(String(request?.body));
  expect(body).toMatchObject({
    agent: {
      condenser: {
        keep_first: 4,
        kind: "LLMSummarizingCondenser",
        llm: {
          litellm_extra_body: { enable_thinking: false },
          max_output_tokens: 4_096,
          reasoning_effort: "none",
          stream: false,
          usage_id: "spectra-animation-condenser",
        },
        max_size: 80,
        max_tokens: 200_000,
        minimum_progress: 0.1,
      },
      llm: {
        model: "openai/spectra-authoring",
        usage_id: "spectra-task-agent",
      },
    },
    plugins: [{ source: "/opt/spectra/plugins/animation" }],
  });
});

test("reuses an existing conversation after workflow recovery", async () => {
  const conversationId = "00000000-0000-4000-8000-000000000012";
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(jsonResponse({ execution_status: "running", id: conversationId }));
  const client = createOpenHandsAuthoringClient(environment, fetchMock);
  await expect(
    client.createConversation({
      conversationId,
      instruction: "Create the presentation.",
      workspacePath: "/workspace/spectra/00000000-0000-4000-8000-000000000001",
    }),
  ).resolves.toEqual({ conversationId, status: "running" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("recovers an incomplete idle conversation by resubmitting its instruction", async () => {
  const conversationId = "00000000-0000-4000-8000-000000000018";
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(jsonResponse({ execution_status: "idle", id: conversationId }))
    .mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            id: "00000000-0000-4000-8000-000000000019",
            kind: "ConversationStateUpdateEvent",
            source: "environment",
          },
        ],
        next_page_id: null,
      }),
    )
    .mockResolvedValueOnce(jsonResponse({ success: true }));
  const client = createOpenHandsAuthoringClient(environment, fetchMock);

  await expect(
    client.createConversation({
      conversationId,
      instruction: "Create the presentation.",
      workspacePath: "/workspace/spectra/00000000-0000-4000-8000-000000000001",
    }),
  ).resolves.toEqual({ conversationId, status: "running" });

  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/events/search?");
  expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
    body: JSON.stringify({
      content: [{ text: "Create the presentation." }],
      role: "user",
      run: true,
    }),
    method: "POST",
  });
});

test("runs a recovered idle conversation without duplicating an existing user message", async () => {
  const conversationId = "00000000-0000-4000-8000-000000000020";
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(jsonResponse({ execution_status: "idle", id: conversationId }))
    .mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            id: "00000000-0000-4000-8000-000000000021",
            kind: "MessageEvent",
            source: "user",
          },
        ],
        next_page_id: null,
      }),
    )
    .mockResolvedValueOnce(jsonResponse({ success: true }));
  const client = createOpenHandsAuthoringClient(environment, fetchMock);

  await expect(
    client.createConversation({
      conversationId,
      instruction: "Create the presentation.",
      workspacePath: "/workspace/spectra/00000000-0000-4000-8000-000000000001",
    }),
  ).resolves.toEqual({ conversationId, status: "running" });

  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(fetchMock.mock.calls[2]?.[0]).toBe(
    `http://127.0.0.1:8000/api/conversations/${conversationId}/run`,
  );
});

test("reads cumulative usage by OpenHands usage id without double-counting reasoning", async () => {
  const conversationId = "00000000-0000-4000-8000-000000000017";
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    jsonResponse({
      execution_status: "running",
      id: conversationId,
      metrics: null,
      stats: {
        usage_to_metrics: {
          "spectra-presentation-agent": {
            accumulated_token_usage: {
              completion_tokens: 200,
              prompt_tokens: 1_000,
              reasoning_tokens: 150,
            },
          },
          "spectra-presentation-condenser": {
            accumulated_token_usage: {
              completion_tokens: 50,
              prompt_tokens: 300,
              reasoning_tokens: 0,
            },
          },
        },
      },
    }),
  );
  const client = createOpenHandsAuthoringClient(environment, fetchMock);

  await expect(client.getConversation({ conversationId })).resolves.toMatchObject({
    found: true,
    status: "running",
    usageById: {
      "spectra-presentation-agent": {
        completionTokens: 200,
        promptTokens: 1_000,
        reasoningTokens: 150,
      },
      "spectra-presentation-condenser": {
        completionTokens: 50,
        promptTokens: 300,
        reasoningTokens: 0,
      },
    },
  });
});

test("keeps conversation inspection compatible when usage metrics are absent", async () => {
  const conversationId = "00000000-0000-4000-8000-000000000018";
  const client = createOpenHandsAuthoringClient(
    environment,
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ execution_status: "running", id: conversationId })),
  );
  await expect(client.getConversation({ conversationId })).resolves.toEqual({
    found: true,
    status: "running",
    usageById: {},
  });
});

test("reads events and downloads workspace files through the official endpoints", async () => {
  const archive = new TextEncoder().encode("archive");
  const file = new TextEncoder().encode("pages: [pages/cover.page]");
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(jsonResponse({ items: [{ id: "event-1" }], next_page_id: null }))
    .mockResolvedValueOnce(new Response(archive))
    .mockResolvedValueOnce(new Response(file));
  const client = createOpenHandsAuthoringClient(environment, fetchMock);
  await expect(
    client.listEvents({
      conversationId: "00000000-0000-4000-8000-000000000013",
      limit: 10,
      order: "newest",
    }),
  ).resolves.toEqual({ cursor: "event-1", items: [{ id: "event-1" }] });
  expect(String(fetchMock.mock.calls[0]?.[0])).toContain("sort_order=TIMESTAMP_DESC");
  await expect(client.downloadArchive({ path: "/workspace/spectra/attempt/out" })).resolves.toEqual(
    {
      archive,
      sha256: createHash("sha256").update(archive).digest("hex"),
    },
  );
  expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/api/file/archive?");
  await expect(
    client.downloadFile({
      path: "/workspace/spectra/attempt/out/presentation/presentation.pptd",
    }),
  ).resolves.toEqual(file);
  expect(String(fetchMock.mock.calls[2]?.[0])).toContain(
    "/api/file/download?path=%2Fworkspace%2Fspectra%2Fattempt%2Fout%2Fpresentation%2Fpresentation.pptd",
  );
});

test("cancels a workspace file response at the caller byte limit", async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(new Uint8Array([1, 2, 3, 4])));
  const client = createOpenHandsAuthoringClient(environment, fetchMock);

  await expect(
    client.downloadFile({
      maxBytes: 3,
      path: "/workspace/spectra/attempt/out/presentation/pages/cover.page",
    }),
  ).rejects.toThrow("openhands_output_file_size");
});

test("continues an existing conversation through the official message endpoint", async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ success: true }));
  const client = createOpenHandsAuthoringClient(environment, fetchMock);
  const conversationId = "00000000-0000-4000-8000-000000000015";
  await client.continueConversation({
    conversationId,
    deadlineAt: new Date(Date.now() + 60_000).toISOString(),
    message: "Please continue and use FinishTool when done.",
  });

  const [url, request] = fetchMock.mock.calls[0] ?? [];
  expect(url).toBe(`http://127.0.0.1:8000/api/conversations/${conversationId}/events`);
  expect(request?.method).toBe("POST");
  expect(JSON.parse(String(request?.body))).toEqual({
    content: [{ text: "Please continue and use FinishTool when done." }],
    role: "user",
    run: true,
  });
});

test("uses a persisted continuation marker before retrying a timed-out request", async () => {
  const conversationId = "00000000-0000-4000-8000-000000000022";
  const idempotencyKey = "presentation-refine:00000000-0000-4000-8000-000000000023";
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
    jsonResponse({
      items: [
        {
          content: [{ text: `[Spectra internal continuation marker: ${idempotencyKey}]` }],
          id: "event-continued",
        },
      ],
      next_page_id: null,
    }),
  );
  const client = createOpenHandsAuthoringClient(environment, fetchMock);

  await client.continueConversation({
    conversationId,
    idempotencyKey,
    message: "Continue.",
  });

  expect(fetchMock).toHaveBeenCalledOnce();
  expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/events/search?");
});

test("clears an exact runtime output directory through the bash endpoint", async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(jsonResponse({ exit_code: 0, stderr: "", stdout: "" }));
  const client = createOpenHandsAuthoringClient(environment, fetchMock);
  if (!client.executeBashCommand) throw new Error("bash_endpoint_missing");

  await expect(
    client.executeBashCommand({
      command:
        "rm -rf -- '/workspace/spectra/attempt/out' && mkdir -p -- '/workspace/spectra/attempt/out'",
      cwd: "/workspace/spectra",
    }),
  ).resolves.toEqual({ exitCode: 0, stderr: "", stdout: "" });
  expect(fetchMock.mock.calls[0]?.[0]).toBe("http://127.0.0.1:8000/api/bash/execute_bash_command");
  expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
    command:
      "rm -rf -- '/workspace/spectra/attempt/out' && mkdir -p -- '/workspace/spectra/attempt/out'",
    cwd: "/workspace/spectra",
    timeout: 30,
  });
});

test("normalizes null bash output from the runtime endpoint", async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValue(jsonResponse({ exit_code: 0, stderr: null, stdout: null }));
  const client = createOpenHandsAuthoringClient(environment, fetchMock);
  if (!client.executeBashCommand) throw new Error("bash_endpoint_missing");

  await expect(
    client.executeBashCommand({
      command: "true",
      cwd: "/workspace/spectra",
    }),
  ).resolves.toEqual({ exitCode: 0, stderr: "", stdout: "" });
});

test("rejects an unaccepted continuation request", async () => {
  const client = createOpenHandsAuthoringClient(
    environment,
    vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ success: false })),
  );
  await expect(
    client.continueConversation({
      conversationId: "00000000-0000-4000-8000-000000000016",
      message: "Continue.",
    }),
  ).rejects.toThrow();
});

test("stops through the official conversation endpoint", async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ success: true }));
  const client = createOpenHandsAuthoringClient(environment, fetchMock);
  const conversationId = "00000000-0000-4000-8000-000000000014";
  await client.stopConversation({ conversationId });
  expect(fetchMock.mock.calls.map((call) => String(call[0]))).toEqual([
    `http://127.0.0.1:8000/api/conversations/${conversationId}/interrupt`,
  ]);
});
