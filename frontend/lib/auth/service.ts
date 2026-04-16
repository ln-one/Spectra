import { authApi } from "../sdk/auth";
import { emitAuthStateChange } from "./token-storage";
import { toUser } from "./user-mapper";
import { validateLoginInput, validateRegisterInput } from "./validators";
import type {
  AuthError,
  LoginResponse,
  RegisterRequest,
  User,
  ValidationError,
} from "./types";

export const authService = {
  async login(email: string, password: string): Promise<LoginResponse> {
    validateLoginInput(email, password);

    try {
      const response = await authApi.login({ email, password });
      const userData = response.data.user;
      if (!userData) {
        throw new Error("登录失败：用户信息不存在");
      }

      const user = toUser(userData);
      emitAuthStateChange();

      return {
        user,
      };
    } catch (error) {
      if (
        (error as Error & { validationErrors?: ValidationError[] })
          .validationErrors
      ) {
        throw error;
      }
      const message =
        error instanceof Error ? error.message : "登录失败，请检查邮箱和密码";
      const authError = new Error(message) as Error & AuthError;
      authError.code = "LOGIN_FAILED";
      throw authError;
    }
  },

  async register(data: RegisterRequest): Promise<LoginResponse> {
    validateRegisterInput(data);

    try {
      const response = await authApi.register(data);
      const userData = response.data.user;
      if (!userData) {
        throw new Error("注册失败：用户信息不存在");
      }

      const user = toUser(userData);
      emitAuthStateChange();

      return {
        user,
      };
    } catch (error) {
      if (
        (error as Error & { validationErrors?: ValidationError[] })
          .validationErrors
      ) {
        throw error;
      }
      const message =
        error instanceof Error ? error.message : "注册失败，请稍后重试";
      const authError = new Error(message) as Error & AuthError;
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
    } catch (error) {
      const authError = new Error("获取用户信息失败，请重新登录") as Error &
        AuthError & { status?: number };
      authError.code = "GET_USER_FAILED";
      if (typeof error === "object" && error !== null && "status" in error) {
        authError.status = (error as { status?: number }).status;
      }
      throw authError;
    }
  },

  async logout(): Promise<void> {
    try {
      await authApi.logout();
    } catch {
      // ignore logout errors
    } finally {
      emitAuthStateChange();
    }
  },

  async hasActiveSession(): Promise<boolean> {
    try {
      await authApi.getCurrentUser();
      return true;
    } catch {
      return false;
    }
  },
};
