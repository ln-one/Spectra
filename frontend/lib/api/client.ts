/**
 * API Client - Base HTTP client with authentication
 */

import { TokenStorage, authService } from "../auth";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export const API_VERSION = "/api/v1";

// Mock 模式开关（仅用于临时调试，默认关闭）
export const ENABLE_MOCK = process.env.NEXT_PUBLIC_MOCK === "true";

export interface RequestOptions extends RequestInit {
  requireAuth?: boolean;
  idempotencyKey?: string;
  headers?: Record<string, string>;
  _retry?: boolean;
}

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status?: number,
    public details?: Record<string, unknown>
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
      subscribeTokenRefresh(() => resolve(true));
    });
  }

  isRefreshing = true;

  try {
    const success = await authService.refreshToken();
    if (success) {
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

  if (idempotencyKey) {
    requestHeaders["Idempotency-Key"] = idempotencyKey;
  }

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
      data.error?.details
    );
  }

  return data;
}
