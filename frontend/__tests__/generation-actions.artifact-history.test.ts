import { createGenerationActions } from "@/stores/project-store/generation-actions";
import { generateApi, projectSpaceApi } from "@/lib/sdk";

jest.mock("@/hooks/use-toast", () => ({
  toast: jest.fn(),
}));

jest.mock("@/lib/sdk", () => ({
  generateApi: {
    getSessionSnapshot: jest.fn(),
  },
  previewApi: {},
  projectSpaceApi: {
    getArtifacts: jest.fn(),
  },
}));

type MutableState = {
  activeSessionId: string | null;
  generationSession: any;
  artifactHistoryByTool: Record<string, unknown[]>;
  currentSessionArtifacts: Array<{ artifactId: string }>;
};

function createHarness(overrides: Partial<MutableState> = {}) {
  let state: MutableState = {
    activeSessionId: "sess-1",
    generationSession: null,
    artifactHistoryByTool: {},
    currentSessionArtifacts: [],
    ...overrides,
  };

  const set = (
    partial:
      | Partial<MutableState>
      | ((current: MutableState) => Partial<MutableState>)
  ) => {
    const next =
      typeof partial === "function" ? partial(state) : (partial ?? {});
    state = { ...state, ...next };
  };
  const get = () => state as never;
  const actions = createGenerationActions({
    set: set as never,
    get: get as never,
  });
  return {
    actions,
    getState: () => state,
  };
}

describe("generation actions artifact history merge", () => {
  const mockedProjectSpaceApi = projectSpaceApi as jest.Mocked<
    typeof projectSpaceApi
  >;
  const mockedGenerateApi = generateApi as jest.Mocked<typeof generateApi>;

  beforeEach(() => {
    mockedProjectSpaceApi.getArtifacts.mockReset();
    mockedGenerateApi.getSessionSnapshot.mockReset();
  });

  it("keeps superseded artifacts visible by merging session snapshot history", async () => {
    mockedProjectSpaceApi.getArtifacts.mockResolvedValueOnce({
      artifacts: [
        {
          id: "art-new",
          projectId: "proj-1",
          sessionId: "sess-1",
          type: "docx",
          visibility: "private",
          metadata: { title: "新版教案", tool_type: "studio_card:word_document" },
          createdAt: "2026-04-20T10:20:00.000Z",
          updatedAt: "2026-04-20T10:20:00.000Z",
        },
      ],
    } as never);
    mockedGenerateApi.getSessionSnapshot.mockResolvedValueOnce({
      data: {
        session_artifacts: [
          {
            artifact_id: "art-old",
            type: "docx",
            title: "旧版教案",
            created_at: "2026-04-20T10:00:00.000Z",
            updated_at: "2026-04-20T10:00:00.000Z",
            superseded_by_artifact_id: "art-new",
            metadata: { tool_type: "studio_card:word_document" },
          },
          {
            artifact_id: "art-new",
            type: "docx",
            title: "新版教案",
            created_at: "2026-04-20T10:20:00.000Z",
            updated_at: "2026-04-20T10:20:00.000Z",
            metadata: { tool_type: "studio_card:word_document" },
          },
        ],
      },
    } as never);

    const { actions, getState } = createHarness();
    await actions.fetchArtifactHistory("proj-1", "sess-1");

    const wordHistory = getState().artifactHistoryByTool.word as Array<{
      artifactId: string;
    }>;
    expect(wordHistory.map((item) => item.artifactId)).toEqual([
      "art-new",
      "art-old",
    ]);
    expect(getState().currentSessionArtifacts.map((item) => item.artifactId)).toEqual(
      ["art-new", "art-old"]
    );
  });

  it("deduplicates artifacts by id and prefers project artifact payload", async () => {
    mockedProjectSpaceApi.getArtifacts.mockResolvedValueOnce({
      artifacts: [
        {
          id: "art-1",
          projectId: "proj-1",
          sessionId: "sess-1",
          type: "docx",
          visibility: "private",
          metadata: { title: "项目侧标题", tool_type: "studio_card:word_document" },
          createdAt: "2026-04-20T10:20:00.000Z",
          updatedAt: "2026-04-20T10:20:00.000Z",
        },
      ],
    } as never);
    mockedGenerateApi.getSessionSnapshot.mockResolvedValueOnce({
      data: {
        session_artifacts: [
          {
            artifact_id: "art-1",
            type: "docx",
            title: "快照标题",
            created_at: "2026-04-20T10:20:00.000Z",
            updated_at: "2026-04-20T10:20:00.000Z",
            metadata: { tool_type: "studio_card:word_document" },
          },
        ],
      },
    } as never);

    const { actions, getState } = createHarness();
    await actions.fetchArtifactHistory("proj-1", "sess-1");

    const wordHistory = getState().artifactHistoryByTool.word as Array<{
      artifactId: string;
      title: string;
    }>;
    expect(wordHistory).toHaveLength(1);
    expect(wordHistory[0]?.artifactId).toBe("art-1");
    expect(wordHistory[0]?.title).toBe("项目侧标题");
  });
});

