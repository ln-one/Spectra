/**
 * Authentication Utilities
 *
 * 认证工具模块 - 提供 Token 存储和认证状态检查
 * 包含 TokenStorage 和 authService 两部分
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

const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const TOKEN_EXPIRY_KEY = "token_expiry";

export const TokenStorage = {
  setAccessToken(token: string, expiresIn?: number): void {
    if (typeof window === "undefined") return;

    try {
      localStorage.setItem(ACCESS_TOKEN_KEY, token);

      if (expiresIn) {
        const expiryTime = Date.now() + expiresIn * 1000;
        localStorage.setItem(TOKEN_EXPIRY_KEY, String(expiryTime));
      } else {
        localStorage.removeItem(TOKEN_EXPIRY_KEY);
      }
    } catch (error) {
      console.error("Failed to set access token:", error);
    }
  },

  getAccessToken(): string | null {
    if (typeof window === "undefined") return null;

    try {
      const expiryStr = localStorage.getItem(TOKEN_EXPIRY_KEY);
      if (expiryStr) {
        const expiryTime = parseInt(expiryStr, 10);
        if (Date.now() > expiryTime) {
          this.clearTokens();
          return null;
        }
      }
      return localStorage.getItem(ACCESS_TOKEN_KEY);
    } catch {
      return null;
    }
  },

  setRefreshToken(token: string): void {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(REFRESH_TOKEN_KEY, token);
    } catch (error) {
      console.error("Failed to set refresh token:", error);
    }
  },

  getRefreshToken(): string | null {
    if (typeof window === "undefined") return null;
    try {
      return localStorage.getItem(REFRESH_TOKEN_KEY);
    } catch {
      return null;
    }
  },

  updateToken(token: string): void {
    this.setAccessToken(token);
  },

  clearTokens(): void {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(TOKEN_EXPIRY_KEY);
    } catch (error) {
      console.error("Failed to clear tokens:", error);
    }
  },

  isAuthenticated(): boolean {
    return !!this.getAccessToken();
  },

  getTokenExpiry(): number | null {
    if (typeof window === "undefined") return null;
    const expiryStr = localStorage.getItem(TOKEN_EXPIRY_KEY);
    return expiryStr ? parseInt(expiryStr, 10) : null;
  },

  isTokenExpiringSoon(thresholdMs: number = 5 * 60 * 1000): boolean {
    const expiry = this.getTokenExpiry();
    if (!expiry) return true;
    return Date.now() + thresholdMs > expiry;
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

export interface ValidationError {
  field: string;
  message: string;
}

export interface AuthError {
  code: string;
  message: string;
}

export const authService = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const validationErrors: ValidationError[] = [];

    if (!email) {
      validationErrors.push({ field: "email", message: "邮箱不能为空" });
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      validationErrors.push({ field: "email", message: "邮箱格式不正确" });
    }

    if (!password) {
      validationErrors.push({ field: "password", message: "密码不能为空" });
    } else if (password.length < 8) {
      validationErrors.push({ field: "password", message: "密码长度至少8位" });
    }

    if (validationErrors.length > 0) {
      const error = new Error(validationErrors[0].message) as Error & {
        validationErrors: ValidationError[];
      };
      error.validationErrors = validationErrors;
      throw error;
    }

    try {
      const response = await authApi.login({ email, password });
      const userData = response.data.user;
      if (!userData) {
        throw new Error("登录失败：用户信息不存在");
      }

      const user = toUser(userData);
      const token = response.data.access_token;
      const refreshToken = response.data.refresh_token;
      const expiresIn = response.data.expires_in;

      if (token) {
        TokenStorage.setAccessToken(token, expiresIn);
      }
      if (refreshToken) {
        TokenStorage.setRefreshToken(refreshToken);
      }

      return {
        access_token: token || "",
        token_type: "Bearer",
        user,
      };
    } catch (error) {
      if (
        (error as Error & { validationErrors?: ValidationError[] })
          .validationErrors
      ) {
        throw error;
      }
      const authError = new Error("登录失败，请检查邮箱和密码") as Error &
        AuthError;
      authError.code = "LOGIN_FAILED";
      throw authError;
    }
  },

  async register(data: RegisterRequest): Promise<LoginResponse> {
    const validationErrors: ValidationError[] = [];

    if (!data.email) {
      validationErrors.push({ field: "email", message: "邮箱不能为空" });
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      validationErrors.push({ field: "email", message: "邮箱格式不正确" });
    }

    if (!data.password) {
      validationErrors.push({ field: "password", message: "密码不能为空" });
    } else if (data.password.length < 8) {
      validationErrors.push({ field: "password", message: "密码长度至少8位" });
    }

    if (!data.username) {
      validationErrors.push({ field: "username", message: "用户名不能为空" });
    } else if (data.username.length < 3) {
      validationErrors.push({
        field: "username",
        message: "用户名至少3个字符",
      });
    } else if (data.username.length > 50) {
      validationErrors.push({
        field: "username",
        message: "用户名不能超过50个字符",
      });
    } else if (!/^[a-zA-Z0-9_-]+$/.test(data.username)) {
      validationErrors.push({
        field: "username",
        message: "用户名只能包含字母、数字、下划线和连字符",
      });
    }

    if (validationErrors.length > 0) {
      const error = new Error(validationErrors[0].message) as Error & {
        validationErrors: ValidationError[];
      };
      error.validationErrors = validationErrors;
      throw error;
    }

    try {
      const response = await authApi.register(data);
      const userData = response.data.user;
      if (!userData) {
        throw new Error("注册失败：用户信息不存在");
      }

      const user = toUser(userData);
      const token = response.data.access_token;
      const refreshToken = response.data.refresh_token;
      const expiresIn = response.data.expires_in;

      if (token) {
        TokenStorage.setAccessToken(token, expiresIn);
      }
      if (refreshToken) {
        TokenStorage.setRefreshToken(refreshToken);
      }

      return {
        access_token: token || "",
        token_type: "Bearer",
        user,
      };
    } catch (error) {
      if (
        (error as Error & { validationErrors?: ValidationError[] })
          .validationErrors
      ) {
        throw error;
      }
      const authError = new Error("注册失败，该邮箱可能已被注册") as Error &
        AuthError;
      authError.code = "REGISTER_FAILED";
      throw authError;
    }
  },

  async getCurrentUser(): Promise<User> {
    try {
      const response = await authApi.getCurrentUser();
      const userData = response.data.user;
      if (!userData) {
        throw new Error("获取用户信息失败");
      }
      return toUser(userData);
    } catch {
      TokenStorage.clearTokens();
      const authError = new Error("获取用户信息失败，请重新登录") as Error &
        AuthError;
      authError.code = "GET_USER_FAILED";
      throw authError;
    }
  },

  async logout(): Promise<void> {
    try {
      await authApi.logout();
    } catch {
      // 忽略退出登录错误
    } finally {
      TokenStorage.clearTokens();
    }
  },

  async refreshToken(): Promise<boolean> {
    const refreshToken = TokenStorage.getRefreshToken();
    if (!refreshToken) {
      return false;
    }

    try {
      const response = await authApi.refreshToken({ refreshToken });
      if (response?.data?.access_token) {
        TokenStorage.setAccessToken(
          response.data.access_token,
          response.data.expires_in
        );
        if (response.data.refresh_token) {
          TokenStorage.setRefreshToken(response.data.refresh_token);
        }
        return true;
      }
      return false;
    } catch {
      TokenStorage.clearTokens();
      return false;
    }
  },

  isAuthenticated(): boolean {
    return TokenStorage.isAuthenticated();
  },
};
