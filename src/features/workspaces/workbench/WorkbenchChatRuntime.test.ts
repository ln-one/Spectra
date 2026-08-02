import { describe, expect, it } from "vitest";
import {
  agentChatRequestBody,
  agentRunCancellationUrl,
  messageIntentFromMessages,
  surfaceForCreatedMessage,
  userMessageSurfaceSnapshots,
  webSearchFromMessages,
  workbenchCreateMessage,
  workspaceRetrievalFromMessages,
} from "./WorkbenchChatRuntime";

describe("workspace chat request", () => {
  it("builds a scoped cancellation endpoint from the active request identity", () => {
    expect(
      agentRunCancellationUrl({
        clientRequestId: "request:browser stop",
        conversationId: "11111111-1111-4111-8111-111111111111",
        workspaceId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toBe(
      "/api/agent/runs/by-request?clientRequestId=request%3Abrowser+stop&conversationId=11111111-1111-4111-8111-111111111111&workspaceId=22222222-2222-4222-8222-222222222222",
    );
  });

  it("sends the complete visible UIMessage branch", () => {
    const messages = [
      {
        id: "user-1",
        metadata: { spectraSurfaceContext: { type: "studio" } },
        parts: [{ text: "first", type: "text" as const }],
        role: "user" as const,
      },
      {
        id: "assistant-1",
        parts: [{ text: "answer", type: "text" as const }],
        role: "assistant" as const,
      },
      {
        id: "user-2",
        parts: [{ text: "follow up", type: "text" as const }],
        role: "user" as const,
      },
    ];

    expect(
      agentChatRequestBody({
        conversationId: "11111111-1111-4111-8111-111111111111",
        locale: "zh-CN",
        messages,
        surfaceContext: { type: "artifact_start", kind: "mind_map" },
        trigger: "submit-message",
        workspaceId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toMatchObject({
      clientRequestId: "user-2",
      messages,
      surface: { type: "artifact_start", kind: "mind_map" },
      trigger: "submit-message",
    });
  });

  it("uses the user message surface snapshot when present", () => {
    const body = agentChatRequestBody({
      conversationId: "11111111-1111-4111-8111-111111111111",
      locale: "en-US",
      messages: [
        {
          id: "user-1",
          metadata: {
            spectraSurfaceContext: { type: "artifact_start", kind: "teaching_document" },
          },
          parts: [{ text: "draft", type: "text" }],
          role: "user",
        },
      ],
      surfaceContext: { type: "studio" },
      trigger: "regenerate-message",
      workspaceId: "22222222-2222-4222-8222-222222222222",
    });
    expect(body.surface).toEqual({ type: "artifact_start", kind: "teaching_document" });
  });

  it("keeps planning active across ordinary answer turns", () => {
    const messages = [
      {
        id: "user-plan-answer",
        metadata: { spectraIntent: "plan" },
        parts: [{ text: "受众是职业院校学生", type: "text" as const }],
        role: "user" as const,
      },
    ];
    expect(messageIntentFromMessages(messages)).toBe("plan");
    expect(
      agentChatRequestBody({
        conversationId: "11111111-1111-4111-8111-111111111111",
        locale: "zh-CN",
        messages,
        surfaceContext: { type: "studio" },
        trigger: "submit-message",
        workspaceId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toMatchObject({ intent: "plan" });
  });
});

describe("workbench user messages", () => {
  it("stores explicit workspace and web retrieval preferences on the user message", () => {
    const message = workbenchCreateMessage(
      {
        attachments: [],
        content: [{ text: "核实最新资料", type: "text" }],
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        metadata: { custom: {} },
        parentId: null,
        role: "user",
        runConfig: undefined,
        sourceId: null,
      },
      { type: "studio" },
      "enhanced-user-id",
      "chat",
      { web: true, workspace: true },
    );

    expect(message.metadata).toMatchObject({
      spectraForceWebSearch: true,
      spectraForceWorkspaceRetrieval: true,
    });
    expect(workspaceRetrievalFromMessages([message])).toBe(true);
    expect(webSearchFromMessages([message])).toBe(true);
  });

  it("creates a fresh message identity for an edit and keeps typed surface metadata", () => {
    const message = workbenchCreateMessage(
      {
        attachments: [],
        content: [{ text: "edited", type: "text" }],
        createdAt: new Date("2026-07-30T00:00:00.000Z"),
        metadata: { custom: {} },
        parentId: null,
        role: "user",
        runConfig: undefined,
        sourceId: "old-user-id",
      },
      { type: "artifact_start", kind: "quiz" },
      "new-user-id",
    );

    expect(message).toEqual({
      id: "new-user-id",
      metadata: {
        spectraSurfaceContext: { type: "artifact_start", kind: "quiz" },
      },
      parts: [{ text: "edited", type: "text" }],
      role: "user",
    });
  });

  it("restores an existing message surface without a server run fallback", () => {
    const snapshots = userMessageSurfaceSnapshots([
      {
        id: "user-1",
        metadata: {
          spectraSurfaceContext: { type: "artifact_start", kind: "mind_map" },
        },
        parts: [{ text: "map", type: "text" }],
        role: "user",
      },
    ]);
    expect(surfaceForCreatedMessage("user-1", { type: "studio" }, snapshots)).toEqual({
      type: "artifact_start",
      kind: "mind_map",
    });
    expect(surfaceForCreatedMessage("missing", { type: "studio" }, snapshots)).toEqual({
      type: "studio",
    });
  });

  it("lets a planning card explicitly end planning for its next message", () => {
    const message = workbenchCreateMessage(
      {
        attachments: [],
        content: [{ text: "取消本次规划", type: "text" }],
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        metadata: { custom: { spectraIntent: "chat" } },
        parentId: null,
        role: "user",
        runConfig: undefined,
        sourceId: null,
      },
      { type: "studio" },
      "cancel-user-id",
      "plan",
    );

    expect(message.metadata).not.toHaveProperty("spectraIntent");
  });
});
