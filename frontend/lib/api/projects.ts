/**
 * Projects API
 *
 * 基于 OpenAPI 契约的项目 API 封装
 */

import { request } from "./client";
import type { components } from "../types/api";

export type Project = components["schemas"]["Project"];
export type ProjectRequest = components["schemas"]["ProjectRequest"];
export type GetProjectsResponse = components["schemas"]["GetProjectsResponse"];
export type ProjectResponse = components["schemas"]["ProjectResponse"];

export const projectsApi = {
  async getProjects(params?: {
    page?: number;
    limit?: number;
  }): Promise<GetProjectsResponse> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set("page", String(params.page));
    if (params?.limit) queryParams.set("limit", String(params.limit));
    const query = queryParams.toString();

    return request<GetProjectsResponse>(
      `/projects${query ? `?${query}` : ""}`,
      {
        method: "GET",
      }
    );
  },

  async getProject(projectId: string): Promise<ProjectResponse> {
    return request<ProjectResponse>(`/projects/${projectId}`, {
      method: "GET",
    });
  },

  async createProject(data: ProjectRequest): Promise<ProjectResponse> {
    return request<ProjectResponse>("/projects", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateProject(
    projectId: string,
    data: ProjectRequest
  ): Promise<ProjectResponse> {
    return request<ProjectResponse>(`/projects/${projectId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  async deleteProject(
    projectId: string
  ): Promise<{ success: boolean; message: string }> {
    return request(`/projects/${projectId}`, {
      method: "DELETE",
    });
  },

  async searchProjects(params: {
    q: string;
    status?: "draft" | "in_progress" | "completed";
    page?: number;
    limit?: number;
  }): Promise<GetProjectsResponse> {
    const queryParams = new URLSearchParams();
    queryParams.set("q", params.q);
    if (params.status) queryParams.set("status", params.status);
    if (params.page) queryParams.set("page", String(params.page));
    if (params.limit) queryParams.set("limit", String(params.limit));

    return request<GetProjectsResponse>(
      `/projects/search?${queryParams.toString()}`,
      {
        method: "GET",
      }
    );
  },
};
