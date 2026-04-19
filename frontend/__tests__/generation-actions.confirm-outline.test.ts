import { createGenerationActions } from "@/stores/project-store/generation-actions";
import { generateApi } from "@/lib/sdk";
import { ApiError } from "@/lib/sdk/errors";

jest.mock("@/hooks/use-toast", () => ({
  toast: jest.fn(),
}));

jest.mock("@/lib/sdk", () => ({
  generateApi: {
    sendCommand: jest.fn(),
    getSessionSnapshot: jest.fn(),
  },
  previewApi: {},
  projectSpaceApi: {},
}));

type MutableState = {
  generationSession: any;
  generationHistory: any[];
  activeSessionId: string | null;
  activeRunId: string | null;
  error: any;
};

function createStoreHarness(overrides: Partial<MutableState> = {}) {
  let state: MutableState = {
    generationSession: {
      session: {
        session_id: "sess-1",
        state: "AWAITING_OUTLINE_CONFIRM",
      },
      outline: {
        version: 1,
        nodes: [],
        summary: "",
      },
      current_run: {
        run_id: "run-1",
      },
    },
    generationHistory: [],
    activeSessionId: "sess-1",
    activeRunId: "run-1",
    error: null,
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

describe("generation actions confirm/update behavior", () => {
  const mockedGenerateApi = generateApi as jest.Mocked<typeof generateApi>;

  beforeEach(() => {
    mockedGenerateApi.sendCommand.mockReset();
    mockedGenerateApi.getSessionSnapshot.mockReset();
  });

  it("refreshes snapshot before updateOutline and uses latest outline version", async () => {
    const { actions } = createStoreHarness();
    mockedGenerateApi.getSessionSnapshot
      .mockResolvedValueOnce({
        data: {
          session: { session_id: "sess-1", state: "AWAITING_OUTLINE_CONFIRM" },
          outline: { version: 5, nodes: [], summary: "" },
          current_run: { run_id: "run-1" },
        },
      } as never)
      .mockResolvedValueOnce({
        data: {
          session: { session_id: "sess-1", state: "AWAITING_OUTLINE_CONFIRM" },
          outline: { version: 6, nodes: [], summary: "" },
          current_run: { run_id: "run-1" },
        },
      } as never);
    mockedGenerateApi.sendCommand.mockResolvedValue({} as never);

    await actions.updateOutline("sess-1", {
      version: 1,
      nodes: [],
      summary: "",
    } as never);

    expect(mockedGenerateApi.sendCommand).toHaveBeenCalledWith("sess-1", {
      command: {
        command_type: "UPDATE_OUTLINE",
        base_version: 5,
        outline: {
          version: 1,
          nodes: [],
          summary: "",
        },
      },
    });
  });

  it("treats confirmOutline 502 as success when refreshed state already progressed", async () => {
    const { actions, getState } = createStoreHarness();
    mockedGenerateApi.sendCommand.mockRejectedValueOnce(
      new ApiError("EXTERNAL_SERVICE_ERROR", "diego run not found", 502)
    );
    mockedGenerateApi.getSessionSnapshot.mockResolvedValueOnce({
      data: {
        session: {
          session_id: "sess-1",
          state: "GENERATING_CONTENT",
        },
        outline: { version: 6, nodes: [], summary: "" },
        current_run: { run_id: "run-1" },
      },
    } as never);

    await expect(actions.confirmOutline("sess-1")).resolves.toBeUndefined();
    expect(getState().generationSession?.session?.state).toBe(
      "GENERATING_CONTENT"
    );
  });

  it("still throws confirmOutline error on 502 when refreshed state did not progress", async () => {
    const { actions, getState } = createStoreHarness();
    mockedGenerateApi.sendCommand.mockRejectedValueOnce(
      new ApiError("EXTERNAL_SERVICE_ERROR", "diego run not found", 502)
    );
    mockedGenerateApi.getSessionSnapshot.mockResolvedValueOnce({
      data: {
        session: {
          session_id: "sess-1",
          state: "AWAITING_OUTLINE_CONFIRM",
        },
        outline: { version: 6, nodes: [], summary: "" },
        current_run: { run_id: "run-1" },
      },
    } as never);

    await expect(actions.confirmOutline("sess-1")).rejects.toBeInstanceOf(
      ApiError
    );
    expect(getState().error?.code).toBe("CONFIRM_OUTLINE_FAILED");
  });
});

