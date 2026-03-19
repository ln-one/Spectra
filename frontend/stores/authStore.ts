/**
 * Authentication Store
 *
 * 使用 Zustand 管理全局认证状态
 */

import { create } from "zustand";
import { authService, TokenStorage, User } from "@/lib/auth";
import {
  ApiErrorShape,
  createApiError,
  getErrorMessage,
} from "@/lib/sdk/errors";

export interface AuthState {
  // 状态
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: ApiErrorShape | null;

  // 操作
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    username: string,
    fullName?: string
  ) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
  clearError: () => void;
  setUser: (user: User | null) => void;
}

/**
 * 认证状态管理 Store
 *
 * 使用示例:
 * ```tsx
 * const { user, login, logout } = useAuthStore();
 * ```
 */
export const useAuthStore = create<AuthState>()((set, _get) => ({
  // 初始状态
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  /**
   * 用户登录
   */
  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.login(email, password);
      TokenStorage.setAccessToken(response.access_token);
      // 存储 refresh_token
      if (response.refresh_token) {
        TokenStorage.setRefreshToken(response.refresh_token);
      }
      set({
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      const apiError = createApiError({
        code: "LOGIN_FAILED",
        message: getErrorMessage(error),
      });
      set({
        error: apiError,
        isLoading: false,
      });
      throw error;
    }
  },

  /**
   * 用户注册
   */
  register: async (
    email: string,
    password: string,
    username: string,
    fullName?: string
  ) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.register({
        email,
        password,
        username,
        fullName,
      });
      TokenStorage.setAccessToken(response.access_token);
      // 存储 refresh_token
      if (response.refresh_token) {
        TokenStorage.setRefreshToken(response.refresh_token);
      }
      set({
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      const apiError = createApiError({
        code: "REGISTER_FAILED",
        message: getErrorMessage(error),
      });
      set({
        error: apiError,
        isLoading: false,
      });
      throw error;
    }
  },

  /**
   * 用户登出
   */
  logout: () => {
    void authService.logout();
    set({
      user: null,
      isAuthenticated: false,
      error: null,
    });
  },

  /**
   * 检查认证状态
   *
   * 应用启动时调用，验证 token 是否有效
   */
  checkAuth: async () => {
    const token = TokenStorage.getAccessToken();
    if (!token) {
      set({ isAuthenticated: false, user: null });
      return;
    }

    set({ isLoading: true });
    try {
      const user = await authService.getCurrentUser();
      set({
        user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch {
      // Token 无效，清除
      TokenStorage.clearTokens();
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  /**
   * 清除错误信息
   */
  clearError: () => {
    set({ error: null });
  },

  /**
   * 设置用户信息（用于 token 刷新后同步状态）
   */
  setUser: (user: User | null) => {
    set({ user, isAuthenticated: !!user });
  },
}));
