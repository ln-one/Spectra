/**
 * API Client with Authentication Interceptor
 *
 * 提供统一的 API 请求封装，自动处理：
 * - JWT Token 认证
 * - 请求/响应拦截
 * - 错误处理
 * - 幂等性支持
 *
 * > REVIEW-P0(blocking) 问题：此处使用 Fetch API，但文档示例为 Axios，策略不一致。
 * > REVIEW-P0(blocking) 建议：统一为 Fetch Wrapper 方案（改动最小）
 * >   理由：当前已有完整实现、package.json 无 axios 依赖、仅需更新文档、目标是文档与代码一致
 *
 * > REVIEW-P0(blocking) 问题：当前文件已 389 行，超过单文件推荐行数（< 300 行）。
 * > REVIEW-P0(blocking) 建议：按 Index Pattern 拆分为 `lib/api/{types.ts, request.ts, response.ts, methods.ts}` + 入口编排。
 *
 * > REVIEW-P1(important) 问题：高级功能未实现，包括 Token 自动刷新、请求重试、请求取消等。
 * > REVIEW-P1(important) 建议：作为设计/骨架阶段的后续完善项，不阻塞本轮架构审核
 * >   MVP 阶段：当前实现可接受，需在文档明确标注
 * >   产品阶段：后续需实现完整的 QoS 功能
 *
 * TODO: 实现高级功能（后续迭代）
 * - Token 自动刷新（响应 401 时）
 * - 请求重试机制（指数退避）
 * - 请求取消（AbortController）
 */

import { TokenStorage } from "./auth";

// ==========================================
// Types
// ==========================================

/**
 * API 响应基础结构
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  message?: string;
}

/**
 * API 错误类型
 */
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status?: number,
    public details?: any
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * 请求配置选项
 */
export interface RequestOptions extends RequestInit {
  /**
   * 是否需要认证（默认 true）
   */
  requireAuth?: boolean;

  /**
   * 幂等性密钥（用于写操作）
   */
  idempotencyKey?: string;

  /**
   * 自定义 headers
   */
  headers?: Record<string, string>;
}

// ==========================================
// Configuration
// ==========================================

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_VERSION = "/api/v1";

/**
 * 获取完整的 API URL
 */
function getApiUrl(path: string): string {
  // 如果路径已包含 /api/v1，直接使用
  if (path.startsWith("/api/v1")) {
    return `${API_BASE_URL}${path}`;
  }
  // 否则添加版本前缀
  return `${API_BASE_URL}${API_VERSION}${path}`;
}

// ==========================================
// Request Interceptor
// ==========================================

/**
 * 请求拦截器 - 添加认证 Token 和其他 headers
 *
 * TODO: 实现完整的请求拦截逻辑
 */
function interceptRequest(
  url: string,
  options: RequestOptions = {}
): [string, RequestInit] {
  const {
    requireAuth = true,
    idempotencyKey,
    headers = {},
    ...fetchOptions
  } = options;

  // 构建 headers
  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...headers,
  };

  // 添加认证 Token
  if (requireAuth) {
    const token = TokenStorage.getAccessToken();
    if (token) {
      requestHeaders["Authorization"] = `Bearer ${token}`;
    }
  }

  // 添加幂等性密钥（用于写操作）
  if (idempotencyKey) {
    requestHeaders["Idempotency-Key"] = idempotencyKey;
  }

  return [
    getApiUrl(url),
    {
      ...fetchOptions,
      headers: requestHeaders,
    },
  ];
}

// ==========================================
// Response Interceptor
// ==========================================

/**
 * 响应拦截器 - 统一处理响应和错误
 *
 * TODO: 实现完整的响应拦截逻辑
 * - Token 过期自动刷新
 * - 401 自动跳转登录
 */
async function interceptResponse<T>(response: Response): Promise<T> {
  // 解析 JSON 响应
  let data: ApiResponse<T>;
  try {
    data = await response.json();
  } catch (error) {
    throw new ApiError("PARSE_ERROR", "响应解析失败", response.status);
  }

  // 处理成功响应
  if (response.ok && data.success) {
    return data.data as T;
  }

  // 处理错误响应
  const errorCode = data.error?.code || "UNKNOWN_ERROR";
  const errorMessage = data.error?.message || data.message || "请求失败";
  const errorDetails = data.error?.details;

  // TODO: 特殊错误处理
  // if (errorCode === 'TOKEN_EXPIRED') {
  //   // 尝试刷新 Token
  //   await refreshToken();
  //   // 重试原请求
  // }

  // if (errorCode === 'UNAUTHORIZED') {
  //   // 清除 Token 并跳转登录
  //   TokenStorage.clearTokens();
  //   window.location.href = '/auth/login';
  // }

  throw new ApiError(errorCode, errorMessage, response.status, errorDetails);
}

// ==========================================
// HTTP Methods
// ==========================================

/**
 * GET 请求
 */
export async function get<T>(
  url: string,
  options?: RequestOptions
): Promise<T> {
  const [requestUrl, requestOptions] = interceptRequest(url, {
    ...options,
    method: "GET",
  });

  const response = await fetch(requestUrl, requestOptions);
  return interceptResponse<T>(response);
}

/**
 * POST 请求
 */
export async function post<T>(
  url: string,
  body?: any,
  options?: RequestOptions
): Promise<T> {
  const [requestUrl, requestOptions] = interceptRequest(url, {
    ...options,
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });

  const response = await fetch(requestUrl, requestOptions);
  return interceptResponse<T>(response);
}

/**
 * PUT 请求
 */
export async function put<T>(
  url: string,
  body?: any,
  options?: RequestOptions
): Promise<T> {
  const [requestUrl, requestOptions] = interceptRequest(url, {
    ...options,
    method: "PUT",
    body: body ? JSON.stringify(body) : undefined,
  });

  const response = await fetch(requestUrl, requestOptions);
  return interceptResponse<T>(response);
}

/**
 * PATCH 请求
 */
export async function patch<T>(
  url: string,
  body?: any,
  options?: RequestOptions
): Promise<T> {
  const [requestUrl, requestOptions] = interceptRequest(url, {
    ...options,
    method: "PATCH",
    body: body ? JSON.stringify(body) : undefined,
  });

  const response = await fetch(requestUrl, requestOptions);
  return interceptResponse<T>(response);
}

/**
 * DELETE 请求
 */
export async function del<T>(
  url: string,
  options?: RequestOptions
): Promise<T> {
  const [requestUrl, requestOptions] = interceptRequest(url, {
    ...options,
    method: "DELETE",
  });

  const response = await fetch(requestUrl, requestOptions);
  return interceptResponse<T>(response);
}

/**
 * 文件上传请求
 *
 * 注意：文件上传不使用 JSON，需要使用 FormData
 */
export async function upload<T>(
  url: string,
  formData: FormData,
  options?: RequestOptions
): Promise<T> {
  const {
    requireAuth = true,
    idempotencyKey,
    headers = {},
    ...fetchOptions
  } = options || {};

  // 构建 headers（不设置 Content-Type，让浏览器自动设置）
  const requestHeaders: Record<string, string> = {
    ...headers,
  };

  // 添加认证 Token
  if (requireAuth) {
    const token = TokenStorage.getAccessToken();
    if (token) {
      requestHeaders["Authorization"] = `Bearer ${token}`;
    }
  }

  // 添加幂等性密钥
  if (idempotencyKey) {
    requestHeaders["Idempotency-Key"] = idempotencyKey;
  }

  const response = await fetch(getApiUrl(url), {
    ...fetchOptions,
    method: "POST",
    headers: requestHeaders,
    body: formData,
  });

  return interceptResponse<T>(response);
}

// ==========================================
// Utility Functions
// ==========================================

/**
 * 生成幂等性密钥
 */
export function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

/**
 * 构建查询字符串
 */
export function buildQueryString(params: Record<string, any>): string {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  });

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : "";
}

// ==========================================
// Export API Client
// ==========================================

/**
 * API 客户端
 *
 * 使用示例:
 * ```tsx
 * import { api } from '@/lib/api';
 *
 * // GET 请求
 * const projects = await api.get('/projects');
 *
 * // POST 请求（带幂等性）
 * const project = await api.post('/projects', data, {
 *   idempotencyKey: api.generateIdempotencyKey()
 * });
 *
 * // 文件上传
 * const formData = new FormData();
 * formData.append('file', file);
 * const result = await api.upload('/files', formData);
 * ```
 */
export const api = {
  get,
  post,
  put,
  patch,
  delete: del,
  upload,
  generateIdempotencyKey,
  buildQueryString,
};

export default api;
