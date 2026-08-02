import { UI_MESSAGE_STREAM_HEADERS } from "ai";
import { after } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAiConversationActiveStream,
  findAiConversation,
} from "@/features/agents/conversation-records";
import { agentResumableStreamContext } from "@/features/agents/resumable-stream";
import { getCurrentActor } from "@/features/identity/current";
import { getWorkspaceById } from "@/features/workspaces/service";
import { GET } from "./route";

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("@/features/agents/resumable-stream", () => ({
  agentResumableStreamContext: vi.fn(),
}));
vi.mock("@/features/agents/conversation-records", () => ({
  clearAiConversationActiveStream: vi.fn(),
  findAiConversation: vi.fn(),
}));
vi.mock("@/features/identity/current", () => ({ getCurrentActor: vi.fn() }));
vi.mock("@/features/workspaces/service", () => ({ getWorkspaceById: vi.fn() }));

const actor = { handle: "alice", principalId: "36fa8dc6-5db4-41e3-a709-2cd37a9c852f" };
const workspaceId = "56a7adf8-9254-4b0f-bd50-2a462470af02";
const conversationId = "9924e340-a561-40d8-94de-86cfcda40ecb";
const runId = "10000000-0000-4000-8000-000000000001";
const resume = vi.fn();

function request() {
  const query = new URLSearchParams({ workspaceId });
  return new Request(`http://localhost/api/agent/chat/${conversationId}/stream?${query}`);
}

beforeEach(() => {
  vi.mocked(after).mockReset();
  vi.mocked(getCurrentActor).mockReset().mockResolvedValue(actor);
  vi.mocked(getWorkspaceById)
    .mockReset()
    .mockResolvedValue({ id: workspaceId } as never);
  vi.mocked(findAiConversation)
    .mockReset()
    .mockResolvedValue({
      activeStreamId: runId,
      conversationId,
    } as never);
  vi.mocked(clearAiConversationActiveStream).mockReset().mockResolvedValue(null);
  resume.mockReset();
  vi.mocked(agentResumableStreamContext)
    .mockReset()
    .mockResolvedValue({ resume } as never);
});

describe("GET /api/agent/chat/:conversationId/stream", () => {
  it("resumes an authorized UI message stream", async () => {
    resume.mockResolvedValue(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"type":"finish"}\n\n'));
          controller.close();
        },
      }),
    );

    const response = await GET(request(), { params: Promise.resolve({ conversationId }) });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(UI_MESSAGE_STREAM_HEADERS["content-type"]);
    expect(response.headers.get("x-resumable-stream-id")).toBe(runId);
    expect(await response.text()).toContain('"type":"finish"');
    expect(findAiConversation).toHaveBeenCalledWith({
      conversationId,
      createdByPrincipalId: actor.principalId,
      workspaceId,
    });
    expect(resume).toHaveBeenCalledWith(runId);
  });

  it("returns no content before a URL-owned conversation is persisted", async () => {
    vi.mocked(findAiConversation).mockResolvedValue(null);

    const response = await GET(request(), { params: Promise.resolve({ conversationId }) });

    expect(response.status).toBe(204);
    expect(resume).not.toHaveBeenCalled();
  });

  it("returns no content when the conversation has no active stream", async () => {
    vi.mocked(findAiConversation).mockResolvedValue({
      activeStreamId: null,
      conversationId,
    } as never);

    const response = await GET(request(), { params: Promise.resolve({ conversationId }) });

    expect(response.status).toBe(204);
    expect(resume).not.toHaveBeenCalled();
  });

  it("clears a stale active stream pointer after the retained stream expires", async () => {
    resume.mockResolvedValue(null);

    const response = await GET(request(), { params: Promise.resolve({ conversationId }) });

    expect(response.status).toBe(204);
    expect(clearAiConversationActiveStream).toHaveBeenCalledWith({
      conversationId,
      createdByPrincipalId: actor.principalId,
      streamId: runId,
      workspaceId,
    });
  });
});
