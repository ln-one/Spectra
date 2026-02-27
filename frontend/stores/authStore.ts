/**
 * Authentication Store
 *
 * 使用 Zustand 管理全局认证状态
 *
 * TODO: 实现完整的状态管理逻辑
 * - 自动检查认证状态
 * - Token 刷新机制
 * - 错误处理
 */

import { create } from "zustand";
import { authService, TokenStorage, User } from "@/lib/auth";

export interface AuthState {
  // 状态
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

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
}

/**
 * 认证状态管理 Store
 *
 * > REVIEW-P0(blocking) 问题：`register` 的参数签名与文档示例不一致（文档用 `name`，实现用 `username/fullName`）。
 * > REVIEW-P0(blocking) 建议：统一参数命名，与后端 API 契约和文档示例保持一致。
 *
 * > REVIEW-P2(nice-to-have) 问题：`AuthState` 类型仅在此文件内部定义，其他模块无法导入使用。
 * > REVIEW-P2(nice-to-have) 建议：在 `lib/types.ts` 中导出此类型，便于跨模块共享。
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
      // TODO: 实现登录逻辑
      const response = await authService.login(email, password);
      TokenStorage.setAccessToken(response.access_token);
      set({
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "登录失败",
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
      // TODO: 实现注册逻辑
      const response = await authService.register({
        email,
        password,
        username,
        fullName,
      });
      TokenStorage.setAccessToken(response.access_token);
      set({
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "注册失败",
        isLoading: false,
      });
      throw error;
    }
  },

  /**
   * 用户登出
   */
  logout: () => {
    TokenStorage.clearTokens();
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
      // TODO: 实现获取当前用户信息
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
}));
