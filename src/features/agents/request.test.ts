import { describe, expect, it } from "vitest";
import {
  AGENT_CHAT_MESSAGE_MAX_BYTES,
  AgentRequestTooLargeError,
  parseAgentChatRequest,
} from "./request";

const conversationId = "9924e340-a561-40d8-94de-86cfcda40ecb";
const workspaceId = "56a7adf8-9254-4b0f-bd50-2a462470af02";

function body(extra: Record<string, unknown> = {}) {
  return {
    clientRequestId: "request-1",
    conversationId,
    locale: "zh-CN",
    messageId: "user-1",
    messages: [{ id: "user-1", parts: [{ text: "Hello", type: "text" }], role: "user" }],
    surface: { type: "studio" },
    trigger: "submit-message",
    workspaceId,
    ...extra,
  };
}

describe("parseAgentChatRequest", () => {
  it("accepts the complete validated UIMessage branch", async () => {
    const messages = [
      { id: "user-0", parts: [{ text: "Earlier", type: "text" }], role: "user" },
      { id: "assistant-0", parts: [{ text: "Answer", type: "text" }], role: "assistant" },
      {
        id: "user-1",
        metadata: { spectraSurfaceContext: { type: "studio" } },
        parts: [{ text: "Hello", type: "text" }],
        role: "user",
      },
    ];
    await expect(parseAgentChatRequest(body({ messages }))).resolves.toMatchObject({
      conversationId,
      clientRequestId: "request-1",
      latestUserMessage: { id: "user-1" },
      messages,
      operation: "send",
      text: "Hello",
      workspaceId,
    });
  });

  it("reads workspace and web retrieval preferences from the latest user message", async () => {
    await expect(
      parseAgentChatRequest(
        body({
          messages: [
            {
              id: "user-1",
              metadata: {
                spectraForceWebSearch: true,
                spectraForceWorkspaceRetrieval: true,
              },
              parts: [{ text: "核实资料", type: "text" }],
              role: "user",
            },
          ],
        }),
      ),
    ).resolves.toMatchObject({ forceWebSearch: true, forceWorkspaceRetrieval: true });
  });

  it("maps the official regenerate trigger and keeps the page surface", async () => {
    await expect(
      parseAgentChatRequest(
        body({
          surface: { kind: "teaching_document", type: "artifact_start" },
          trigger: "regenerate-message",
        }),
      ),
    ).resolves.toMatchObject({
      operation: "regenerate",
      surface: { kind: "teaching_document", type: "artifact_start" },
    });
  });

  it("normalizes UUID scope", async () => {
    await expect(
      parseAgentChatRequest(
        body({
          conversationId: conversationId.toUpperCase(),
          workspaceId: workspaceId.toUpperCase(),
        }),
      ),
    ).resolves.toMatchObject({ conversationId, workspaceId });
  });

  it("rejects a message whose serialized payload exceeds the byte budget", async () => {
    await expect(
      parseAgentChatRequest(
        body({
          messages: [
            {
              id: "user-1",
              metadata: { padding: "x".repeat(AGENT_CHAT_MESSAGE_MAX_BYTES) },
              parts: [{ text: "Hello", type: "text" }],
              role: "user",
            },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(AgentRequestTooLargeError);
  });

  it.each([
    body({ locale: undefined }),
    body({ clientRequestId: "request with spaces" }),
    body({ trigger: "edit-message" }),
    body({ surface: { type: "unknown" } }),
    body({ ownerId: "forged" }),
    body({ messages: [] }),
    body({ messages: [{ id: "system", parts: [{ text: "x", type: "text" }], role: "system" }] }),
    body({ messages: [{ id: "user", parts: [{ text: "  ", type: "text" }], role: "user" }] }),
    body({
      messages: [{ id: "user", parts: [{ text: "x".repeat(16_001), type: "text" }], role: "user" }],
    }),
  ])("rejects invalid request boundaries", async (input) => {
    await expect(parseAgentChatRequest(input)).resolves.toBeNull();
  });
});
