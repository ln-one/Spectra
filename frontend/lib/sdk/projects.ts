import { apiFetch, sdkClient, toApiError, unwrap, withIdempotency } from "./client";
import type { components } from "./types";

export type Project = components["schemas"]["Project"];
export type ProjectRequest = components["schemas"]["ProjectRequestTarget"];
export type CreateProjectRequest =
  components["schemas"]["ProjectCreateRequestTarget"];
export type GetProjectsResponse = components["schemas"]["GetProjectsResponse"];
export type ProjectResponse = components["schemas"]["ProjectResponseTarget"];
type ProjectFilesResponse = components["schemas"]["GetFilesResponse"];
export type ProjectStatisticsResponse =
  components["schemas"]["ProjectStatisticsResponse"];
export type ArtifactBackedSource = {
  id: string;
  source_kind?: string;
  artifact_id: string;
  artifact_type: string;
  tool_type: string;
  title: string;
  surface_kind?: string | null;
  filename?: string | null;
  session_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};
export type ProjectArtifactSourcesResponse = {
  success: boolean;
  data?: { sources?: ArtifactBackedSource[] };
  message?: string;
};
export type ProjectArtifactSourceResponse = {
  success: boolean;
  data?: { source?: ArtifactBackedSource | null };
  message?: string;
};

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

  async createProject(data: CreateProjectRequest): Promise<ProjectResponse> {
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

  async getArtifactSources(
    projectId: string
  ): Promise<ProjectArtifactSourcesResponse> {
    const response = await apiFetch(
      `/api/v1/projects/${encodeURIComponent(projectId)}/artifact-sources`
    );
    const payload = (await response.json()) as ProjectArtifactSourcesResponse;
    if (!response.ok) {
      throw toApiError(payload, response.status);
    }
    return payload;
  },

  async createArtifactSource(
    projectId: string,
    data: { artifact_id: string; surface_kind?: string }
  ): Promise<ProjectArtifactSourceResponse> {
    const headers = withIdempotency({}, true);
    const response = await apiFetch(
      `/api/v1/projects/${encodeURIComponent(projectId)}/artifact-sources`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify(data),
      }
    );
    const payload = (await response.json()) as ProjectArtifactSourceResponse;
    if (!response.ok) {
      throw toApiError(payload, response.status);
    }
    return payload;
  },

  async deleteArtifactSource(
    projectId: string,
    sourceId: string
  ): Promise<{ success: boolean; message?: string }> {
    const response = await apiFetch(
      `/api/v1/projects/${encodeURIComponent(projectId)}/artifact-sources/${encodeURIComponent(sourceId)}`,
      {
        method: "DELETE",
      }
    );
    const payload = (await response.json()) as {
      success: boolean;
      message?: string;
    };
    if (!response.ok) {
      throw toApiError(payload, response.status);
    }
    return payload;
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
