/**
 * Authentication API
 *
 * 基于 OpenAPI 契约的认证 API 封装
 */

import { request } from "./client";
import type { components } from "../types/api";

export type LoginRequest = components["schemas"]["LoginRequest"];
export type RegisterRequest = components["schemas"]["RegisterRequest"];
export type UserInfo = components["schemas"]["UserInfo"];

// 成功的认证响应数据（token 字段为必需）
export interface AuthSuccessData {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: UserInfo;
}

// 失败的认证响应数据（可能没有 token）
export interface AuthFailureData {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: UserInfo;
}

// 完整的认证响应类型
export interface AuthResponse {
  success: boolean;
  data: AuthSuccessData | AuthFailureData;
  message: string;
}

export const authApi = {
  async login(data: LoginRequest): Promise<AuthResponse> {
    return request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
      requireAuth: false,
    });
  },

  async register(data: RegisterRequest): Promise<AuthResponse> {
    return request<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
      requireAuth: false,
    });
  },

  async getCurrentUser(): Promise<components["schemas"]["UserInfoResponse"]> {
    return request<components["schemas"]["UserInfoResponse"]>("/auth/me", {
      method: "GET",
    });
  },

  async logout(): Promise<{ success: boolean; message: string }> {
    return request<{ success: boolean; message: string }>("/auth/logout", {
      method: "POST",
    });
  },

  // 注意：函数参数使用驼峰命名 (refreshToken)，API 请求使用下划线命名 (refresh_token)
  // 这是符合 JavaScript 命名规范的前端适配
  async refreshToken(data: { refreshToken: string }): Promise<AuthResponse> {
    return request<AuthResponse>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token: data.refreshToken }),
      requireAuth: false,
    });
  },
};
