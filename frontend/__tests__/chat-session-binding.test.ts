import { chatApi } from "@/lib/sdk";
import { createChatActions } from "@/stores/project-store/chat-actions";

jest.mock("@/lib/sdk", () => ({
  chatApi: {
    getMessages: jest.fn(),
    sendMessage: jest.fn(),
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

  it("requires an explicit session before sending the first chat message", async () => {
    const set = jest.fn();
    const state = {
      activeSessionId: null as string | null,
      generationHistory: [],
      selectedFileIds: [],
      fetchGenerationHistory: jest.fn().mockResolvedValue(undefined),
    };
    const get = jest.fn(() => state);
    const actions = createChatActions({ set, get });

    await actions.sendMessage("p-001", "hello");

    expect(chatApi.sendMessage).not.toHaveBeenCalled();
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
