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

/**
 * > REVIEW-P1(important) 问题：User 类型缺少 OpenAPI 契约规定的必需字段 createdAt。
 * > REVIEW-P1(important) 建议：同步 OpenAPI 契约，添加缺失字段（createdAt 为必需）。
 * > REVIEW-P1(important) 位置：docs/openapi.yaml 第 606 行要求 UserInfo.createdAt 为必需
 */
export interface User {
  id: string;
  email: string;
  username: string;
  createdAt: Date;        // REQUIRED by OpenAPI contract (openapi.yaml:606)
  fullName?: string;
  updatedAt?: Date;       // Optional for now, verify with OpenAPI
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
 *
 * > REVIEW-P0(blocking) 问题：文档示例中存在 `token` 键名写法，与此处 `access_token` 约定不一致。
 * > REVIEW-P0(blocking) 建议：统一通过 `TokenStorage.getAccessToken()` 访问令牌，避免业务代码直接硬编码 localStorage 键名。
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
 * > REVIEW-P1(important) 问题：`authService.login()` 和 `register()` 方法抛出 `Not implemented` 错误。
 * > REVIEW-P1(important) 建议：根据后端 API 契约实现这两个方法（调用 `/api/v1/auth/login` 和 `/api/v1/auth/register`）。
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
