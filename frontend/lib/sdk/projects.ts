import { sdkClient, unwrap, withIdempotency } from "./client";
import type { components } from "./types";

export type Project = components["schemas"]["Project"];
export type ProjectRequest = components["schemas"]["ProjectRequestTarget"];
export type GetProjectsResponse = components["schemas"]["GetProjectsResponse"];
export type ProjectResponse = components["schemas"]["ProjectResponseTarget"];
type ProjectFilesResponse = components["schemas"]["GetFilesResponse"];
export type ProjectStatisticsResponse =
  components["schemas"]["ProjectStatisticsResponse"];

export const projectsApi = {
  async getProjects(params?: {
    page?: number;
    limit?: number;
  }): Promise<GetProjectsResponse> {
    const result = await sdkClient.GET("/api/v1/projects", {
      params: {
        query: params,
      },
    });
    return unwrap<GetProjectsResponse>(result);
  },

  async getProject(projectId: string): Promise<ProjectResponse> {
    const result = await sdkClient.GET("/api/v1/projects/{project_id}", {
      params: { path: { project_id: projectId } },
    });
    return unwrap<ProjectResponse>(result);
  },

  async createProject(data: ProjectRequest): Promise<ProjectResponse> {
    const headers = withIdempotency({}, true);
    const result = await sdkClient.POST("/api/v1/projects", {
      body: data,
      headers,
    });
    return unwrap<ProjectResponse>(result);
  },

  async updateProject(
    projectId: string,
    data: ProjectRequest
  ): Promise<ProjectResponse> {
    const headers = withIdempotency({}, true);
    const result = await sdkClient.PUT("/api/v1/projects/{project_id}", {
      params: { path: { project_id: projectId } },
      body: data,
      headers,
    });
    return unwrap<ProjectResponse>(result);
  },

  async deleteProject(
    projectId: string
  ): Promise<{ success: boolean; message: string }> {
    const result = await sdkClient.DELETE("/api/v1/projects/{project_id}", {
      params: { path: { project_id: projectId } },
    });
    return unwrap<{ success: boolean; message: string }>(result);
  },

  async getProjectStatistics(
    projectId: string
  ): Promise<ProjectStatisticsResponse> {
    const result = await sdkClient.GET(
      "/api/v1/projects/{project_id}/statistics",
      {
        params: { path: { project_id: projectId } },
      }
    );
    return unwrap<ProjectStatisticsResponse>(result);
  },

  async getProjectFiles(
    projectId: string,
    params?: { page?: number; limit?: number }
  ): Promise<ProjectFilesResponse> {
    const result = await sdkClient.GET("/api/v1/projects/{project_id}/files", {
      params: {
        path: { project_id: projectId },
        query: params,
      },
    });
    return unwrap<ProjectFilesResponse>(result);
  },

  async searchProjects(params: {
    q: string;
    status?: "draft" | "in_progress" | "completed";
    page?: number;
    limit?: number;
  }): Promise<GetProjectsResponse> {
    const result = await sdkClient.GET("/api/v1/projects/search", {
      params: { query: params },
    });
    return unwrap<GetProjectsResponse>(result);
  },
};
