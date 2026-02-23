/**
 * Authentication API
 */

import { request } from "./client";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  user: {
    id: string;
    email: string;
    username: string;
  };
}

export const authApi = {
  async login(data: LoginRequest): Promise<AuthResponse> {
    return request("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
      requireAuth: false,
    });
  },

  async register(data: RegisterRequest): Promise<AuthResponse> {
    return request("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
      requireAuth: false,
    });
  },

  async getCurrentUser(): Promise<any> {
    return request("/auth/me", {
      method: "GET",
    });
  },
};
