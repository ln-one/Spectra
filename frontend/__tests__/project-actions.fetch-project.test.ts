import { createProjectActions } from "@/stores/project-store/project-actions";
import { projectsApi } from "@/lib/sdk";

jest.mock("@/hooks/use-toast", () => ({
  toast: jest.fn(),
}));

jest.mock("@/lib/sdk", () => ({
  projectsApi: {
    getProject: jest.fn(),
    updateProject: jest.fn(),
  },
}));

type MutableStoreState = {
  project: {
    id: string;
    name: string;
    description?: string | null;
    grade_level?: string | null;
    name_source?: string;
  } | null;
  isLoading: boolean;
  error: unknown;
};

function createStoreHarness(initialProject: MutableStoreState["project"]) {
  let state: MutableStoreState = {
    project: initialProject,
    isLoading: false,
    error: null,
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

  const actions = createProjectActions({
    set: set as never,
    get: (() => state) as never,
  });

  return {
    actions,
    getState: () => state,
  };
}

describe("project actions fetchProject", () => {
  const mockedGetProject = projectsApi.getProject as jest.MockedFunction<
    typeof projectsApi.getProject
  >;

  beforeEach(() => {
    mockedGetProject.mockReset();
  });

  it("does not replace project state during silent polling when payload is unchanged", async () => {
    const initialProject = {
      id: "proj-1",
      name: "Project One",
      description: "desc",
      grade_level: "grade-1",
      name_source: "default",
    };
    const { actions, getState } = createStoreHarness(initialProject);

    mockedGetProject.mockResolvedValue({
      data: { project: { ...initialProject } },
    } as never);

    const previousProjectRef = getState().project;
    await actions.fetchProject("proj-1", { silent: true });

    expect(getState().project).toBe(previousProjectRef);
  });
});
