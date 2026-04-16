/**
 * Authentication Store
 */

import { create } from "zustand";
import { authService, User } from "@/lib/auth";
import {
  ApiErrorShape,
  createApiError,
  getErrorMessage,
} from "@/lib/sdk/errors";

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isCheckingSession: boolean;
  isSubmitting: boolean;
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
  isCheckingSession: false,
  isSubmitting: false,
  error: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, isSubmitting: true, error: null });
    try {
      const response = await authService.login(email, password);
      set({
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
        isSubmitting: false,
      });
    } catch (error) {
      const apiError = createApiError({
        code: "LOGIN_FAILED",
        message: getErrorMessage(error),
      });
      set({
        error: apiError,
        isLoading: false,
        isSubmitting: false,
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
    set({ isLoading: true, isSubmitting: true, error: null });
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
        isSubmitting: false,
      });
    } catch (error) {
      const apiError = createApiError({
        code: "REGISTER_FAILED",
        message: getErrorMessage(error),
      });
      set({
        error: apiError,
        isLoading: false,
        isSubmitting: false,
      });
      throw error;
    }
  },

  logout: () => {
    void authService.logout();
    set({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isCheckingSession: false,
      isSubmitting: false,
      error: null,
    });
  },

  checkAuth: async () => {
    set({ isLoading: true, isCheckingSession: true });
    try {
      const user = await authService.getCurrentUser();
      set({
        user,
        isAuthenticated: true,
        isLoading: false,
        isCheckingSession: false,
      });
    } catch (error) {
      const status =
        typeof error === "object" && error !== null && "status" in error
          ? (error as { status?: number }).status
          : undefined;

      if (status === 401 || status === 403) {
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          isCheckingSession: false,
        });
        return;
      }

      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isCheckingSession: false,
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
