import { act, render, screen, waitFor } from "@testing-library/react";
import { useStudioCapabilityState } from "@/components/project/features/studio/panel/useStudioCapabilityState";
import type { ManagedWorkbenchState } from "@/components/project/features/studio/panel/types";
import type { ArtifactHistoryByTool } from "@/lib/project-space/artifact-history";

const getCardMock = jest.fn();
const getExecutionPlanMock = jest.fn();
const getArtifactMock = jest.fn();
const downloadArtifactMock = jest.fn();

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
    getArtifact: (...args: unknown[]) => getArtifactMock(...args),
    downloadArtifact: (...args: unknown[]) => downloadArtifactMock(...args),
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
  managedWorkbenchState = null,
}: {
  expandedTool?: "word" | "quiz" | "mindmap" | "summary" | "animation" | "handout";
  artifactHistoryByTool?: ArtifactHistoryByTool;
  draftSourceArtifactId?: string | null;
  managedWorkbenchState?: ManagedWorkbenchState | null;
}) {
  const state = useStudioCapabilityState({
    projectId: "proj-1",
    activeSessionId: "sess-1",
    activeRunId: null,
    expandedTool,
    artifactHistoryByTool,
    draftSourceArtifactId,
    managedWorkbenchState,
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
      <div data-testid="current-artifact-id">
        {state.currentToolArtifacts[0]?.artifactId ?? "null"}
      </div>
      <div data-testid="resolved-artifact-id">
        {state.activeCapabilityState.resolvedArtifact?.artifactId ?? "null"}
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
    getArtifactMock.mockResolvedValue({
      artifact: {
        id: "artifact-default",
        projectId: "proj-1",
        sessionId: "sess-1",
        basedOnVersionId: null,
        ownerUserId: "u-1",
        type: "mindmap",
        visibility: "private",
        storagePath: "uploads/artifacts/artifact-default.mindmap",
        metadata: {
          content_snapshot: {
            nodes: [{ id: "root", parent_id: null, title: "默认导图" }],
          },
        },
        createdAt: "2026-04-20T10:00:00.000Z",
        updatedAt: "2026-04-20T10:00:00.000Z",
      },
    });
    downloadArtifactMock.mockResolvedValue(
      new Blob([
        JSON.stringify({
          nodes: [{ id: "root", parent_id: null, title: "默认导图" }],
        }),
      ])
    );
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
              requires_source_artifact: false,
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

  it("prefers the managed history result target over the latest artifact", async () => {
    getCardMock.mockResolvedValue({
      data: {
        studio_card: {
          id: "knowledge_mindmap",
          supports_chat_refine: false,
          requires_source_artifact: false,
          readiness: "foundation_ready",
        },
      },
    });
    getExecutionPlanMock.mockResolvedValue({
      data: {
        execution_plan: {
          card_id: "knowledge_mindmap",
          readiness: "foundation_ready",
        },
      },
    });
    getArtifactMock.mockResolvedValue({
      artifact: {
        id: "artifact-old",
        projectId: "proj-1",
        sessionId: "sess-old",
        basedOnVersionId: null,
        ownerUserId: "u-1",
        type: "mindmap",
        visibility: "private",
        storagePath: "uploads/artifacts/artifact-old.mindmap",
        metadata: {
          content_snapshot: {
            nodes: [{ id: "root", parent_id: null, title: "旧导图" }],
          },
        },
        createdAt: "2026-04-20T09:00:00.000Z",
        updatedAt: "2026-04-20T09:00:00.000Z",
      },
    });
    downloadArtifactMock.mockResolvedValue(
      new Blob([
        JSON.stringify({
          nodes: [{ id: "root", parent_id: null, title: "旧导图" }],
        }),
      ])
    );
    const artifactHistoryByTool: ArtifactHistoryByTool = {
      ...EMPTY_ARTIFACT_HISTORY,
      mindmap: [
        {
          artifactId: "artifact-new",
          sessionId: "sess-new",
          toolType: "mindmap",
          artifactType: "mindmap",
          title: "新导图",
          status: "completed",
          createdAt: "2026-04-20T10:00:00.000Z",
          basedOnVersionId: null,
          runId: "run-new",
          runNo: 2,
          metadata: {
            content_snapshot: {
              nodes: [{ id: "root", parent_id: null, title: "新导图" }],
            },
          },
        },
        {
          artifactId: "artifact-old",
          sessionId: "sess-old",
          toolType: "mindmap",
          artifactType: "mindmap",
          title: "旧导图",
          status: "completed",
          createdAt: "2026-04-20T09:00:00.000Z",
          basedOnVersionId: null,
          runId: "run-old",
          runNo: 1,
          metadata: {
            content_snapshot: {
              nodes: [{ id: "root", parent_id: null, title: "旧导图" }],
            },
          },
        },
      ],
    };

    await act(async () => {
      render(
        <HookProbe
          expandedTool="mindmap"
          artifactHistoryByTool={artifactHistoryByTool}
          managedWorkbenchState={{
            mode: "history",
            target: {
              toolType: "mindmap",
              sessionId: "sess-old",
              runId: "run-old",
              artifactId: "artifact-old",
              status: "completed",
            },
            draftAnchors: {},
          }}
        />
      );
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(screen.getByTestId("current-artifact-id").textContent).toBe(
        "artifact-old"
      );
      expect(screen.getByTestId("resolved-artifact-id").textContent).toBe(
        "artifact-old"
      );
    });
  });

  it("keeps quiz in draft mode when a managed draft anchor clears the current artifact", async () => {
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
    const artifactHistoryByTool: ArtifactHistoryByTool = {
      ...EMPTY_ARTIFACT_HISTORY,
      quiz: [
        {
          artifactId: "artifact-quiz-latest",
          sessionId: "sess-quiz-latest",
          toolType: "quiz",
          artifactType: "exercise",
          title: "旧小测",
          status: "completed",
          createdAt: "2026-04-21T10:00:00.000Z",
          basedOnVersionId: null,
          runId: "run-quiz-latest",
          runNo: 3,
        },
      ],
    };

    await act(async () => {
      render(
        <HookProbe
          expandedTool="quiz"
          artifactHistoryByTool={artifactHistoryByTool}
          managedWorkbenchState={{
            mode: "draft",
            target: null,
            draftAnchors: {
              quiz: {
                sessionId: "sess-1",
                artifactId: null,
                runId: null,
                status: null,
              },
            },
          }}
        />
      );
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(screen.getByTestId("current-artifact-id").textContent).toBe("null");
      expect(screen.getByTestId("resolved-artifact-id").textContent).toBe("null");
    });
  });
});
