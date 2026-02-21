/**
 * Authentication Utilities
 *
 * 认证工具模块 - 提供 Token 存储和认证状态检查
 *
 * TODO: 实现完整的认证逻辑
 * - Token 刷新机制
 * - Token 过期检查
 * - 生产环境使用 httpOnly cookie
 */

export interface User {
  id: string;
  email: string;
  username: string;
  fullName?: string;
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

/**
 * Token 存储管理
 *
 * 当前使用 localStorage，生产环境建议使用 httpOnly cookie
 */
export const TokenStorage = {
  /**
   * 存储访问令牌
   */
  setAccessToken(token: string): void {
    if (typeof window !== "undefined") {
      localStorage.setItem("access_token", token);
    }
  },

  /**
   * 获取访问令牌
   */
  getAccessToken(): string | null {
    if (typeof window !== "undefined") {
      return localStorage.getItem("access_token");
    }
    return null;
  },

  /**
   * 清除所有令牌
   */
  clearTokens(): void {
    if (typeof window !== "undefined") {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
    }
  },

  /**
   * 检查是否已认证
   */
  isAuthenticated(): boolean {
    return !!this.getAccessToken();
  },
};

/**
 * 认证服务 API 调用
 *
 * TODO: 取消注释以启用 API 调用
 */
export const authService = {
  /**
   * 用户登录
   */
  async login(email: string, password: string): Promise<LoginResponse> {
    // TODO: 取消注释以启用
    // const { api } = await import('./api');
    // const response = await api.post<{ token: string; user: User }>(
    //   '/auth/login',
    //   { email, password },
    //   { requireAuth: false }
    // );
    // return {
    //   access_token: response.token,
    //   token_type: 'Bearer',
    //   user: response.user,
    // };
    throw new Error("Not implemented");
  },

  /**
   * 用户注册
   */
  async register(data: RegisterRequest): Promise<LoginResponse> {
    // TODO: 取消注释以启用
    // const { api } = await import('./api');
    // const response = await api.post<{ token: string; user: User }>(
    //   '/auth/register',
    //   data,
    //   { requireAuth: false }
    // );
    // return {
    //   access_token: response.token,
    //   token_type: 'Bearer',
    //   user: response.user,
    // };
    throw new Error("Not implemented");
  },

  /**
   * 获取当前用户信息
   */
  async getCurrentUser(): Promise<User> {
    // TODO: 取消注释以启用
    // const { api } = await import('./api');
    // const response = await api.get<{ user: User }>('/auth/me');
    // return response.user;
    throw new Error("Not implemented");
  },

  /**
   * 用户登出
   */
  async logout(): Promise<void> {
    // TODO: 如果后端需要登出接口，取消注释
    // const { api } = await import('./api');
    // await api.post('/auth/logout');
    TokenStorage.clearTokens();
  },
};
