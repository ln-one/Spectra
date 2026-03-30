import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChatPanel } from "@/components/project/features/chat/ChatPanel";
import { useProjectStore } from "@/stores/projectStore";
import { ragApi } from "@/lib/sdk/rag";

jest.mock("@/stores/projectStore", () => ({
  ...jest.requireActual("@/stores/projectStore"),
  useProjectStore: jest.fn(),
}));

jest.mock("@/lib/sdk/rag", () => ({
  ragApi: {
    transcribeAudio: jest.fn(),
  },
}));

jest.mock("sonner", () => ({
  toast: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock("@/components/project/features/chat/components/MessageBubble", () => ({
  MessageBubble: () => null,
}));

jest.mock("@/components/project/features/chat/components/ThinkingBubble", () => ({
  ThinkingBubble: () => null,
}));

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

let activeRecognition: MockSpeechRecognition | null = null;

class MockSpeechRecognition {
  lang = "";
  continuous = false;
  interimResults = false;
  onresult: ((event: { resultIndex: number; results: RecognitionResultLike[] }) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onend: (() => void) | null = null;

  constructor() {
    activeRecognition = this;
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

class MockMediaRecorder {
  static isTypeSupported() {
    return true;
  }

  mimeType: string;
  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(_stream: MediaStream, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? "audio/webm";
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.ondataavailable?.({
      data: new Blob(["audio"], { type: this.mimeType }),
    });
    this.onstop?.();
  }
}

describe("ChatPanel voice live transcript", () => {
  const mockedStore = useProjectStore as unknown as jest.Mock;
  const mockedTranscribeAudio = ragApi.transcribeAudio as jest.Mock;
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

    Object.defineProperty(globalThis, "MediaRecorder", {
      writable: true,
      configurable: true,
      value: MockMediaRecorder,
    });

    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      writable: true,
      configurable: true,
      value: jest.fn(),
    });

    Object.defineProperty(navigator, "mediaDevices", {
      writable: true,
      configurable: true,
      value: {
        getUserMedia: jest.fn().mockResolvedValue({
          getTracks: () => [{ stop: jest.fn() }],
        }),
      },
    });
  });

  beforeEach(() => {
    sendMessage.mockReset();
    mockedTranscribeAudio.mockReset();
    mockedTranscribeAudio.mockResolvedValue({
      success: true,
      data: { text: "你好，世界" },
    });

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

  it("updates live transcript and replaces with backend corrected text on stop", async () => {
    render(<ChatPanel projectId="proj_1" />);

    const voiceButton = screen.getByRole("button", { name: "语音输入" });
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    fireEvent.click(voiceButton);

    await waitFor(() => {
      expect(textarea).toBeDisabled();
    });
    expect(activeRecognition).not.toBeNull();

    activeRecognition?.emit([
      { isFinal: false, 0: { transcript: "你好" } },
    ]);

    await waitFor(() => {
      expect(textarea.value).toBe("你好");
    });

    activeRecognition?.emit([
      { isFinal: true, 0: { transcript: "你好 同学" } },
    ]);

    await waitFor(() => {
      expect(textarea.value).toBe("你好 同学");
    });

    fireEvent.click(voiceButton);

    await waitFor(() => {
      expect(mockedTranscribeAudio).toHaveBeenCalledTimes(1);
      expect(textarea.value).toBe("你好，世界");
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
      expect(screen.getByRole("button", { name: "结束语音输入" })).toBeInTheDocument();
    });

    activeRecognition?.emit([{ isFinal: false, 0: { transcript: "追加" } }]);

    await waitFor(() => {
      expect(textarea.value).toBe("追加");
    });

    mockedTranscribeAudio.mockResolvedValueOnce({
      success: true,
      data: { text: "后端修正" },
    });

    fireEvent.click(screen.getByRole("button", { name: "结束语音输入" }));

    await waitFor(() => {
      expect(textarea.value).toBe("后端修正");
      expect(sendMessage).not.toHaveBeenCalled();
    });
  });

  it("falls back to recorder-only flow when browser speech recognition is unavailable", async () => {
    const originalSpeech = (window as Window & { SpeechRecognition?: unknown })
      .SpeechRecognition;
    const originalWebkit = (window as Window & { webkitSpeechRecognition?: unknown })
      .webkitSpeechRecognition;
    (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition =
      undefined;
    (window as Window & { webkitSpeechRecognition?: unknown })
      .webkitSpeechRecognition = undefined;

    render(<ChatPanel projectId="proj_1" />);

    const voiceButton = screen.getByRole("button", { name: "语音输入" });
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;

    fireEvent.click(voiceButton);
    await waitFor(() => {
      expect(textarea).toBeDisabled();
      expect(screen.getByRole("button", { name: "结束语音输入" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "结束语音输入" }));

    await waitFor(() => {
      expect(mockedTranscribeAudio).toHaveBeenCalledTimes(1);
      expect(textarea.value).toBe("你好，世界");
      expect(textarea).not.toBeDisabled();
    });

    (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition =
      originalSpeech;
    (window as Window & { webkitSpeechRecognition?: unknown })
      .webkitSpeechRecognition = originalWebkit;
  });
});
