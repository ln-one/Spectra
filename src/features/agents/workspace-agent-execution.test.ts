import { toAISdkStream } from "@mastra/ai-sdk";
import { MessageList } from "@mastra/core/agent";
import { RequestContext } from "@mastra/core/request-context";
import type { UIMessageChunk } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { appendAssistantToMessageSnapshot } from "@/features/agents/message-records";
import {
  completeAiRunAudit,
  finishAiRun,
  settleAiRunAttempt,
  startAiRunAttempt,
} from "@/features/agents/runs";
import { generateThreadTitle } from "@/features/agents/threads";
import type { WorkspaceAgentToolContext } from "@/features/agents/workspace-agent-tool-context";
import type { Workspace } from "@/features/workspaces/types";
import { abortAiRun } from "./run-cancellation";
import { executeWorkspaceAgent } from "./workspace-agent-execution";

const logger = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));
const knowledge = vi.hoisted(() => ({
  evidenceData: vi.fn(),
  message: vi.fn(),
  synchronizeBudget: vi.fn(),
}));
const tracing = vi.hoisted(() => {
  const span = {
    end: vi.fn(),
    setAttribute: vi.fn(),
    setStatus: vi.fn(),
  };
  return {
    span,
    startSpan: vi.fn(() => span),
  };
});

vi.mock("@mastra/ai-sdk", () => ({ toAISdkStream: vi.fn() }));
vi.mock("@/features/agents/knowledge-tool.server", () => ({
  knowledgeIterationControl: vi.fn(),
  synchronizeWorkspaceToolCallBudget: knowledge.synchronizeBudget,
  WORKSPACE_VISUAL_CONTEXT_PREFIX: "<workspace_visual_context",
  workspaceKnowledgeEvidenceDataForRequestContext: knowledge.evidenceData,
  workspaceKnowledgeVisualModelMessageForRequestContext: knowledge.message,
}));
vi.mock("@/features/agents/message-records", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/agents/message-records")>()),
  appendAssistantToMessageSnapshot: vi.fn(),
}));
vi.mock("@/features/agents/runs", () => ({
  completeAiRunAudit: vi.fn(),
  finishAiRun: vi.fn(),
  settleAiRunAttempt: vi.fn(),
  startAiRunAttempt: vi.fn(),
}));
vi.mock("@/features/agents/threads", () => ({
  generateThreadTitle: vi.fn(),
}));
vi.mock("@/observability/server", () => ({ webLogger: logger }));
vi.mock("@/observability/tracing.server", () => ({
  applicationTracer: { startSpan: tracing.startSpan },
}));

const run = { id: "10000000-0000-4000-8000-000000000001" };
const conversationId = "40000000-0000-4000-8000-000000000001";
const workspace: Workspace = {
  archivedAt: null,
  createdAt: "2026-07-28T00:00:00.000Z",
  id: "20000000-0000-4000-8000-000000000001",
  name: "Execution",
  ownerHandle: "alice",
  ownerId: "30000000-0000-4000-8000-000000000001",
  permissions: ["workspace.chat"],
  slug: null,
  updatedAt: "2026-07-28T00:00:00.000Z",
  visibility: "private" as const,
};

function modelOutput() {
  return {
    finishReason: Promise.resolve("stop"),
    response: Promise.resolve({ modelId: "qwen3.6-plus-2026-04-16" }),
    toolCalls: Promise.resolve([]),
    usage: Promise.resolve({ inputTokens: 10, outputTokens: 4, totalTokens: 14 }),
  };
}

function requestContext() {
  const context = new RequestContext<WorkspaceAgentToolContext>();
  context.set("sourceUserMessageId", "user:execution");
  return context;
}

function executionInput(agent: { stream: ReturnType<typeof vi.fn> }, shouldGenerateTitle = false) {
  return {
    agent: agent as never,
    conversationId,
    createdByPrincipalId: workspace.ownerId,
    effectiveText: "Explain the answer",
    messages: [
      {
        id: "user:execution",
        parts: [{ text: "Explain the answer", type: "text" as const }],
        role: "user" as const,
      },
    ],
    requestContext: requestContext(),
    run,
    shouldGenerateTitle,
    workspace,
  };
}

async function drain(stream: ReadableStream<UIMessageChunk>) {
  const chunks: UIMessageChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

beforeEach(() => {
  vi.mocked(startAiRunAttempt)
    .mockReset()
    .mockResolvedValue({ id: "attempt:workspace" } as never);
  vi.mocked(settleAiRunAttempt)
    .mockReset()
    .mockResolvedValue({} as never);
  vi.mocked(finishAiRun)
    .mockReset()
    .mockResolvedValue({} as never);
  vi.mocked(completeAiRunAudit)
    .mockReset()
    .mockResolvedValue({} as never);
  vi.mocked(appendAssistantToMessageSnapshot).mockReset().mockResolvedValue(true);
  vi.mocked(generateThreadTitle).mockReset().mockResolvedValue(null);
  vi.mocked(toAISdkStream).mockReset();
  knowledge.evidenceData.mockReset().mockReturnValue(null);
  knowledge.message.mockReset().mockReturnValue(null);
  knowledge.synchronizeBudget.mockReset();
  logger.error.mockReset();
  logger.info.mockReset();
  logger.warn.mockReset();
  tracing.span.end.mockReset();
  tracing.span.setAttribute.mockReset();
  tracing.span.setStatus.mockReset();
  tracing.startSpan.mockClear();
});

describe("workspace Agent execution", () => {
  it("fails before the provider call when the Run budget is exhausted", async () => {
    vi.mocked(startAiRunAttempt).mockResolvedValue(null);
    const agent = { stream: vi.fn() };

    await expect(executeWorkspaceAgent(executionInput(agent))).resolves.toEqual({
      code: "agent_budget_exhausted",
      runId: run.id,
      status: 429,
      type: "error",
    });
    expect(agent.stream).not.toHaveBeenCalled();
    expect(finishAiRun).toHaveBeenCalledWith({
      failureCode: "agent_budget_exhausted",
      runId: run.id,
      state: "failed",
    });
  });

  it("bridges the Mastra stream directly as AI SDK v6 and persists the completed message", async () => {
    const agent = { stream: vi.fn().mockResolvedValue(modelOutput()) };
    vi.mocked(toAISdkStream).mockReturnValue(
      new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({ id: "answer", type: "text-start" });
          controller.enqueue({ delta: "Direct answer", id: "answer", type: "text-delta" });
          controller.enqueue({ id: "answer", type: "text-end" });
          controller.close();
        },
      }) as never,
    );

    const result = await executeWorkspaceAgent(executionInput(agent));
    if (result.type !== "stream") throw new Error("Expected a stream");
    const chunks = await drain(result.stream);

    expect(chunks.some((chunk) => chunk.type === "text-delta")).toBe(true);
    expect(toAISdkStream).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ from: "agent", version: "v6" }),
    );
    expect(appendAssistantToMessageSnapshot).toHaveBeenCalledWith({
      conversationId,
      message: expect.objectContaining({
        id: `assistant:${run.id}`,
        role: "assistant",
      }),
      sourceUserMessageId: "user:execution",
      workspaceId: workspace.id,
    });
    expect(completeAiRunAudit).toHaveBeenCalledWith({ runId: run.id });
  });

  it("keeps transient visual context in the model prompt and out of the persisted snapshot", async () => {
    knowledge.message.mockReturnValue({
      role: "user",
      content: [
        { type: "text", text: "<workspace_visual_context>trusted candidate" },
        { type: "image", image: new Uint8Array([1, 2, 3]), mediaType: "image/webp" },
      ],
    });
    const agent = {
      stream: vi.fn().mockImplementation(async (_messages: unknown, options: unknown) => {
        const prepareStep = Reflect.get(options as object, "prepareStep");
        if (typeof prepareStep !== "function") throw new Error("Expected prepareStep");
        const messageList = new MessageList();
        messageList.add({ role: "user", content: "Explain the answer" }, "input");
        const prepared = prepareStep({
          messageList,
          messages: messageList.get.all.db(),
          requestContext: requestContext(),
          steps: [{ toolCalls: [{ toolCallId: "search-1" }] }],
        });
        const prompt = await Reflect.get(prepared, "messageList").get.all.aiV5.llmPrompt();
        expect(JSON.stringify(prompt)).toContain("AQID");
        return modelOutput();
      }),
    };
    vi.mocked(toAISdkStream).mockReturnValue(
      new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({ id: "answer", type: "text-start" });
          controller.enqueue({ delta: "Direct answer", id: "answer", type: "text-delta" });
          controller.enqueue({ id: "answer", type: "text-end" });
          controller.close();
        },
      }) as never,
    );

    const result = await executeWorkspaceAgent(executionInput(agent));
    if (result.type !== "stream") throw new Error("Expected a stream");
    await drain(result.stream);

    const persistedCall = vi.mocked(appendAssistantToMessageSnapshot).mock.calls[0]?.[0];
    expect(JSON.stringify(persistedCall)).not.toContain("AQID");
    expect(JSON.stringify(persistedCall)).not.toContain("workspace_visual_context");
  });

  it("emits typed Knowledge evidence as a data part", async () => {
    const agent = { stream: vi.fn().mockResolvedValue(modelOutput()) };
    vi.mocked(toAISdkStream).mockReturnValue(
      new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({ id: "answer", type: "text-start" });
          controller.enqueue({ delta: "Grounded", id: "answer", type: "text-delta" });
          controller.enqueue({ id: "answer", type: "text-end" });
          controller.close();
        },
      }) as never,
    );
    knowledge.evidenceData.mockReturnValue({ evidence: [], schemaVersion: 2 });

    const result = await executeWorkspaceAgent(executionInput(agent));
    if (result.type !== "stream") throw new Error("Expected a stream");
    const chunks = await drain(result.stream);

    expect(chunks).toContainEqual(expect.objectContaining({ type: "data-knowledgeEvidence" }));
  });

  it("keeps the main answer when title generation fails", async () => {
    const agent = { stream: vi.fn().mockResolvedValue(modelOutput()) };
    vi.mocked(startAiRunAttempt)
      .mockResolvedValueOnce({ id: "attempt:workspace" } as never)
      .mockResolvedValueOnce({ id: "attempt:title" } as never);
    vi.mocked(generateThreadTitle).mockRejectedValue(new Error("title failed"));
    vi.mocked(toAISdkStream).mockReturnValue(
      new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({ id: "answer", type: "text-start" });
          controller.enqueue({ delta: "Main answer", id: "answer", type: "text-delta" });
          controller.enqueue({ id: "answer", type: "text-end" });
          controller.close();
        },
      }) as never,
    );

    const result = await executeWorkspaceAgent(executionInput(agent, true));
    if (result.type !== "stream") throw new Error("Expected a stream");
    expect((await drain(result.stream)).some((chunk) => chunk.type === "text-delta")).toBe(true);
    expect(completeAiRunAudit).toHaveBeenCalledWith({ runId: run.id });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: "agent.title.failed" }),
      expect.any(String),
    );
  });

  it("persists streamed Artifact cards when the final Agent summary fails", async () => {
    const output = {
      ...modelOutput(),
      response: Promise.reject(new Error("summary failed")),
    };
    const agent = { stream: vi.fn().mockResolvedValue(output) };
    vi.mocked(toAISdkStream).mockReturnValue(
      new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({
            data: {
              artifactId: "50000000-0000-4000-8000-000000000001",
              kind: "quiz",
              status: "queued",
              title: "Review quiz",
            },
            id: "artifact-card",
            type: "data-artifactStarted",
          } as UIMessageChunk);
          controller.close();
        },
      }) as never,
    );

    const result = await executeWorkspaceAgent(executionInput(agent));
    if (result.type !== "stream") throw new Error("Expected a stream");
    await drain(result.stream);

    expect(appendAssistantToMessageSnapshot).toHaveBeenCalledWith({
      conversationId,
      message: expect.objectContaining({
        parts: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({ title: "Review quiz" }),
            type: "data-artifactStarted",
          }),
        ]),
      }),
      sourceUserMessageId: "user:execution",
      workspaceId: workspace.id,
    });
    expect(finishAiRun).toHaveBeenCalledWith({
      abortReason: null,
      failureCode: "agent_unavailable",
      runId: run.id,
      state: "failed",
    });
    expect(completeAiRunAudit).not.toHaveBeenCalled();
  });

  it("closes the trace when the provider fails before streaming", async () => {
    const agent = { stream: vi.fn().mockRejectedValue(new Error("provider unavailable")) };
    await expect(executeWorkspaceAgent(executionInput(agent))).rejects.toThrow(
      "provider unavailable",
    );
    expect(tracing.span.end).toHaveBeenCalledOnce();
  });

  it("passes a cancellable signal to the provider and settles a cancelled run", async () => {
    let resolveSignal: ((signal: AbortSignal) => void) | undefined;
    const signalReady = new Promise<AbortSignal>((resolve) => {
      resolveSignal = resolve;
    });
    const agent = {
      stream: vi.fn().mockImplementation(async (_messages: unknown, options: unknown) => {
        const signal = Reflect.get(options as object, "abortSignal");
        if (!(signal instanceof AbortSignal)) throw new Error("Missing provider abort signal");
        resolveSignal?.(signal);
        await new Promise<never>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      }),
    };

    const pending = executeWorkspaceAgent(executionInput(agent));
    const signal = await signalReady;
    expect(signal.aborted).toBe(false);
    expect(abortAiRun(run.id)).toBe(true);

    await expect(pending).rejects.toThrow("AI run cancelled");
    expect(settleAiRunAttempt).toHaveBeenCalledWith({
      attemptId: "attempt:workspace",
      errorCode: "user_abort_requested",
      state: "cancelled",
    });
    expect(finishAiRun).toHaveBeenCalledWith({
      abortReason: "user_abort_requested",
      failureCode: null,
      runId: run.id,
      state: "cancelled",
    });
    expect(abortAiRun(run.id)).toBe(false);
  });
});
