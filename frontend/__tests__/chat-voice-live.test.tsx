import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChatPanel } from "@/components/project/features/chat/ChatPanel";
import { useProjectStore } from "@/stores/projectStore";

jest.mock("@/stores/projectStore", () => ({
  ...jest.requireActual("@/stores/projectStore"),
  useProjectStore: jest.fn(),
}));

jest.mock("sonner", () => ({
  toast: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock(
  "@/components/project/features/chat/components/MessageBubble",
  () => ({
    MessageBubble: () => null,
  })
);

jest.mock(
  "@/components/project/features/chat/components/ThinkingBubble",
  () => ({
    ThinkingBubble: () => null,
  })
);

jest.mock(
  "@/components/project/features/sources/components/SelectedSourceScopeBadge",
  () => ({
    SelectedSourceScopeBadge: () => null,
  })
);

class ResizeObserverMock {
  observe() {
    return undefined;
  }
  disconnect() {
    return undefined;
  }
}

type RecognitionResultLike = { isFinal: boolean; 0: { transcript: string } };

class MockSpeechRecognition {
  static activeInstance: MockSpeechRecognition | null = null;

  lang = "";
  continuous = false;
  interimResults = false;
  onresult:
    | ((event: {
        resultIndex: number;
        results: RecognitionResultLike[];
      }) => void)
    | null = null;
  onerror: ((event: Event) => void) | null = null;
  onend: (() => void) | null = null;

  constructor() {
    MockSpeechRecognition.activeInstance = this;
  }

  start() {
    return undefined;
  }

  stop() {
    this.onend?.();
  }

  emit(results: RecognitionResultLike[]) {
    this.onresult?.({ resultIndex: 0, results });
  }
}

describe("ChatPanel voice live transcript", () => {
  const mockedStore = useProjectStore as unknown as jest.Mock;
  const sendMessage = jest.fn();

  beforeAll(() => {
    Object.defineProperty(globalThis, "ResizeObserver", {
      writable: true,
      configurable: true,
      value: ResizeObserverMock,
    });

    Object.defineProperty(window, "SpeechRecognition", {
      writable: true,
      configurable: true,
      value: MockSpeechRecognition,
    });

    Object.defineProperty(window, "webkitSpeechRecognition", {
      writable: true,
      configurable: true,
      value: MockSpeechRecognition,
    });

    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      writable: true,
      configurable: true,
      value: jest.fn(),
    });
  });

  beforeEach(() => {
    sendMessage.mockReset();

    mockedStore.mockReturnValue({
      messages: [],
      localToolMessages: {},
      studioChatContext: null,
      chatComposerFocusSignal: 0,
      activeSessionId: "sess_1",
      isMessagesLoading: false,
      isSending: false,
      isStudioRefining: false,
      sendMessage,
      sendStudioRefineMessage: jest.fn(),
      hydrateStudioLocalState: jest.fn(),
      lastFailedInput: null,
      clearLastFailedInput: jest.fn(),
    });
  });

  it("keeps live transcript when stopping voice capture", async () => {
    render(<ChatPanel projectId="proj_1" />);

    const voiceButton = screen.getByRole("button", { name: "语音输入" });
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    fireEvent.click(voiceButton);

    await waitFor(() => {
      expect(textarea).toBeDisabled();
    });
    expect(MockSpeechRecognition.activeInstance).not.toBeNull();

    act(() => {
      MockSpeechRecognition.activeInstance?.emit([
        { isFinal: false, 0: { transcript: "你好" } },
      ]);
    });

    await waitFor(() => {
      expect(textarea.value).toBe("你好");
    });

    act(() => {
      MockSpeechRecognition.activeInstance?.emit([
        { isFinal: true, 0: { transcript: "你好 同学" } },
      ]);
    });

    await waitFor(() => {
      expect(textarea.value).toBe("你好 同学");
    });

    fireEvent.click(voiceButton);

    await waitFor(() => {
      expect(textarea.value).toBe("你好 同学");
    });

    expect(sendMessage).not.toHaveBeenCalled();
    expect(textarea).not.toBeDisabled();
  });

  it("clicking while listening stops voice capture instead of sending typed interim text", async () => {
    render(<ChatPanel projectId="proj_1" />);

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    const voiceButton = screen.getByRole("button", { name: "语音输入" });
    fireEvent.click(voiceButton);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "结束语音输入" })
      ).toBeInTheDocument();
    });

    act(() => {
      MockSpeechRecognition.activeInstance?.emit([
        { isFinal: false, 0: { transcript: "追加" } },
      ]);
    });

    await waitFor(() => {
      expect(textarea.value).toBe("追加");
    });

    fireEvent.click(screen.getByRole("button", { name: "结束语音输入" }));

    await waitFor(() => {
      expect(textarea.value).toBe("追加");
      expect(sendMessage).not.toHaveBeenCalled();
    });
  });

  it("shows unavailable when browser speech recognition is unavailable", async () => {
    const originalSpeech = (window as Window & { SpeechRecognition?: unknown })
      .SpeechRecognition;
    const originalWebkit = (
      window as Window & { webkitSpeechRecognition?: unknown }
    ).webkitSpeechRecognition;
    (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition =
      undefined;
    (
      window as Window & { webkitSpeechRecognition?: unknown }
    ).webkitSpeechRecognition = undefined;

    render(<ChatPanel projectId="proj_1" />);

    const voiceButton = screen.getByRole("button", { name: "语音输入" });
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    fireEvent.click(voiceButton);
    await waitFor(() => {
      expect(textarea).not.toBeDisabled();
      expect(
        screen.queryByRole("button", { name: "结束语音输入" })
      ).not.toBeInTheDocument();
    });

    (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition =
      originalSpeech;
    (
      window as Window & { webkitSpeechRecognition?: unknown }
    ).webkitSpeechRecognition = originalWebkit;
  });
});

