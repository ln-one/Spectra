/**
 * Authentication Store
 */

import { create } from "zustand";
import { authService, TokenStorage, User } from "@/lib/auth";
import {
  ApiErrorShape,
  createApiError,
  getErrorMessage,
} from "@/lib/sdk/errors";

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: ApiErrorShape | null;

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

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.login(email, password);
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

  logout: () => {
    void authService.logout();
    set({
      user: null,
      isAuthenticated: false,
      error: null,
    });
  },

  checkAuth: async () => {
    let token = TokenStorage.getAccessToken();
    if (!token && TokenStorage.getRefreshToken()) {
      const refreshed = await authService.refreshToken();
      if (refreshed) {
        token = TokenStorage.getAccessToken();
      }
    }

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
    } catch (error) {
      const status =
        typeof error === "object" && error !== null && "status" in error
          ? (error as { status?: number }).status
          : undefined;

      if (status === 401 || status === 403) {
        TokenStorage.clearTokens();
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
        });
        return;
      }

      set({
        user: null,
        isAuthenticated: !!TokenStorage.getAccessToken(),
        isLoading: false,
      });
    }
  },

  clearError: () => {
    set({ error: null });
  },

  setUser: (user: User | null) => {
    set({ user, isAuthenticated: !!user });
  },
}));
