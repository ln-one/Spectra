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

  async refreshToken(data: { refreshToken: string }): Promise<AuthResponse> {
    return request<AuthResponse>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token: data.refreshToken }),
      requireAuth: false,
    });
  },
};
