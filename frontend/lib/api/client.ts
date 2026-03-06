/**
 * API Client - Base HTTP client with authentication
 */

import { TokenStorage, authService } from "../auth";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export const API_VERSION = "/api/v1";
export const DEFAULT_CONTRACT_VERSION = "2026-03";

function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `idemp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export interface RequestOptions extends RequestInit {
  requireAuth?: boolean;
  idempotencyKey?: string;
  autoIdempotency?: boolean;
  headers?: Record<string, string>;
  _retry?: boolean;
}

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status?: number,
    public details?: Record<string, unknown>,
    public retryable?: boolean,
    public traceId?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function getApiUrl(path: string): string {
  if (path.startsWith("/api/v1")) {
    return `${API_BASE_URL}${path}`;
  }
  return `${API_BASE_URL}${API_VERSION}${path}`;
}

let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function subscribeTokenRefresh(callback: (token: string) => void): void {
  refreshSubscribers.push(callback);
}

function onTokenRefreshed(token: string): void {
  refreshSubscribers.forEach((callback) => callback(token));
  refreshSubscribers = [];
}

async function tryRefreshToken(): Promise<boolean> {
  if (isRefreshing) {
    return new Promise((resolve) => {
      subscribeTokenRefresh((token: string) => resolve(!!token));
    });
  }

  isRefreshing = true;
  let refreshSuccess = false;

  try {
    const success = await authService.refreshToken();
    if (success) {
      refreshSuccess = true;
      const newToken = TokenStorage.getAccessToken();
      if (newToken) {
        onTokenRefreshed(newToken);
      }
    }
    return success;
  } catch {
    return false;
  } finally {
    isRefreshing = false;
    // Notify waiting subscribers even on failure so they don't hang
    if (!refreshSuccess) {
      onTokenRefreshed("");
    }
  }
}

function handleAuthError(): void {
  if (typeof window === "undefined") return;

  const currentPath = window.location.pathname;
  if (currentPath.startsWith("/auth/")) return;

  TokenStorage.clearTokens();
  window.location.href = `/auth/login?redirect=${encodeURIComponent(currentPath)}`;
}

export async function request<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const {
    requireAuth = true,
    idempotencyKey,
    autoIdempotency = false,
    headers = {},
    _retry = false,
    ...fetchOptions
  } = options;

  const requestHeaders: Record<string, string> = {
    ...headers,
  };

  if (!options.body || !(options.body instanceof FormData)) {
    requestHeaders["Content-Type"] = "application/json";
  }

  if (requireAuth) {
    const token = TokenStorage.getAccessToken();
    if (token) {
      requestHeaders["Authorization"] = `Bearer ${token}`;
    }
  }

  // 添加幂等键：优先使用传入的 idempotencyKey，否则在需要时自动生成
  let finalIdempotencyKey = idempotencyKey;
  if (!finalIdempotencyKey && autoIdempotency) {
    finalIdempotencyKey = generateIdempotencyKey();
  }
  if (finalIdempotencyKey) {
    requestHeaders["Idempotency-Key"] = finalIdempotencyKey;
  }

  // 添加契约版本头
  requestHeaders["X-Contract-Version"] = DEFAULT_CONTRACT_VERSION;

  const response = await fetch(getApiUrl(path), {
    ...fetchOptions,
    headers: requestHeaders,
  });

  if (response.status === 401) {
    if (!_retry && !path.startsWith("/auth/")) {
      const refreshed = await tryRefreshToken();
      if (refreshed) {
        return request<T>(path, { ...options, _retry: true });
      }
    }
    handleAuthError();
    throw new ApiError(
      "UNAUTHORIZED",
      "Authentication required. Please login.",
      401
    );
  }

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(
      data.error?.code || "UNKNOWN_ERROR",
      data.error?.message || data.message || "Request failed",
      response.status,
      data.error?.details,
      data.error?.retryable,
      data.error?.trace_id
    );
  }

  return data;
}
