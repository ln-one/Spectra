import { renderHook, waitFor } from "@testing-library/react";
import { useGenerationEvents } from "@/hooks/useGenerationEvents";
import { useProjectStore } from "@/stores/projectStore";
import { useOutlineStreamState } from "@/components/project/features/outline-editor/useOutlineStreamState";
import { buildOutlineRunCacheKey } from "@/components/project/features/outline-editor/utils";

jest.mock("@/hooks/useGenerationEvents", () => ({
  useGenerationEvents: jest.fn(),
}));

jest.mock("@/stores/projectStore", () => ({
  useProjectStore: jest.fn(),
}));

type MockStoreState = {
  generationSession: {
    session: {
      session_id: string;
      state: string;
    };
    outline: null;
    options: {
      page_count: number;
    };
    current_run: {
      run_id: string;
    };
  };
  activeRunId: string;
  updateOutline: jest.Mock;
  confirmOutline: jest.Mock;
};

function buildOutlineText(count: number): string {
  return JSON.stringify({
    nodes: Array.from({ length: count }, (_, index) => ({
      title: `Slide ${index + 1}`,
      bullets: [`Point ${index + 1}`],
      page_type: "content",
      layout_hint: "content-two-column",
    })),
  });
}

describe("useOutlineStreamState cache replay guard", () => {
  const sessionId = "session-1";
  const runId = "run-1";
  const outlineText = buildOutlineText(8);

  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();

    const storeState: MockStoreState = {
      generationSession: {
        session: {
          session_id: sessionId,
          state: "DRAFTING_OUTLINE",
        },
        outline: null,
        options: {
          page_count: 8,
        },
        current_run: {
          run_id: runId,
        },
      },
      activeRunId: runId,
      updateOutline: jest.fn(),
      confirmOutline: jest.fn(),
    };

    (useProjectStore as unknown as jest.Mock).mockImplementation(
      (selector: (state: MockStoreState) => unknown) => selector(storeState)
    );

    (
      useProjectStore as unknown as jest.Mock & {
        setState?: jest.Mock;
      }
    ).setState = jest.fn();

    (useGenerationEvents as unknown as jest.Mock).mockReturnValue({
      events: [
        {
          timestamp: "2026-04-20T12:00:00Z",
          event_type: "outline.token",
          payload: {
            run_id: runId,
            section_payload: {
              run_id: runId,
              stream_channel: "diego.outline.token",
              diego_event_type: "outline.token",
              token: outlineText,
              diego_seq: 1,
            },
          },
        },
      ],
      isConnected: true,
      error: null,
    });

    window.localStorage.setItem(
      buildOutlineRunCacheKey(sessionId, runId),
      JSON.stringify({
        sessionId,
        runId,
        phase: "outline_streaming",
        preambleCollapsed: true,
        streamLogs: [],
        outlineStreamText: outlineText,
        slides: Array.from({ length: 8 }, (_, index) => ({
          id: `slide-${index + 1}`,
          order: index + 1,
          title: `Slide ${index + 1}`,
          keyPoints: [`Point ${index + 1}`],
          pageType: "content",
          layoutHint: "content-two-column",
        })),
        analysisPageCount: 8,
        lastDiegoSeq: 1,
        updatedAt: "2026-04-20T12:00:00Z",
      })
    );
  });

  it("does not duplicate outline slides when replayed token events arrive after re-entry", async () => {
    const { result } = renderHook(() =>
      useOutlineStreamState({
        topic: "测试主题",
      })
    );

    await waitFor(() => {
      expect(result.current.slides).toHaveLength(8);
    });

    expect(result.current.slides[0]?.title).toBe("Slide 1");
    expect(result.current.slides[7]?.title).toBe("Slide 8");
    expect(result.current.readySlidesCount).toBe(8);
    expect(result.current.outlineIncomplete).toBe(false);
  });
});
