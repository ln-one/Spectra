import { MessageList } from "@mastra/core/agent/message-list";
import type { ProcessInputStepArgs } from "@mastra/core/processors";
import type { ModelMessage } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { workspaceAgentProfile } from "./config";
import {
  modelConversationMessages,
  prepareWorkspaceAgentStep,
} from "./workspace-agent-turn-policy";

const knowledge = vi.hoisted(() => ({
  message: vi.fn<() => ModelMessage | null>(),
  synchronize: vi.fn(),
}));

vi.mock("./knowledge-tool.server", () => ({
  synchronizeWorkspaceToolCallBudget: knowledge.synchronize,
  WORKSPACE_VISUAL_CONTEXT_PREFIX: "<workspace_visual_context",
  workspaceKnowledgeVisualModelMessageForRequestContext: knowledge.message,
}));

function dbMessage(id: string, text: string) {
  return {
    content: { format: 2 as const, parts: [{ text, type: "text" as const }] },
    createdAt: new Date(0),
    id,
    role: "user" as const,
  };
}

function visualMessage(): ModelMessage {
  return {
    role: "user",
    content: [
      { type: "text", text: '<workspace_visual_context run="run-1">' },
      { type: "image", image: new Uint8Array([1, 2, 3]), mediaType: "image/webp" },
      { type: "text", text: "</workspace_visual_context>" },
    ],
  };
}

describe("modelConversationMessages", () => {
  it("preserves a submitted planning proposal for the execution turn", () => {
    const messages = [
      {
        id: "user-1",
        parts: [{ text: "请先规划教学文档", type: "text" }],
        role: "user",
      },
      {
        id: "assistant-1",
        parts: [
          {
            input: {
              sections: [{ body: "创建正文和练习题。", title: "教学文档" }],
              summary: "为初学者制作维修教学资料。",
              title: "摩托车发动机维修计划",
            },
            state: "output-available",
            toolCallId: "tool-1",
            type: "tool-submit_workspace_plan",
          },
        ],
        role: "assistant",
      },
    ] as Parameters<typeof modelConversationMessages>[0];

    expect(modelConversationMessages(messages)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          parts: [
            expect.objectContaining({
              text: expect.stringContaining("摩托车发动机维修计划"),
            }),
          ],
          role: "assistant",
        }),
      ]),
    );
  });
});

function stepArgs(
  input: {
    messageList?: ProcessInputStepArgs["messageList"];
    messages?: ProcessInputStepArgs["messages"];
    toolCallCount?: number;
  } = {},
) {
  const messageList =
    input.messageList ??
    ({
      add: vi.fn().mockReturnThis(),
      removeByIds: vi.fn().mockReturnValue([]),
    } as unknown as ProcessInputStepArgs["messageList"]);
  return {
    messageList,
    messages: input.messages ?? [dbMessage("user-1", "Explain the diagram")],
    requestContext: {},
    steps: Array.from({ length: input.toolCallCount ?? 0 }, () => ({
      toolCalls: [{ toolName: "search_workspace" }],
    })),
  } as unknown as Pick<
    ProcessInputStepArgs,
    "messageList" | "messages" | "requestContext" | "steps"
  >;
}

beforeEach(() => {
  knowledge.message.mockReset().mockReturnValue(null);
  knowledge.synchronize.mockReset();
});

describe("prepareWorkspaceAgentStep visual context", () => {
  it("leaves model messages unchanged before a visual is prepared", () => {
    expect(prepareWorkspaceAgentStep(stepArgs())).toBeUndefined();
    expect(knowledge.synchronize).toHaveBeenCalledWith({}, 0);
  });

  it("adds one transient multimodal user message", () => {
    const prepared = visualMessage();
    knowledge.message.mockReturnValue(prepared);

    const result = prepareWorkspaceAgentStep(stepArgs({ toolCallCount: 1 }));

    expect(result).toMatchObject({ messageList: expect.anything() });
    const activeMessageList = result && "messageList" in result ? result.messageList : undefined;
    expect(activeMessageList?.add).toHaveBeenCalledWith(prepared, "context");
  });

  it("replaces an earlier visual context instead of duplicating it", () => {
    const prepared = visualMessage();
    knowledge.message.mockReturnValue(prepared);
    const result = prepareWorkspaceAgentStep(
      stepArgs({
        messages: [
          dbMessage("user-1", "Explain the diagram"),
          dbMessage("visual-old", '<workspace_visual_context run="run-1">\nold'),
        ],
        toolCallCount: 2,
      }),
    );

    const activeMessageList = result && "messageList" in result ? result.messageList : undefined;
    expect(activeMessageList?.removeByIds).toHaveBeenCalledWith(["visual-old"]);
    expect(activeMessageList?.add).toHaveBeenCalledOnce();
  });

  it("keeps the visual input while disabling tools at the total budget", () => {
    const prepared = visualMessage();
    knowledge.message.mockReturnValue(prepared);

    expect(
      prepareWorkspaceAgentStep(
        stepArgs({ toolCallCount: workspaceAgentProfile.budget.maxToolCalls }),
      ),
    ).toMatchObject({ activeTools: [], messageList: expect.anything(), toolChoice: "none" });
  });

  it("keeps the visual message in non-persisted context while preserving image bytes for the model", async () => {
    const prepared = visualMessage();
    knowledge.message.mockReturnValue(prepared);
    const messageList = new MessageList();
    messageList.add(dbMessage("user-1", "Explain the diagram"), "input");

    const result = prepareWorkspaceAgentStep(
      stepArgs({ messageList, messages: messageList.get.all.db(), toolCallCount: 1 }),
    );
    const activeMessageList = result && "messageList" in result ? result.messageList : undefined;
    const prompt = await activeMessageList?.get.all.aiV5.llmPrompt();
    const visualPrompt = prompt?.at(-1);

    expect(activeMessageList?.getPersisted.input.db()).toHaveLength(1);
    expect(activeMessageList?.get.all.db()).toHaveLength(2);
    expect(visualPrompt?.role).toBe("user");
    expect(Array.isArray(visualPrompt?.content) ? visualPrompt.content : []).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "text" }),
        expect.objectContaining({ data: "AQID", mediaType: "image/webp", type: "file" }),
      ]),
    );
  });
});
