/**
 * Authentication Utilities
 *
 * 认证工具模块 - 提供 Token 存储和认证状态检查
 */

import { authApi, type UserInfo } from "./api/auth";

export interface User {
  id: string;
  email: string;
  username: string;
  fullName?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface RegisterRequest {
  email: string;
  password: string;
  username: string;
  fullName?: string;
}

export const TokenStorage = {
  setAccessToken(token: string): void {
    if (typeof window !== "undefined") {
      localStorage.setItem("access_token", token);
    }
  },

  getAccessToken(): string | null {
    if (typeof window !== "undefined") {
      return localStorage.getItem("access_token");
    }
    return null;
  },

  clearTokens(): void {
    if (typeof window !== "undefined") {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
    }
  },

  isAuthenticated(): boolean {
    return !!this.getAccessToken();
  },
};

function toUser(userInfo: UserInfo): User {
  return {
    id: userInfo.id,
    email: userInfo.email,
    username: userInfo.username,
    fullName: userInfo.fullName,
    createdAt: userInfo.createdAt,
  };
}

export const authService = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await authApi.login({ email, password });
    const userData = response.data.user;
    if (!userData) {
      throw new Error("登录失败：用户信息不存在");
    }
    const user = toUser(userData);
    const token = response.data.access_token;
    return {
      access_token: token || "",
      token_type: "Bearer",
      user,
    };
  },

  async register(data: RegisterRequest): Promise<LoginResponse> {
    const response = await authApi.register(data);
    const userData = response.data.user;
    if (!userData) {
      throw new Error("注册失败：用户信息不存在");
    }
    const user = toUser(userData);
    const token = response.data.access_token;
    return {
      access_token: token || "",
      token_type: "Bearer",
      user,
    };
  },

  async getCurrentUser(): Promise<User> {
    const response = await authApi.getCurrentUser();
    const userData = response.data.user;
    if (!userData) {
      throw new Error("获取用户信息失败");
    }
    return toUser(userData);
  },

  async logout(): Promise<void> {
    TokenStorage.clearTokens();
  },
};
