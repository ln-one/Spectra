import { act, render, screen, waitFor } from "@testing-library/react";
import { useStudioCapabilityState } from "@/components/project/features/studio/panel/useStudioCapabilityState";
import type { ArtifactHistoryByTool } from "@/lib/project-space/artifact-history";

const getCardMock = jest.fn();
const getExecutionPlanMock = jest.fn();

const EMPTY_ARTIFACT_HISTORY: ArtifactHistoryByTool = {
  word: [],
  mindmap: [],
  outline: [],
  quiz: [],
  summary: [],
  animation: [],
  handout: [],
  ppt: [],
};

jest.mock("@/lib/sdk", () => ({
  projectSpaceApi: {
    getArtifact: jest.fn(),
    downloadArtifact: jest.fn(),
  },
  studioCardsApi: {
    getCard: (...args: unknown[]) => getCardMock(...args),
    getExecutionPlan: (...args: unknown[]) => getExecutionPlanMock(...args),
  },
}));

jest.mock("@/hooks/use-toast", () => ({
  toast: jest.fn(),
}));

function HookProbe({
  expandedTool = "word",
  artifactHistoryByTool = EMPTY_ARTIFACT_HISTORY,
  draftSourceArtifactId = null,
}: {
  expandedTool?: "word" | "quiz" | "mindmap" | "summary" | "animation" | "handout";
  artifactHistoryByTool?: ArtifactHistoryByTool;
  draftSourceArtifactId?: string | null;
}) {
  const state = useStudioCapabilityState({
    projectId: "proj-1",
    activeSessionId: "sess-1",
    activeRunId: null,
    expandedTool,
    artifactHistoryByTool,
    draftSourceArtifactId,
  });

  return (
    <div>
      <div data-testid="supports-chat-refine">
        {String(state.supportsChatRefine)}
      </div>
      <div data-testid="current-readiness">
        {state.currentReadiness ?? "null"}
      </div>
      <div data-testid="selected-source-id">
        {state.selectedSourceId ?? "null"}
      </div>
      <div data-testid="has-source-binding">
        {String(state.hasSourceBinding)}
      </div>
    </div>
  );
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("useStudioCapabilityState", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("keeps conservative defaults before card protocol finishes loading", async () => {
    let resolveCard: ((value: unknown) => void) | undefined;
    let resolvePlan: ((value: unknown) => void) | undefined;
    getCardMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCard = resolve;
        })
    );
    getExecutionPlanMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePlan = resolve;
        })
    );

    await act(async () => {
      render(<HookProbe />);
      await flushMicrotasks();
    });

    expect(screen.getByTestId("supports-chat-refine").textContent).toBe("false");
    expect(screen.getByTestId("current-readiness").textContent).toBe("null");
    expect(screen.getByTestId("selected-source-id").textContent).toBe("null");
    expect(screen.getByTestId("has-source-binding").textContent).toBe("false");

    await act(async () => {
      if (resolveCard) {
        resolveCard({
          data: {
            studio_card: {
              id: "word_document",
              supports_chat_refine: true,
              requires_source_artifact: true,
              readiness: "foundation_ready",
            },
          },
        });
      }
      if (resolvePlan) {
        resolvePlan({
          data: {
            execution_plan: {
              card_id: "word_document",
              readiness: "foundation_ready",
            },
          },
        });
      }
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(screen.getByTestId("supports-chat-refine").textContent).toBe("true");
      expect(screen.getByTestId("current-readiness").textContent).toBe(
        "foundation_ready"
      );
    });
  });

  it("does not invent source binding when no draft or loaded source exists", async () => {
    getCardMock.mockResolvedValue({
      data: {
        studio_card: {
          id: "interactive_quick_quiz",
          supports_chat_refine: true,
          requires_source_artifact: false,
          readiness: "foundation_ready",
        },
      },
    });
    getExecutionPlanMock.mockResolvedValue({
      data: {
        execution_plan: {
          card_id: "interactive_quick_quiz",
          readiness: "foundation_ready",
        },
      },
    });

    await act(async () => {
      render(<HookProbe expandedTool="quiz" />);
      await flushMicrotasks();
    });

    expect(screen.getByTestId("selected-source-id").textContent).toBe("null");
    expect(screen.getByTestId("has-source-binding").textContent).toBe("false");
  });
});
