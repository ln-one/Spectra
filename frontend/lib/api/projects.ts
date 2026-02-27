/**
 * Projects API
 *
 * 基于 OpenAPI 契约的项目 API 封装
 * 支持 Mock 模式用于前端独立开发
 */

import { request } from "./client";
import type { components } from "../types/api";

export type Project = components["schemas"]["Project"];
export type ProjectRequest = components["schemas"]["ProjectRequest"];
export type GetProjectsResponse = components["schemas"]["GetProjectsResponse"];
export type ProjectResponse = components["schemas"]["ProjectResponse"];

const MOCK_MODE = process.env.NEXT_PUBLIC_MOCK === "true";

const mockProjects: Project[] = [
  {
    id: "proj-1",
    name: "初中数学 - 二次函数",
    description: "二次函数的图像与性质教学课件",
    grade_level: "初中",
    status: "in_progress",
    created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "proj-2",
    name: "高中物理 - 力学基础",
    description: "牛顿运动定律与力学应用",
    grade_level: "高中",
    status: "draft",
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "proj-3",
    name: "小学英语 - 动物主题",
    description: "动物单词与对话练习",
    grade_level: "小学",
    status: "completed",
    created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

export const projectsApi = {
  async getProjects(params?: {
    page?: number;
    limit?: number;
  }): Promise<GetProjectsResponse> {
    if (MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const page = params?.page || 1;
      const limit = params?.limit || 20;
      const start = (page - 1) * limit;
      const end = start + limit;
      const projects = mockProjects.slice(start, end);
      return {
        success: true,
        data: {
          projects,
          total: mockProjects.length,
          page,
          limit,
        },
        message: "获取成功",
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
    if (MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const project = mockProjects.find((p) => p.id === projectId);
      if (!project) {
        throw new Error("项目不存在");
      }
      return {
        success: true,
        data: { project },
        message: "获取成功",
      };
    }

    return request<ProjectResponse>(`/projects/${projectId}`, {
      method: "GET",
    });
  },

  async createProject(data: ProjectRequest): Promise<ProjectResponse> {
    if (MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const newProject: Project = {
        id: `proj-${Date.now()}`,
        name: data.name,
        description: data.description,
        grade_level: data.grade_level,
        status: "draft",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      mockProjects.unshift(newProject);
      return {
        success: true,
        data: { project: newProject },
        message: "创建成功",
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
    if (MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const index = mockProjects.findIndex((p) => p.id === projectId);
      if (index === -1) {
        throw new Error("项目不存在");
      }
      mockProjects[index] = {
        ...mockProjects[index],
        ...data,
        updated_at: new Date().toISOString(),
      };
      return {
        success: true,
        data: { project: mockProjects[index] },
        message: "更新成功",
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
    if (MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const index = mockProjects.findIndex((p) => p.id === projectId);
      if (index === -1) {
        throw new Error("项目不存在");
      }
      mockProjects.splice(index, 1);
      return {
        success: true,
        message: "删除成功",
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
    if (MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const keyword = params.q.toLowerCase();
      const filtered = mockProjects.filter(
        (p) =>
          p.name.toLowerCase().includes(keyword) ||
          p.description?.toLowerCase().includes(keyword)
      );
      const page = params.page || 1;
      const limit = params.limit || 20;
      const start = (page - 1) * limit;
      const end = start + limit;
      const projects = filtered.slice(start, end);
      return {
        success: true,
        data: {
          projects,
          total: filtered.length,
          page,
          limit,
        },
        message: "搜索成功",
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
