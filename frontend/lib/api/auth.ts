/**
 * Authentication API
 *
 * 基于 OpenAPI 契约的认证 API 封装
 * 支持 Mock 模式用于前端独立开发
 */

import { request, ENABLE_MOCK } from "./client";
import type { components } from "../types/api";

export type LoginRequest = components["schemas"]["LoginRequest"];
export type RegisterRequest = components["schemas"]["RegisterRequest"];
export type UserInfo = components["schemas"]["UserInfo"];

interface AuthResponseData {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: UserInfo;
}

export interface AuthResponse {
  success: boolean;
  data: AuthResponseData;
  message: string;
}

// Mock 数据（仅当 ENABLE_MOCK 为 true 时使用）
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _mockUsers: UserInfo[] = [];

export const authApi = {
  async login(data: LoginRequest): Promise<AuthResponse> {
    if (ENABLE_MOCK) {
      // TODO: 临时调试用，生产环境应删除此分支
      await new Promise((resolve) => setTimeout(resolve, 500));
      return {
        success: true,
        data: {
          access_token: "mock-jwt-token",
          refresh_token: "mock-refresh-token",
          expires_in: 3600,
        },
        message: "Mock 登录成功",
      };
    }

    return request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
      requireAuth: false,
    });
  },

  async register(data: RegisterRequest): Promise<AuthResponse> {
    if (ENABLE_MOCK) {
      // TODO: 临时调试用，生产环境应删除此分支
      await new Promise((resolve) => setTimeout(resolve, 500));
      return {
        success: true,
        data: {
          access_token: "mock-jwt-token",
          refresh_token: "mock-refresh-token",
          expires_in: 3600,
        },
        message: "Mock 注册成功",
      };
    }

    return request<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
      requireAuth: false,
    });
  },

  async getCurrentUser(): Promise<components["schemas"]["UserInfoResponse"]> {
    if (ENABLE_MOCK) {
      // TODO: 临时调试用，生产环境应删除此分支
      await new Promise((resolve) => setTimeout(resolve, 300));
      return {
        success: true,
        data: {
          user: {
            id: "mock-user-id",
            email: "mock@example.com",
            username: "mockuser",
            fullName: "Mock User",
            createdAt: new Date().toISOString(),
          },
        },
        message: "Mock 获取成功",
      };
    }

    return request<components["schemas"]["UserInfoResponse"]>("/auth/me", {
      method: "GET",
    });
  },

  async logout(): Promise<{ success: boolean; message: string }> {
    if (ENABLE_MOCK) {
      // TODO: 临时调试用，生产环境应删除此分支
      await new Promise((resolve) => setTimeout(resolve, 200));
      return {
        success: true,
        message: "Mock 退出登录成功",
      };
    }

    return request<{ success: boolean; message: string }>("/auth/logout", {
      method: "POST",
    });
  },

  async refreshToken(data: { refreshToken: string }): Promise<AuthResponse> {
    if (ENABLE_MOCK) {
      // TODO: 临时调试用，生产环境应删除此分支
      await new Promise((resolve) => setTimeout(resolve, 300));
      return {
        success: true,
        data: {
          access_token: "mock-jwt-token",
          refresh_token: "mock-refresh-token",
          expires_in: 3600,
        },
        message: "Mock 刷新成功",
      };
    }

    return request<AuthResponse>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token: data.refreshToken }),
      requireAuth: false,
    });
  },
};
