/**
 * Projects API
 *
 * 基于 OpenAPI 契约的项目 API 封装
 * 支持 Mock 模式用于前端独立开发
 */

import { request, ENABLE_MOCK } from "./client";
import type { components } from "../types/api";

export type Project = components["schemas"]["Project"];
export type ProjectRequest = components["schemas"]["ProjectRequest"];
export type GetProjectsResponse = components["schemas"]["GetProjectsResponse"];
export type ProjectResponse = components["schemas"]["ProjectResponse"];

// Mock 数据（仅当 ENABLE_MOCK 为 true 时使用）
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _mockProjects: Project[] = [];

export const projectsApi = {
  async getProjects(params?: {
    page?: number;
    limit?: number;
  }): Promise<GetProjectsResponse> {
    if (ENABLE_MOCK) {
      // TODO: 临时调试用，生产环境应删除此分支
      await new Promise((resolve) => setTimeout(resolve, 300));
      return {
        success: true,
        data: {
          projects: [],
          total: 0,
          page: params?.page || 1,
          limit: params?.limit || 20,
        },
        message: "Mock 获取成功",
      };
    }

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
    if (ENABLE_MOCK) {
      // TODO: 临时调试用，生产环境应删除此分支
      await new Promise((resolve) => setTimeout(resolve, 300));
      return {
        success: true,
        data: {
          project: {
            id: projectId,
            name: "Mock Project",
            description: "Mock description",
            grade_level: "初中",
            status: "draft",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        },
        message: "Mock 获取成功",
      };
    }

    return request<ProjectResponse>(`/projects/${projectId}`, {
      method: "GET",
    });
  },

  async createProject(data: ProjectRequest): Promise<ProjectResponse> {
    if (ENABLE_MOCK) {
      // TODO: 临时调试用，生产环境应删除此分支
      await new Promise((resolve) => setTimeout(resolve, 500));
      return {
        success: true,
        data: {
          project: {
            id: `mock-proj-${Date.now()}`,
            name: data.name,
            description: data.description,
            grade_level: data.grade_level,
            status: "draft",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        },
        message: "Mock 创建成功",
      };
    }

    return request<ProjectResponse>("/projects", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateProject(
    projectId: string,
    data: ProjectRequest
  ): Promise<ProjectResponse> {
    if (ENABLE_MOCK) {
      // TODO: 临时调试用，生产环境应删除此分支
      await new Promise((resolve) => setTimeout(resolve, 500));
      return {
        success: true,
        data: {
          project: {
            id: projectId,
            name: data.name,
            description: data.description,
            grade_level: data.grade_level,
            status: "draft",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        },
        message: "Mock 更新成功",
      };
    }

    return request<ProjectResponse>(`/projects/${projectId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  async deleteProject(
    projectId: string
  ): Promise<{ success: boolean; message: string }> {
    if (ENABLE_MOCK) {
      // TODO: 临时调试用，生产环境应删除此分支
      await new Promise((resolve) => setTimeout(resolve, 300));
      return {
        success: true,
        message: "Mock 删除成功",
      };
    }

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
    if (ENABLE_MOCK) {
      // TODO: 临时调试用，生产环境应删除此分支
      await new Promise((resolve) => setTimeout(resolve, 300));
      return {
        success: true,
        data: {
          projects: [],
          total: 0,
          page: params.page || 1,
          limit: params.limit || 20,
        },
        message: "Mock 搜索成功",
      };
    }

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
