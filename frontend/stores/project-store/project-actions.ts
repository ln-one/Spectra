import { projectsApi } from "@/lib/sdk";
import { createApiError, getErrorMessage } from "@/lib/sdk/errors";
import { toast } from "@/hooks/use-toast";
import {
  initialState,
  type ProjectStoreContext,
  type ProjectState,
} from "./types";

export function createProjectActions({
  set,
  get,
}: ProjectStoreContext): Pick<
  ProjectState,
  "fetchProject" | "updateProjectName" | "reset"
> {
  return {
    fetchProject: async (
      projectId: string,
      options?: { silent?: boolean }
    ) => {
      const silent = Boolean(options?.silent);
      if (!silent) {
        set({ isLoading: true, error: null });
      }
      try {
        const response = await projectsApi.getProject(projectId);
        set({ project: response?.data?.project ?? null });
      } catch (error) {
        const message = getErrorMessage(error);
        if (!silent) {
          set({
            error: createApiError({ code: "FETCH_PROJECT_FAILED", message }),
          });
          toast({
            title: "获取项目失败",
            description: message,
            variant: "destructive",
          });
        }
      } finally {
        if (!silent) {
          set({ isLoading: false });
        }
      }
    },

    updateProjectName: async (name: string) => {
      const { project } = get();
      if (!project) return;

      const oldName = project.name;
      set((state) => ({
        project: state.project ? { ...state.project, name } : null,
      }));

      try {
        await projectsApi.updateProject(project.id, {
          name,
          description: project.description,
          grade_level: project.grade_level,
        });
      } catch (error) {
        const message = getErrorMessage(error);
        set((state) => ({
          project: state.project ? { ...state.project, name: oldName } : null,
          error: createApiError({ code: "UPDATE_PROJECT_FAILED", message }),
        }));
        toast({
          title: "更新项目名称失败",
          description: message,
          variant: "destructive",
        });
      }
    },

    reset: () => {
      set(initialState);
    },
  };
}
