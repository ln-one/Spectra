import { authApi } from "../sdk/auth";
import { TokenStorage } from "./token-storage";
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
    validateRegisterInput(data);

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
      // ignore logout errors
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
