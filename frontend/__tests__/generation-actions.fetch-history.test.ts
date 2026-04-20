import { createGenerationActions } from "@/stores/project-store/generation-actions";
import { generateApi } from "@/lib/sdk";

jest.mock("@/hooks/use-toast", () => ({
  toast: jest.fn(),
}));

jest.mock("@/lib/sdk", () => ({
  generateApi: {
    listSessions: jest.fn(),
  },
  previewApi: {},
  projectSpaceApi: {},
}));

type MutableStoreState = {
  generationHistory: Array<{
    id: string;
    toolId: string;
    toolName: string;
    status: "completed" | "failed" | "processing" | "pending";
    sessionState?: string;
    createdAt: string;
    title: string;
    titleSource?: string;
  }>;
  activeSessionId: string | null;
  activeRunId: string | null;
  generationSession: { session?: { session_id?: string } } | null;
  fetchArtifactHistory: jest.Mock<Promise<void>, [string, string | null]>;
};

function createStoreHarness(initialState: MutableStoreState) {
  let state = initialState;

  const set = (
    partial:
      | Partial<MutableStoreState>
      | ((current: MutableStoreState) => Partial<MutableStoreState>)
  ) => {
    const next =
      typeof partial === "function" ? partial(state) : (partial ?? {});
    state = { ...state, ...next };
  };

  const actions = createGenerationActions({
    set: set as never,
    get: (() => state) as never,
  });

  return {
    actions,
    getState: () => state,
  };
}

describe("generation actions fetchGenerationHistory", () => {
  const mockedListSessions = generateApi.listSessions as jest.MockedFunction<
    typeof generateApi.listSessions
  >;

  beforeEach(() => {
    mockedListSessions.mockReset();
  });

  it("skips rewriting equivalent history during title polling", async () => {
    const fetchArtifactHistory = jest.fn().mockResolvedValue(undefined);
    const { actions, getState } = createStoreHarness({
      generationHistory: [
        {
          id: "session-1",
          toolId: "ppt",
          toolName: "智能课件",
          status: "processing",
          sessionState: "GENERATING_CONTENT",
          createdAt: "2026-04-20T00:00:00Z",
          title: "现有标题",
          titleSource: "pending",
        },
      ],
      activeSessionId: "session-1",
      activeRunId: null,
      generationSession: null,
      fetchArtifactHistory,
    });

    mockedListSessions.mockResolvedValue({
      data: {
        sessions: [
          {
            session_id: "session-1",
            state: "GENERATING_CONTENT",
            output_type: "ppt",
            created_at: "2026-04-20T00:00:00Z",
            display_title: "现有标题",
            display_title_source: "pending",
          },
        ],
      },
    } as never);

    const previousHistoryRef = getState().generationHistory;
    await actions.fetchGenerationHistory("proj-1");

    expect(getState().generationHistory).toBe(previousHistoryRef);
    expect(fetchArtifactHistory).not.toHaveBeenCalled();
  });
});
