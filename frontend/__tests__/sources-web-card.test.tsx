import { render, screen } from "@testing-library/react";
import { SourcesPanel } from "@/components/project/features/sources/SourcesPanel";
import { useProjectStore } from "@/stores/projectStore";

jest.mock("@/stores/projectStore", () => ({
  ...jest.requireActual("@/stores/projectStore"),
  useProjectStore: jest.fn(),
}));

describe("SourcesPanel web card", () => {
  const mockedStore = useProjectStore as unknown as jest.Mock;

  beforeAll(() => {
    class ResizeObserverMock {
      observe() {
        return undefined;
      }
      disconnect() {
        return undefined;
      }
    }

    Object.defineProperty(globalThis, "ResizeObserver", {
      writable: true,
      configurable: true,
      value: ResizeObserverMock,
    });
  });

  beforeEach(() => {
    mockedStore.mockReturnValue({
      files: [],
      selectedFileIds: [],
      isUploading: false,
      uploadFile: jest.fn(),
      fetchFiles: jest.fn(),
      deleteFile: jest.fn(),
      toggleFileSelection: jest.fn(),
      activeSourceDetail: null,
      clearActiveSource: jest.fn(),
    });
  });

  it("renders default web source card when there are no files", () => {
    render(<SourcesPanel projectId="proj_1" />);

    expect(screen.getByTitle(/网页检索（即将上线）/)).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText(/网页检索并入库/)
    ).not.toBeInTheDocument();
  });

  it("renders referenced library card with project name", () => {
    render(
      <SourcesPanel
        projectId="proj_1"
        referencedLibraries={[
          {
            id: "ref_1",
            project_id: "proj_1",
            target_project_id: "lib_proj_id",
            target_project_name: "数学知识库",
            relation_type: "base",
            mode: "follow",
            status: "active",
            created_at: "2026-04-03T00:00:00.000Z",
            updated_at: "2026-04-03T00:00:00.000Z",
          },
        ]}
      />
    );

    expect(screen.getByTitle(/数学知识库/)).toBeInTheDocument();
    expect(screen.queryByText("lib_proj_id.library")).not.toBeInTheDocument();
  });
});
