/**
 * Authentication API
 *
 * 基于 OpenAPI 契约的认证 API 封装
 * 支持 Mock 模式用于前端独立开发
 */

import { request } from "./client";
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

const MOCK_MODE = process.env.NEXT_PUBLIC_MOCK === "true";

const mockUsers: UserInfo[] = [
  {
    id: "user-1",
    email: "test@example.com",
    username: "testuser",
    fullName: "Test User",
    createdAt: new Date().toISOString(),
  },
];

const mockTokens: Record<string, string> = {
  "test@example.com": "mock-jwt-token-user-1",
};

const mockRefreshTokens: Record<string, string> = {
  "test@example.com": "mock-refresh-token-user-1",
};

export const authApi = {
  async login(data: LoginRequest): Promise<AuthResponse> {
    if (MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const token = mockTokens[data.email] || `mock-jwt-token-${Date.now()}`;
      const refreshToken =
        mockRefreshTokens[data.email] || `mock-refresh-token-${Date.now()}`;
      const user = mockUsers.find((u) => u.email === data.email) || {
        id: `user-${Date.now()}`,
        email: data.email,
        username: data.email.split("@")[0],
        createdAt: new Date().toISOString(),
      };
      return {
        success: true,
        data: {
          access_token: token,
          refresh_token: refreshToken,
          expires_in: 3600,
          user,
        },
        message: "登录成功",
      };
    }

    return request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
      requireAuth: false,
    });
  },

  async register(data: RegisterRequest): Promise<AuthResponse> {
    if (MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const existingUser = mockUsers.find((u) => u.email === data.email);
      if (existingUser) {
        throw new Error("用户已存在");
      }
      const newUser: UserInfo = {
        id: `user-${Date.now()}`,
        email: data.email,
        username: data.username,
        fullName: data.fullName,
        createdAt: new Date().toISOString(),
      };
      mockUsers.push(newUser);
      const token = `mock-jwt-token-${Date.now()}`;
      const refreshToken = `mock-refresh-token-${Date.now()}`;
      mockTokens[data.email] = token;
      mockRefreshTokens[data.email] = refreshToken;
      return {
        success: true,
        data: {
          access_token: token,
          refresh_token: refreshToken,
          expires_in: 3600,
          user: newUser,
        },
        message: "注册成功",
      };
    }

    return request<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
      requireAuth: false,
    });
  },

  async getCurrentUser(): Promise<components["schemas"]["UserInfoResponse"]> {
    if (MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return {
        success: true,
        data: {
          user: mockUsers[0],
        },
        message: "获取成功",
      };
    }

    return request<components["schemas"]["UserInfoResponse"]>("/auth/me", {
      method: "GET",
    });
  },

  async logout(): Promise<{ success: boolean; message: string }> {
    if (MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return {
        success: true,
        message: "退出登录成功",
      };
    }

    return request<{ success: boolean; message: string }>("/auth/logout", {
      method: "POST",
    });
  },

  async refreshToken(data: { refreshToken: string }): Promise<AuthResponse> {
    if (MOCK_MODE) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const token = `mock-jwt-token-${Date.now()}`;
      const refreshToken = `mock-refresh-token-${Date.now()}`;
      return {
        success: true,
        data: {
          access_token: token,
          refresh_token: refreshToken,
          expires_in: 3600,
          user: mockUsers[0],
        },
        message: "刷新成功",
      };
    }

    return request<AuthResponse>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token: data.refreshToken }),
      requireAuth: false,
    });
  },
};
