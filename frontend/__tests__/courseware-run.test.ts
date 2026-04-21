import { studioCardsApi } from "@/lib/sdk/studio-cards";
import {
  startCoursewarePptRun,
  type CoursewareGenerationConfig,
} from "@/stores/project-store/courseware-run";

jest.mock("@/lib/sdk/studio-cards", () => ({
  studioCardsApi: {
    execute: jest.fn(),
  },
}));

describe("courseware run source scope", () => {
  const mockedExecute = studioCardsApi.execute as jest.MockedFunction<
    typeof studioCardsApi.execute
  >;

  const baseConfig: CoursewareGenerationConfig = {
    prompt: "导论课 PPT",
    pageCount: 8,
    visualStyle: "free",
    layoutMode: "smart",
    templateId: null,
    visualPolicy: "auto",
  };

  beforeEach(() => {
    mockedExecute.mockReset();
    mockedExecute.mockResolvedValue({
      data: {
        execution_result: {
          session: { session_id: "session-1" },
          run: { run_id: "run-1" },
        },
      },
    } as never);
  });

  it("does not send source restrictions when no sources are explicitly selected", async () => {
    await startCoursewarePptRun({
      projectId: "proj-1",
      clientSessionId: "session-1",
      config: baseConfig,
    });

    expect(mockedExecute).toHaveBeenCalledWith(
      "courseware_ppt",
      expect.objectContaining({
        project_id: "proj-1",
        client_session_id: "session-1",
        selected_file_ids: undefined,
        rag_source_ids: undefined,
        selected_library_ids: undefined,
      })
    );
  });

  it("sends only explicit file and library restrictions", async () => {
    await startCoursewarePptRun({
      projectId: "proj-1",
      clientSessionId: "session-1",
      ragSourceIds: ["file-1"],
      selectedLibraryIds: ["lib-1"],
      config: baseConfig,
    });

    expect(mockedExecute).toHaveBeenCalledWith(
      "courseware_ppt",
      expect.objectContaining({
        selected_file_ids: ["file-1"],
        rag_source_ids: ["file-1"],
        selected_library_ids: ["lib-1"],
      })
    );
  });
});
