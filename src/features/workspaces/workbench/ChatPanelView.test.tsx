import { fireEvent, screen, waitFor } from "@testing-library/react";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  UI_MESSAGE_STREAM_HEADERS,
} from "ai";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { knowledgeStructuredContentHash } from "@/features/knowledge/integrity";
import { renderWithIntl } from "../../../../tests/render";
import { ChatPanelView, visibleAssistantTextPartIndexes } from "./ChatPanelView";

const conversationId = "00000000-0000-4000-8000-000000000008";
const workspaceId = "00000000-0000-4000-8000-000000000002";
const resumableStorageKey = `spectra:chat-stream:${workspaceId}:${conversationId}`;

function requestUrl(input: RequestInfo | URL) {
  return new URL(
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    "http://localhost",
  );
}

function resumeResponse(input: RequestInfo | URL, init?: RequestInit) {
  const url = requestUrl(input);
  if (
    (init?.method === undefined || init.method === "GET") &&
    url.pathname === `/api/agent/chat/${conversationId}/stream`
  )
    return new Response(null, { status: 204 });
  return null;
}

function stubChatFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Response | Promise<Response>,
) {
  const chatFetch = vi.fn(handler);
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      return resumeResponse(input, init) ?? chatFetch(input, init);
    }),
  );
  return chatFetch;
}

function assistantResponse(text: string) {
  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute({ writer }) {
        writer.write({ id: "response", type: "text-start" });
        writer.write({ delta: text, id: "response", type: "text-delta" });
        writer.write({ id: "response", type: "text-end" });
      },
    }),
  });
}

function chatPanel(messages: Parameters<typeof ChatPanelView>[0]["messages"] = []) {
  return (
    <ChatPanelView
      conversationId={conversationId}
      messages={messages}
      selectedSourceCount={0}
      subtitle="知识助手"
      title="对话"
      workspaceId={workspaceId}
    />
  );
}

function renderChat(messages: Parameters<typeof ChatPanelView>[0]["messages"] = []) {
  return renderWithIntl(chatPanel(messages));
}

async function readyComposerInput() {
  const input = screen.getByPlaceholderText("输入你的想法或任务");
  await waitFor(() => expect(input).toBeEnabled());
  return input;
}

function visualEvidence() {
  const content = {
    accessibleDescription: "凸轮轴拆卸结构图",
    asset: { kind: "source_original" as const },
    kind: "visual_region" as const,
  };
  const fidelity = "source" as const;
  const locator = {
    boxes: [{ bottom: 1, left: 0, right: 1, top: 0 }],
    kind: "page_region" as const,
    pageIndex: 10,
  };
  return {
    citationNumber: 1,
    citationToken: "ke-0123456789abcdef",
    content,
    contentHash: knowledgeStructuredContentHash({ content, fidelity, locator }),
    evidenceId: "00000000-0000-4000-8000-000000000071",
    exactExcerpt: "凸轮轴拆卸结构图",
    fidelity,
    locator,
    representationHash: "a".repeat(64),
    sourceId: "00000000-0000-4000-8000-000000000072",
    sourceName: "摩托车发动机维修手册.pdf",
    sourceRevision: 1,
  };
}

function textEvidence() {
  const content = {
    kind: "exact_text" as const,
    text: "维修前需要先拆下气缸头盖。",
  };
  const fidelity = "source" as const;
  const locator = {
    boxes: [],
    kind: "page_region" as const,
    pageIndex: 10,
  };
  return {
    citationNumber: 1,
    citationToken: "ke-fedcba9876543210",
    content,
    contentHash: knowledgeStructuredContentHash({ content, fidelity, locator }),
    evidenceId: "00000000-0000-4000-8000-000000000073",
    exactExcerpt: "拆下气缸头盖。",
    fidelity,
    locator,
    representationHash: "b".repeat(64),
    sourceId: "00000000-0000-4000-8000-000000000074",
    sourceName: "摩托车发动机维修手册.pdf",
    sourceRevision: 1,
  };
}

beforeEach(() => {
  window.sessionStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      return (
        resumeResponse(input, init) ??
        Response.json({ detail: { code: "unexpected_chat_request" } }, { status: 503 })
      );
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("keeps assistant text in its persisted part order around a tool call", () => {
  expect([
    ...visibleAssistantTextPartIndexes([
      { text: "我正在搜索。", type: "text" },
      { type: "tool-search_workspace" },
      { text: "这是完整回答。", type: "text" },
    ]),
  ]).toEqual([0, 2]);
});

test("labels a selected presentation slide with its position in the deck", () => {
  renderWithIntl(
    <ChatPanelView
      artifactContext={{ kind: "presentation", pageCount: 8, title: "指标选择" }}
      artifactSelection={{
        kind: "presentation_slides",
        revisionId: "00000000-0000-4000-8000-000000000081",
        slideIndexes: [2],
      }}
      conversationId={conversationId}
      messages={[]}
      selectedSourceCount={0}
      subtitle="知识助手"
      title="对话"
      workspaceId={workspaceId}
    />,
  );

  expect(screen.getByText("已选择第 3/8 张幻灯片")).toBeInTheDocument();
});

test("does not render a visual Evidence item that has no body anchor", async () => {
  const evidence = visualEvidence();
  renderChat([
    {
      id: "assistant:unanchored-knowledge",
      parts: [
        {
          data: {
            evidence: [evidence],
            renderableVisualEvidenceIds: [evidence.evidenceId],
            schemaVersion: 2,
          },
          type: "data-knowledgeEvidence",
        },
        { text: "这是没有图片锚点的普通回答。", type: "text" },
      ],
      role: "assistant",
    },
  ]);

  expect(await screen.findByText("这是没有图片锚点的普通回答。")).toBeInTheDocument();
  expect(screen.queryByRole("img", { name: "凸轮轴拆卸结构图" })).not.toBeInTheDocument();
});

test("renders one current Artifact plan activity state", async () => {
  renderChat([
    {
      id: "assistant:artifact-plan-running",
      parts: [
        {
          data: {
            index: 1,
            kind: "mind_map",
            planItemId: "00000000-0000-4000-8000-000000000081",
            status: "running",
            title: "凸轮轴知识图",
            workflowId: "00000000-0000-4000-8000-000000000080",
          },
          type: "data-artifactPlanProgress",
        },
      ],
      role: "assistant",
    },
  ]);

  expect(await screen.findByRole("status")).toHaveTextContent("正在创建思维导图");
  expect(screen.getAllByRole("status")).toHaveLength(1);
});

test("renders a local plan item failure without a global action failure", async () => {
  renderChat([
    {
      id: "assistant:artifact-plan-partial",
      parts: [
        {
          data: {
            errorCode: "artifact_enqueue_failed",
            index: 1,
            kind: "teaching_document",
            planItemId: "00000000-0000-4000-8000-000000000083",
            title: "第二份教学文档",
            workflowId: "00000000-0000-4000-8000-000000000082",
          },
          type: "data-artifactPlanItemFailed",
        },
      ],
      role: "assistant",
    },
  ]);

  expect(await screen.findByText("未能创建“第二份教学文档”")).toBeInTheDocument();
  expect(screen.queryByText("操作未完成，请重试")).not.toBeInTheDocument();
});

test("checks the conversation-scoped resume endpoint once on mount", async () => {
  window.sessionStorage.setItem(resumableStorageKey, "active-stream");
  renderChat();

  await waitFor(() => {
    const requests = vi
      .mocked(globalThis.fetch)
      .mock.calls.map(([input, init]) => ({ init, url: requestUrl(input) }))
      .filter(
        ({ init, url }) =>
          (init?.method === undefined || init.method === "GET") &&
          url.pathname === `/api/agent/chat/${conversationId}/stream`,
      );
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url.searchParams.get("workspaceId")).toBe(workspaceId);
  });
});

test("keeps the pending state while a resumed AI SDK stream remains open", async () => {
  window.sessionStorage.setItem(resumableStorageKey, "active-stream");
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  'data: {"messageId":"resumed-message","type":"start"}\n\n',
                ),
              );
            },
          }),
          { headers: UI_MESSAGE_STREAM_HEADERS },
        ),
      ),
    ),
  );

  renderChat([
    {
      id: "persisted-user",
      parts: [{ text: "刷新恢复测试", type: "text" }],
      role: "user",
    },
  ]);

  expect(await screen.findByTestId("assistant-run-status")).toHaveTextContent("正在准备回答…");
});

test("renders persisted typed citations and images outside Markdown paragraphs", async () => {
  const evidence = visualEvidence();
  const { container } = renderChat([
    {
      id: "assistant:knowledge",
      parts: [
        {
          data: {
            evidence: [evidence],
            renderableVisualEvidenceIds: [evidence.evidenceId],
            schemaVersion: 2,
          },
          type: "data-knowledgeEvidence",
        },
        {
          text: `先对角均匀拧松座盖螺栓。\n\n[1](#knowledge-evidence-${evidence.citationToken})`,
          type: "text",
        },
      ],
      role: "assistant",
    },
  ]);

  expect(
    await screen.findByRole("button", { name: "查看引用 1：摩托车发动机维修手册.pdf" }),
  ).toBeInTheDocument();
  expect(screen.queryByTestId("knowledge-citation-1")).not.toBeInTheDocument();
  expect(await screen.findByTestId("knowledge-visual-1")).toBeInTheDocument();
  const image = await screen.findByRole("img", { name: "凸轮轴拆卸结构图" });
  expect(image.closest("figure")).not.toBeNull();
  expect(container.querySelector("p figure")).toBeNull();
  expect(container.querySelector("figure figcaption")).toBeNull();
});

test("renders a streaming visual only after its trusted citation link is complete", async () => {
  const evidence = visualEvidence();
  let continueCitation: (() => void) | undefined;
  let finishStream: (() => void) | undefined;
  let citationCompleted: (() => void) | undefined;
  const continueCitationPromise = new Promise<void>((resolve) => {
    continueCitation = resolve;
  });
  const finishStreamPromise = new Promise<void>((resolve) => {
    finishStream = resolve;
  });
  const citationCompletedPromise = new Promise<void>((resolve) => {
    citationCompleted = resolve;
  });
  stubChatFetch(async () =>
    createUIMessageStreamResponse({
      stream: createUIMessageStream({
        async execute({ writer }) {
          writer.write({
            data: {
              evidence: [evidence],
              renderableVisualEvidenceIds: [evidence.evidenceId],
              schemaVersion: 2,
            },
            type: "data-knowledgeEvidence",
          });
          writer.write({ id: "streaming-visual", type: "text-start" });
          writer.write({ delta: "拆卸顺序如下。[1]", id: "streaming-visual", type: "text-delta" });
          await continueCitationPromise;
          writer.write({
            delta: `(#knowledge-evidence-${evidence.citationToken})`,
            id: "streaming-visual",
            type: "text-delta",
          });
          citationCompleted?.();
          await finishStreamPromise;
          writer.write({ id: "streaming-visual", type: "text-end" });
        },
      }),
    }),
  );
  renderChat();
  const input = await readyComposerInput();
  fireEvent.change(input, { target: { value: "说明拆卸顺序" } });
  fireEvent.keyDown(input, { code: "Enter", key: "Enter" });

  expect(await screen.findByText("拆卸顺序如下。")).toBeInTheDocument();
  expect(screen.queryByRole("img", { name: "凸轮轴拆卸结构图" })).not.toBeInTheDocument();

  continueCitation?.();
  await citationCompletedPromise;
  expect(await screen.findByRole("img", { name: "凸轮轴拆卸结构图" })).toBeInTheDocument();
  finishStream?.();
});

test("loads and caches neighboring source context when a text citation opens", async () => {
  const evidence = textEvidence();
  const contextText =
    "拆卸前先清理气缸头周围区域。\n\n维修前需要先拆下气缸头盖。\n\n随后按顺序松开相关螺栓。";
  const highlightStart = contextText.indexOf(evidence.exactExcerpt);
  const contextFetch = vi.fn(async () =>
    Response.json({
      evidenceId: evidence.evidenceId,
      contextText,
      exactExcerpt: evidence.exactExcerpt,
      highlight: {
        start: highlightStart,
        end: highlightStart + evidence.exactExcerpt.length,
      },
    }),
  );
  vi.stubGlobal("fetch", contextFetch);
  renderChat([
    {
      id: "assistant:text-knowledge",
      parts: [
        {
          data: { evidence: [evidence], schemaVersion: 2 },
          type: "data-knowledgeEvidence",
        },
        {
          text: `维修时需要先处理关键部件。[1](#knowledge-evidence-${evidence.citationToken})`,
          type: "text",
        },
      ],
      role: "assistant",
    },
  ]);

  const trigger = await screen.findByRole("button", {
    name: "查看引用 1：摩托车发动机维修手册.pdf",
  });
  expect(contextFetch).not.toHaveBeenCalled();
  fireEvent.click(trigger);

  expect(await screen.findByText("来源上下文")).toBeInTheDocument();
  expect(await screen.findByText(evidence.exactExcerpt)).toBeInTheDocument();
  expect(screen.getByText(evidence.exactExcerpt).tagName).toBe("MARK");
  expect(contextFetch).toHaveBeenCalledWith(
    `/api/workspaces/${workspaceId}/knowledge/evidence/${evidence.evidenceId}/context`,
  );

  fireEvent.click(screen.getByRole("button", { name: "关闭来源摘录" }));
  fireEvent.click(trigger);
  expect(await screen.findByText("来源上下文")).toBeInTheDocument();
  expect(contextFetch).toHaveBeenCalledTimes(1);
});

test("keeps the persisted excerpt when context is unavailable", async () => {
  const evidence = textEvidence();
  const contextFetch = vi.fn(async () => new Response(null, { status: 404 }));
  vi.stubGlobal("fetch", contextFetch);
  renderChat([
    {
      id: "assistant:stale-knowledge",
      parts: [
        {
          data: { evidence: [evidence], schemaVersion: 2 },
          type: "data-knowledgeEvidence",
        },
        {
          text: `维修提示。[1](#knowledge-evidence-${evidence.citationToken})`,
          type: "text",
        },
      ],
      role: "assistant",
    },
  ]);

  fireEvent.click(
    await screen.findByRole("button", {
      name: "查看引用 1：摩托车发动机维修手册.pdf",
    }),
  );

  await waitFor(() => expect(contextFetch).toHaveBeenCalledTimes(1));
  expect(screen.getByText("来源摘录")).toBeInTheDocument();
  expect(screen.getByText(evidence.exactExcerpt)).toBeInTheDocument();
});

test("restores a typed Artifact card from message history", async () => {
  renderChat([
    {
      id: "assistant:artifact",
      parts: [
        {
          data: {
            artifact: null,
            createdAt: "2026-07-30T00:00:00.000Z",
            draft: null,
            failureCode: null,
            generationAttemptId: null,
            generationSequence: 0,
            generationState: "queued",
            id: "00000000-0000-4000-8000-000000000099",
            kind: "mind_map",
            title: "凸轮轴知识图",
            updatedAt: "2026-07-30T00:00:00.000Z",
            workspaceId,
          },
          type: "data-artifactStarted",
        },
      ],
      role: "assistant",
    },
  ]);

  expect(await screen.findByText("凸轮轴知识图")).toBeInTheDocument();
});

test("sends the complete visible branch through the official transport", async () => {
  const chatFetch = stubChatFetch(async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      conversationId: string;
      messages: Array<{ role: string }>;
      trigger: string;
      workspaceId: string;
    };
    expect(body).toMatchObject({
      conversationId,
      trigger: "submit-message",
      workspaceId,
    });
    expect(body.messages.map((message) => message.role)).toEqual(["assistant", "user"]);
    return assistantResponse("新的回答");
  });
  renderChat([
    {
      id: "assistant:existing",
      parts: [{ text: "已有回答", type: "text" }],
      role: "assistant",
    },
  ]);

  const input = await readyComposerInput();
  fireEvent.change(input, { target: { value: "继续介绍" } });
  fireEvent.keyDown(input, { code: "Enter", key: "Enter" });

  await waitFor(() => expect(chatFetch).toHaveBeenCalledOnce());
  expect(await screen.findByText("新的回答")).toBeInTheDocument();
});

test("keeps the pending indicator visible while the transport is running and stops cleanly", async () => {
  let signal: AbortSignal | undefined;
  const chatFetch = stubChatFetch((input, init) => {
    if (requestUrl(input).pathname === "/api/agent/chat") signal = init?.signal ?? undefined;
    return new Promise<Response>((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
  });
  renderChat();

  const input = await readyComposerInput();
  fireEvent.change(input, { target: { value: "停止这个请求" } });
  fireEvent.keyDown(input, { code: "Enter", key: "Enter" });

  expect(await screen.findByTestId("assistant-run-status")).toHaveTextContent("正在准备回答…");
  fireEvent.click(await screen.findByRole("button", { name: "停止生成" }));
  await waitFor(() => expect(signal?.aborted).toBe(true));
  expect(chatFetch).toHaveBeenCalledWith(
    expect.stringContaining("/api/agent/runs/by-request?"),
    expect.objectContaining({ method: "DELETE" }),
  );
  expect(screen.queryByTestId("assistant-run-status")).not.toBeInTheDocument();
});

test("editing a failed user turn resends it with a fresh identity", async () => {
  let requestBody:
    | {
        messageId?: string;
        messages: Array<{ id: string; parts: unknown[] }>;
        trigger: string;
      }
    | undefined;
  const chatFetch = stubChatFetch(async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as {
      messageId?: string;
      messages: Array<{ id: string; parts: unknown[] }>;
      trigger: string;
    };
    return assistantResponse("重试后的回答");
  });
  renderChat([
    {
      id: "failed-user",
      parts: [{ text: "原问题", type: "text" }],
      role: "user",
    },
  ]);

  fireEvent.click(await screen.findByRole("button", { name: "编辑消息" }));
  expect(await screen.findByRole("textbox", { name: "编辑消息" })).toHaveValue("原问题");
  fireEvent.click(screen.getByRole("button", { name: "保存并重新生成" }));

  await waitFor(() => expect(chatFetch).toHaveBeenCalledOnce());
  expect(await screen.findByText("重试后的回答")).toBeInTheDocument();
  expect(requestBody?.trigger).toBe("submit-message");
  const resentMessage = requestBody?.messages.at(-1);
  expect(resentMessage?.id).not.toBe("failed-user");
  expect(resentMessage).toMatchObject({
    parts: [{ text: "原问题", type: "text" }],
  });
});

test("regenerates the latest answer using the official trigger", async () => {
  const chatFetch = stubChatFetch(async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      messages: Array<{ id: string }>;
      trigger: string;
    };
    expect(body.trigger).toBe("regenerate-message");
    expect(body.messages.map((message) => message.id)).toEqual(["persisted-user"]);
    return assistantResponse("重新生成的回答");
  });
  renderChat([
    {
      id: "persisted-user",
      parts: [{ text: "保留的问题", type: "text" }],
      role: "user",
    },
    {
      id: "old-answer",
      parts: [{ text: "需要替换的回答", type: "text" }],
      role: "assistant",
    },
  ]);

  fireEvent.click(await screen.findByRole("button", { name: "重新生成回答" }));
  expect(await screen.findByText("重新生成的回答")).toBeInTheDocument();
  expect(screen.queryByText("需要替换的回答")).not.toBeInTheDocument();
  expect(chatFetch).toHaveBeenCalledOnce();
});

test("renders an explicit transport error and retries through assistant-ui", async () => {
  const chatFetch = stubChatFetch(async () => {
    if (chatFetch.mock.calls.length === 1) {
      return Response.json({ detail: { code: "agent_unavailable" } }, { status: 503 });
    }
    return assistantResponse("重试成功");
  });
  renderChat();

  const input = await readyComposerInput();
  fireEvent.change(input, { target: { value: "触发错误" } });
  fireEvent.keyDown(input, { code: "Enter", key: "Enter" });

  const retry = await screen.findByRole("button", { name: "重试回答" });
  fireEvent.click(retry);
  expect(await screen.findByText("重试成功")).toBeInTheDocument();
  expect(chatFetch).toHaveBeenCalledTimes(2);
});
