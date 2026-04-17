import type { components } from "./types";
import { sdkClient, unwrap, withIdempotency } from "./client";

export type LoginRequest = components["schemas"]["LoginRequest"];
export type RegisterRequest = components["schemas"]["RegisterRequest"];
export type UserInfo = components["schemas"]["UserInfo"];

interface AuthResponseData {
  user?: UserInfo;
}

export interface AuthResponse {
  success: boolean;
  data: AuthResponseData;
  message: string;
}

export const authApi = {
  async login(data: LoginRequest): Promise<AuthResponse> {
    const result = await sdkClient.POST("/api/v1/auth/login", {
      body: data,
      headers: withIdempotency({}, false),
    });
    return unwrap<AuthResponse>(result);
  },

  async register(data: RegisterRequest): Promise<AuthResponse> {
    const result = await sdkClient.POST("/api/v1/auth/register", {
      body: data,
      headers: withIdempotency({}, false),
    });
    return unwrap<AuthResponse>(result);
  },

  async getCurrentUser(): Promise<components["schemas"]["UserInfoResponse"]> {
    const result = await sdkClient.GET("/api/v1/auth/me");
    return unwrap<components["schemas"]["UserInfoResponse"]>(result);
  },

  async logout(): Promise<{ success: boolean; message: string }> {
    const result = await sdkClient.POST("/api/v1/auth/logout");
    return unwrap<{ success: boolean; message: string }>(result);
  },
};
