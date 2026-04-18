import { createFileActions } from "@/stores/project-store/file-actions";
import { filesApi, ragApi } from "@/lib/sdk";

jest.mock("@/hooks/use-toast", () => ({
  toast: jest.fn(),
}));

jest.mock("@/lib/sdk", () => ({
  filesApi: {
    getProjectFiles: jest.fn(),
    uploadFile: jest.fn(),
    deleteFile: jest.fn(),
  },
  ragApi: {
    getSourceDetail: jest.fn(),
    indexFile: jest.fn(),
  },
}));

type MutableStoreState = {
  project: { id: string } | null;
  files: unknown[];
  selectedFileIds: string[];
  uploadingCount: number;
  isUploading: boolean;
  activeSourceDetail: unknown;
  fetchFiles: (projectId: string) => Promise<void>;
};

function createStoreHarness() {
  let state: MutableStoreState = {
    project: { id: "proj-1" },
    files: [],
    selectedFileIds: [],
    uploadingCount: 0,
    isUploading: false,
    activeSourceDetail: null,
    fetchFiles: async () => undefined,
  };

  const set = (
    partial:
      | Partial<MutableStoreState>
      | ((current: MutableStoreState) => Partial<MutableStoreState>)
  ) => {
    const next =
      typeof partial === "function" ? partial(state) : (partial ?? {});
    state = { ...state, ...next };
  };
  const get = () => state as never;

  const actions = createFileActions({
    set: set as never,
    get: get as never,
  });
  state = {
    ...state,
    ...(actions as unknown as Partial<MutableStoreState>),
  };
  return { actions };
}

describe("project store source lazy repair", () => {
  const mockedGetSourceDetail = ragApi.getSourceDetail as jest.MockedFunction<
    typeof ragApi.getSourceDetail
  >;
  const mockedIndexFile = ragApi.indexFile as jest.MockedFunction<
    typeof ragApi.indexFile
  >;
  const mockedGetProjectFiles =
    filesApi.getProjectFiles as jest.MockedFunction<typeof filesApi.getProjectFiles>;

  beforeEach(() => {
    mockedGetSourceDetail.mockReset();
    mockedIndexFile.mockReset();
    mockedGetProjectFiles.mockReset();
    mockedGetProjectFiles.mockResolvedValue({
      data: { files: [] },
    } as never);
  });

  it("dedupes lazy repair trigger for the same file while a repair is inflight", async () => {
    const { actions } = createStoreHarness();
    const pendingRepair = new Promise<never>(() => undefined);
    mockedIndexFile.mockReturnValueOnce(pendingRepair as never);

    mockedGetSourceDetail.mockResolvedValue({
      data: {
        chunk_id: "chunk-1",
        content: "</td><td>1</td>",
        file_info: {
          id: "file-1",
          parse_result: {},
        },
      },
    } as never);

    await actions.focusSourceByChunk("chunk-1", "proj-1");
    await actions.focusSourceByChunk("chunk-1", "proj-1");

    expect(mockedIndexFile).toHaveBeenCalledTimes(1);
    expect(mockedIndexFile).toHaveBeenCalledWith({ file_id: "file-1" });
  });
});
