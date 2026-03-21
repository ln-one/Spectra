import { createChatActions } from "@/stores/project-store/chat-actions";
import { chatApi, generateApi } from "@/lib/sdk";

jest.mock("@/lib/sdk", () => ({
  chatApi: {
    getMessages: jest.fn(),
    sendMessage: jest.fn(),
  },
  generateApi: {
    createSession: jest.fn(),
    getSession: jest.fn(),
  },
}));

describe("chat session binding", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not fetch project-level messages when no active session exists", async () => {
    const set = jest.fn();
    const get = jest.fn(() => ({
      activeSessionId: null,
    }));
    const actions = createChatActions({ set, get });

    await actions.fetchMessages("p-001");

    expect(chatApi.getMessages).not.toHaveBeenCalled();
    expect(set).toHaveBeenCalledWith({ messages: [] });
  });

  it("bootstraps a session before sending the first chat message", async () => {
    const set = jest.fn();
    const state = {
      activeSessionId: null as string | null,
      generationHistory: [],
      selectedFileIds: [],
      fetchGenerationHistory: jest.fn().mockResolvedValue(undefined),
    };
    const get = jest.fn(() => state);
    const actions = createChatActions({ set, get });

    (generateApi.createSession as jest.Mock).mockResolvedValue({
      data: { session: { session_id: "s-bootstrap-001" } },
    });
    (generateApi.getSession as jest.Mock).mockResolvedValue({
      data: { session: { session_id: "s-bootstrap-001" } },
    });
    (chatApi.sendMessage as jest.Mock).mockResolvedValue({
      data: {
        session_id: "s-bootstrap-001",
        message: {
          id: "m-assistant-001",
          role: "assistant",
          content: "好的，我们开始。",
          timestamp: "2026-03-20T00:00:00.000Z",
        },
      },
    });

    await actions.sendMessage("p-001", "你好");

    expect(generateApi.createSession).toHaveBeenCalledWith({
      project_id: "p-001",
      output_type: "both",
      bootstrap_only: true,
    });
    expect(chatApi.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: "p-001",
        session_id: "s-bootstrap-001",
        content: "你好",
      })
    );
  });

  it("ignores stale fetchMessages responses when switching sessions quickly", async () => {
    const set = jest.fn();
    const get = jest.fn();
    const actions = createChatActions({ set, get });

    let resolveS1: ((value: unknown) => void) | null = null;
    let resolveS2: ((value: unknown) => void) | null = null;

    (chatApi.getMessages as jest.Mock).mockImplementation(
      ({ session_id }: { session_id: string }) =>
        new Promise((resolve) => {
          if (session_id === "s-1") resolveS1 = resolve;
          if (session_id === "s-2") resolveS2 = resolve;
        })
    );

    get.mockReturnValue({ activeSessionId: "s-1" });
    const p1 = actions.fetchMessages("p-001", "s-1");

    get.mockReturnValue({ activeSessionId: "s-2" });
    const p2 = actions.fetchMessages("p-001", "s-2");

    resolveS2?.({
      data: {
        messages: [
          { id: "m-2", role: "assistant", content: "new", timestamp: "now" },
        ],
      },
    });
    resolveS1?.({
      data: {
        messages: [
          { id: "m-1", role: "assistant", content: "old", timestamp: "now" },
        ],
      },
    });

    await Promise.all([p1, p2]);

    expect(set).toHaveBeenCalledWith({
      messages: [
        { id: "m-2", role: "assistant", content: "new", timestamp: "now" },
      ],
    });
    expect(set).not.toHaveBeenCalledWith({
      messages: [
        { id: "m-1", role: "assistant", content: "old", timestamp: "now" },
      ],
    });
  });
});
