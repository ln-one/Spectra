import { createUIMessageStream } from "ai";
import { RESUMABLE_STREAM_ID_HEADER } from "assistant-stream/resumable";
import { after } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AGENT_CHAT_REQUEST_MAX_BYTES } from "@/features/agents/request";
import { agentResumableStreamContext } from "@/features/agents/resumable-stream";
import { runWorkspaceTurn } from "@/features/agents/workspace-turn-service";
import { getCurrentActor } from "@/features/identity/current";
import { POST } from "./route";

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("@/features/identity/current", () => ({ getCurrentActor: vi.fn() }));
vi.mock("@/features/agents/resumable-stream", () => ({
  agentResumableStreamContext: vi.fn(),
}));
vi.mock("@/features/agents/workspace-turn-service", () => ({
  runWorkspaceTurn: vi.fn(),
}));

const actor = { handle: "alice", principalId: "36fa8dc6-5db4-41e3-a709-2cd37a9c8520" };
const conversationId = "9924e340-a561-40d8-94de-86cfcda40ecb";
const workspaceId = "56a7adf8-9254-4b0f-bd50-2a462470af02";
const runId = "10000000-0000-4000-8000-000000000001";
const resumableRun = vi.fn();
const resumableResume = vi.fn();

function request(body: unknown, raw = false) {
  return new Request("http://localhost/api/agent/chat", {
    body: raw ? String(body) : JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

function validBody(extra: Record<string, unknown> = {}) {
  return {
    clientRequestId: "request-browser-1",
    conversationId,
    locale: "zh-CN",
    messageId: "browser-user-1",
    messages: [
      {
        id: "browser-user-1",
        parts: [{ text: "Inspect", type: "text" }],
        role: "user",
      },
    ],
    surface: { type: "studio" },
    trigger: "submit-message",
    workspaceId,
    ...extra,
  };
}

beforeEach(() => {
  vi.mocked(after).mockReset();
  vi.mocked(getCurrentActor).mockReset().mockResolvedValue(actor);
  vi.mocked(agentResumableStreamContext)
    .mockReset()
    .mockResolvedValue({ resume: resumableResume, run: resumableRun } as never);
  resumableRun
    .mockReset()
    .mockImplementation(async (_id: string, create: () => ReadableStream<Uint8Array>) => create());
  resumableResume.mockReset().mockResolvedValue(null);
  vi.mocked(runWorkspaceTurn).mockReset();
});

describe("POST /api/agent/chat", () => {
  it("rejects invalid UI message requests before starting a run", async () => {
    const response = await POST(request({}));
    expect(response.status).toBe(400);
    expect(runWorkspaceTurn).not.toHaveBeenCalled();
  });

  it("rejects a request body over the byte budget before starting a run", async () => {
    const response = await POST(request("x".repeat(AGENT_CHAT_REQUEST_MAX_BYTES + 1), true));

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      detail: { code: "agent_request_too_large" },
    });
    expect(runWorkspaceTurn).not.toHaveBeenCalled();
  });

  it("keeps malformed JSON as an invalid request", async () => {
    const response = await POST(request("not-json", true));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      detail: { code: "invalid_agent_request" },
    });
    expect(runWorkspaceTurn).not.toHaveBeenCalled();
  });

  it("passes the complete validated branch to the workspace turn service", async () => {
    vi.mocked(runWorkspaceTurn).mockResolvedValue({
      headers: { "X-Spectra-Run-Id": runId },
      stream: createUIMessageStream({
        execute({ writer }) {
          writer.write({ id: "answer", type: "text-start" });
          writer.write({ delta: "Direct stream", id: "answer", type: "text-delta" });
          writer.write({ id: "answer", type: "text-end" });
        },
      }),
      type: "stream",
    });

    const response = await POST(request(validBody()));
    expect(response.status).toBe(200);
    expect(response.headers.get(RESUMABLE_STREAM_ID_HEADER)).toBe(runId);
    expect(resumableRun).toHaveBeenCalledWith(runId, expect.any(Function));
    expect(runWorkspaceTurn).toHaveBeenCalledWith({
      actor,
      request: expect.objectContaining({
        conversationId,
        latestUserMessage: expect.objectContaining({ id: "browser-user-1" }),
        operation: "send",
        workspaceId,
      }),
    });
    expect(await response.text()).toContain("Direct stream");
  });

  it("returns stable service errors without creating a resumable response", async () => {
    vi.mocked(runWorkspaceTurn).mockResolvedValue({
      code: "agent_budget_exhausted",
      runId,
      status: 429,
      type: "error",
    });

    const response = await POST(request(validBody()));
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      detail: { code: "agent_budget_exhausted", runId },
    });
    expect(resumableRun).not.toHaveBeenCalled();
  });

  it("resumes the existing stream for a duplicate client request", async () => {
    resumableResume.mockResolvedValue(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"type":"finish"}\n\n'));
          controller.close();
        },
      }),
    );
    vi.mocked(runWorkspaceTurn).mockResolvedValue({
      code: "agent_request_replayed",
      runId,
      status: 409,
      type: "error",
    });

    const response = await POST(request(validBody()));

    expect(response.status).toBe(200);
    expect(resumableResume).toHaveBeenCalledWith(runId);
    expect(response.headers.get(RESUMABLE_STREAM_ID_HEADER)).toBe(runId);
    expect(await response.text()).toContain('"type":"finish"');
    expect(resumableRun).not.toHaveBeenCalled();
  });

  it("returns a stable unavailable error for an unexpected executor failure", async () => {
    vi.mocked(runWorkspaceTurn).mockRejectedValue(new Error("provider secret"));
    const response = await POST(request(validBody()));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      detail: { code: "agent_unavailable" },
    });
  });
});
