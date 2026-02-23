/**
 * Projects API
 */

import { request } from "./client";

export interface Project {
  id: string;
  name: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectRequest {
  name: string;
  description: string;
  grade_level?: string;
}

export const projectsApi = {
  async getProjects(): Promise<Project[]> {
    return request("/projects", {
      method: "GET",
    });
  },

  async getProject(id: string): Promise<Project> {
    return request(`/projects/${id}`, {
      method: "GET",
    });
  },

  async createProject(data: CreateProjectRequest): Promise<Project> {
    return request("/projects", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
};
