import { chatApi, studioCardsApi } from "@/lib/sdk";
import { ApiError } from "@/lib/sdk/errors";
import { createChatActions } from "@/stores/project-store/chat-actions";
import { buildRefineFailureMessage } from "@/stores/project-store/studio-chat.helpers";
import type {
  ProjectState,
  StudioChatContext,
} from "@/stores/project-store/types";
import { toast } from "@/hooks/use-toast";

jest.mock("@/lib/sdk", () => ({
  chatApi: {
    getMessages: jest.fn(),
    sendMessage: jest.fn(),
  },
  studioCardsApi: {
    refine: jest.fn(),
  },
}));

jest.mock("@/hooks/use-toast", () => ({
  toast: jest.fn(),
}));

describe("chat session binding", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function createRefineHarness(context: StudioChatContext) {
    type MutableState = Pick<
      ProjectState,
      | "activeSessionId"
      | "studioChatContext"
      | "localToolMessages"
      | "studioHintDedupeByProject"
      | "selectedFileIds"
      | "selectedLibraryIds"
      | "selectedArtifactSourceIds"
      | "files"
      | "isStudioRefining"
      | "refreshGenerationSession"
      | "fetchGenerationHistory"
      | "fetchArtifactHistory"
      | "generationHistory"
      | "artifactHistoryByTool"
      | "currentSessionArtifacts"
      | "messages"
      | "error"
    >;

    let state: MutableState = {
      activeSessionId: context.sessionId,
      studioChatContext: context,
      localToolMessages: {},
      studioHintDedupeByProject: {},
      selectedFileIds: [],
      selectedLibraryIds: [],
      selectedArtifactSourceIds: [],
      files: [],
      isStudioRefining: false,
      refreshGenerationSession: jest.fn().mockResolvedValue(null),
      fetchGenerationHistory: jest.fn().mockResolvedValue(undefined),
      fetchArtifactHistory: jest.fn().mockResolvedValue(undefined),
      generationHistory: [],
      artifactHistoryByTool: {},
      currentSessionArtifacts: [],
      messages: [],
      error: null,
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

    (studioCardsApi.refine as jest.Mock).mockResolvedValue({
      data: {
        execution_result: {
          run: { id: "run-002", status: "completed" },
          artifact: { artifact_id: "artifact-002" },
          session: { session_id: context.sessionId },
        },
      },
    });

    return { actions };
  }

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

  it("sends word refine as structured_refine", async () => {
    const context: StudioChatContext = {
      projectId: "p-001",
      sessionId: "s-001",
      toolType: "word",
      toolLabel: "教学文档",
      cardId: "word_document",
      step: "preview",
      canRefine: true,
      isRefineMode: true,
      targetArtifactId: "artifact-001",
    };
    const { actions } = createRefineHarness(context);

    await actions.sendStudioRefineMessage("p-001", "请改得更适合课堂讲解");

    expect(studioCardsApi.refine).toHaveBeenCalledWith(
      "word_document",
      expect.objectContaining({
        refine_mode: "structured_refine",
      })
    );
  });

  it("sends mindmap refine as chat_refine", async () => {
    const context: StudioChatContext = {
      projectId: "p-001",
      sessionId: "s-001",
      toolType: "mindmap",
      toolLabel: "思维导图",
      cardId: "knowledge_mindmap",
      step: "preview",
      canRefine: true,
      isRefineMode: true,
      targetArtifactId: "artifact-001",
    };
    const { actions } = createRefineHarness(context);

    await actions.sendStudioRefineMessage("p-001", "把整张导图扩展成更完整的大图");

    expect(studioCardsApi.refine).toHaveBeenCalledWith(
      "knowledge_mindmap",
      expect.objectContaining({
        refine_mode: "chat_refine",
      })
    );
  });

  it("treats mindmap refine without artifact result as failure", async () => {
    const context: StudioChatContext = {
      projectId: "p-001",
      sessionId: "s-001",
      toolType: "mindmap",
      toolLabel: "思维导图",
      cardId: "knowledge_mindmap",
      step: "preview",
      canRefine: true,
      isRefineMode: true,
      targetArtifactId: "artifact-001",
    };
    const { actions } = createRefineHarness(context);

    (studioCardsApi.refine as jest.Mock).mockResolvedValue({
      data: {
        execution_result: {
          run: { id: "run-002", status: "completed" },
          session: { session_id: context.sessionId },
        },
      },
    });

    await actions.sendStudioRefineMessage("p-001", "把整张导图扩成更完整的大图");

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "微调失败",
        description: "未生成新版导图",
      })
    );
  });

  it("renders timeout-specific refine failure copy for mindmap", () => {
    expect(
      buildRefineFailureMessage(
        "mindmap",
        "思维导图",
        "upstream_timeout"
      )
    ).toBe("思维导图微调超时，模型在限定时间内没有返回新版结果。");
  });

  it("renders quality-gate refine failure copy for mindmap", () => {
    expect(
      buildRefineFailureMessage(
        "mindmap",
        "思维导图",
        "mindmap_refine_quality_low:rewrite_shrank_nodes,insufficient_depth"
      )
    ).toBe("思维导图微调已被自动拦截：节点数明显减少、层级过浅。");
  });

  it("treats timeout failure reason as timeout-specific local message", async () => {
    const context: StudioChatContext = {
      projectId: "p-001",
      sessionId: "s-001",
      toolType: "mindmap",
      toolLabel: "思维导图",
      cardId: "knowledge_mindmap",
      step: "preview",
      canRefine: true,
      isRefineMode: true,
      targetArtifactId: "artifact-001",
    };
    const { actions } = createRefineHarness(context);

    (studioCardsApi.refine as jest.Mock).mockRejectedValue(
      new ApiError("UPSTREAM_TIMEOUT", "上游超时", 504, {
        failure_reason: "upstream_timeout",
      })
    );

    await actions.sendStudioRefineMessage("p-001", "扩成五层");

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "微调失败",
        description: "思维导图微调超时，模型在限定时间内没有返回新版结果。",
      })
    );
  });

  it("uses localized quality-gate copy for mindmap refine toast", async () => {
    const context: StudioChatContext = {
      projectId: "p-001",
      sessionId: "s-001",
      toolType: "mindmap",
      toolLabel: "思维导图",
      cardId: "knowledge_mindmap",
      step: "preview",
      canRefine: true,
      isRefineMode: true,
      targetArtifactId: "artifact-001",
    };
    const { actions } = createRefineHarness(context);

    (studioCardsApi.refine as jest.Mock).mockRejectedValue(
      new ApiError("INVALID_INPUT", "Refined mindmap payload failed quality score checks.", 422, {
        failure_reason:
          "mindmap_refine_quality_low:rewrite_shrank_nodes,insufficient_depth",
      })
    );

    await actions.sendStudioRefineMessage("p-001", "扩成五层");

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "微调失败",
        description: "思维导图微调已被自动拦截：节点数明显减少、层级过浅。",
      })
    );
  });

  it("shows requested depth failure copy for mindmap refine toast", async () => {
    const context: StudioChatContext = {
      projectId: "p-001",
      sessionId: "s-001",
      toolType: "mindmap",
      toolLabel: "思维导图",
      cardId: "knowledge_mindmap",
      step: "preview",
      canRefine: true,
      isRefineMode: true,
      targetArtifactId: "artifact-001",
    };
    const { actions } = createRefineHarness(context);

    (studioCardsApi.refine as jest.Mock).mockRejectedValue(
      new ApiError("INVALID_INPUT", "Refined mindmap payload failed quality score checks.", 422, {
        failure_reason: "mindmap_refine_quality_low:requested_depth_not_met",
      })
    );

    await actions.sendStudioRefineMessage("p-001", "改成五层");

    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "微调失败",
        description: "思维导图微调已被自动拦截：未达到要求层级。",
      })
    );
  });
});
