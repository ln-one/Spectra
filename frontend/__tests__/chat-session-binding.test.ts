import { chatApi } from "@/lib/sdk";
import { createChatActions } from "@/stores/project-store/chat-actions";
import type { ProjectState } from "@/stores/project-store/types";
import { toast } from "@/hooks/use-toast";

jest.mock("@/lib/sdk", () => ({
  chatApi: {
    getMessages: jest.fn(),
    sendMessage: jest.fn(),
  },
}));

jest.mock("@/hooks/use-toast", () => ({
  toast: jest.fn(),
}));

describe("chat session binding", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not fetch project-level messages when no active session exists", async () => {
    const set = jest.fn();
    const get = jest.fn(
      () =>
        ({
          activeSessionId: null,
        }) as unknown as ProjectState
    );
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
    const get = jest.fn(() => state as unknown as ProjectState);
    const actions = createChatActions({ set, get });

    await actions.sendMessage("p-001", "hello");

    expect(chatApi.sendMessage).not.toHaveBeenCalled();
  });

  it("does not show a slow-response toast after a successful chat reply", async () => {
    type MutableState = Pick<
      ProjectState,
      | "activeSessionId"
      | "messages"
      | "selectedFileIds"
      | "selectedLibraryIds"
      | "selectedArtifactSourceIds"
      | "files"
      | "generationHistory"
      | "lastFailedInput"
      | "isSending"
      | "latestBriefHint"
      | "error"
      | "fetchGenerationHistory"
      | "refreshGenerationSession"
    >;

    let state: MutableState = {
      activeSessionId: "s-001",
      messages: [],
      selectedFileIds: [],
      selectedLibraryIds: [],
      selectedArtifactSourceIds: [],
      files: [],
      generationHistory: [],
      lastFailedInput: null,
      isSending: false,
      latestBriefHint: null,
      error: null,
      fetchGenerationHistory: jest.fn().mockResolvedValue(undefined),
      refreshGenerationSession: jest.fn().mockResolvedValue(null),
    };

    const set = jest.fn(
      (
        partial:
          | Partial<MutableState>
          | ((current: MutableState) => Partial<MutableState>)
      ) => {
        const next =
          typeof partial === "function" ? partial(state) : (partial ?? {});
        state = { ...state, ...next };
      }
    );
    const get = jest.fn(() => state as unknown as ProjectState);
    const actions = createChatActions({ set, get });

    (chatApi.sendMessage as jest.Mock).mockResolvedValue({
      data: {
        session_id: "s-001",
        message: {
          id: "m-002",
          role: "assistant",
          content: "reply",
          timestamp: "now",
        },
        observability: {
          total_duration_ms: 22000,
        },
      },
    });

    await actions.sendMessage("p-001", "hello");

    expect(chatApi.sendMessage).toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it("ignores stale fetchMessages responses when switching sessions quickly", async () => {
    const set = jest.fn();
    const get = jest.fn(
      () =>
        ({
          activeSessionId: null,
        }) as unknown as ProjectState
    );
    const actions = createChatActions({ set, get });

    const deferred: {
      s1: ((value: unknown) => void) | null;
      s2: ((value: unknown) => void) | null;
    } = {
      s1: null,
      s2: null,
    };

    (chatApi.getMessages as jest.Mock).mockImplementation(
      ({ session_id }: { session_id: string }) =>
        new Promise((resolve) => {
          if (session_id === "s-1") deferred.s1 = resolve;
          if (session_id === "s-2") deferred.s2 = resolve;
        })
    );

    get.mockReturnValue({ activeSessionId: "s-1" } as unknown as ProjectState);
    const p1 = actions.fetchMessages("p-001", "s-1");

    get.mockReturnValue({ activeSessionId: "s-2" } as unknown as ProjectState);
    const p2 = actions.fetchMessages("p-001", "s-2");

    if (deferred.s2) {
      deferred.s2({
        data: {
          messages: [
            { id: "m-2", role: "assistant", content: "new", timestamp: "now" },
          ],
        },
      });
    }
    if (deferred.s1) {
      deferred.s1({
        data: {
          messages: [
            { id: "m-1", role: "assistant", content: "old", timestamp: "now" },
          ],
        },
      });
    }

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
