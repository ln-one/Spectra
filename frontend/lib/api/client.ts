/**
 * API Client - Base HTTP client with authentication
 */

import { TokenStorage } from "../auth";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export const API_VERSION = "/api/v1";

export interface RequestOptions extends RequestInit {
  requireAuth?: boolean;
  idempotencyKey?: string;
  headers?: Record<string, string>;
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
