import createClient, { type FetchOptions } from "openapi-fetch";
import { TokenStorage } from "../auth";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export const API_VERSION = "/api/v1";
export const DEFAULT_CONTRACT_VERSION = "2026-03";

export function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `idemp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
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

function normalizePath(input: string): string {
  try {
    return new URL(input, API_BASE_URL).pathname;
  } catch {
    return input;
  }
}

function shouldSkipAuth(path: string): boolean {
  const pathname = normalizePath(path);
  return pathname.startsWith("/api/v1/auth/") || pathname.startsWith("/auth/");
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

async function refreshAccessToken(): Promise<boolean> {
  if (isRefreshing) {
    return new Promise((resolve) => {
      subscribeTokenRefresh((token: string) => resolve(!!token));
    });
  }

  const refreshToken = TokenStorage.getRefreshToken();
  if (!refreshToken) return false;

  isRefreshing = true;
  let refreshSuccess = false;

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Contract-Version": DEFAULT_CONTRACT_VERSION,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!response.ok) {
      return false;
    }
    const payload = (await response.json()) as {
      data?: {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      };
    };
    const accessToken = payload?.data?.access_token;
    if (accessToken) {
      TokenStorage.setAccessToken(accessToken, payload.data?.expires_in);
      if (payload.data?.refresh_token) {
        TokenStorage.setRefreshToken(payload.data.refresh_token);
      }
      refreshSuccess = true;
      onTokenRefreshed(accessToken);
    }
    return refreshSuccess;
  } catch {
    return false;
  } finally {
    isRefreshing = false;
    if (!refreshSuccess) {
      onTokenRefreshed("");
    }
  }
}

async function fetchWithAuth(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const url = typeof input === "string" ? input : input.toString();
  const headers = new Headers(init?.headers || {});

  if (!headers.has("X-Contract-Version")) {
    headers.set("X-Contract-Version", DEFAULT_CONTRACT_VERSION);
  }

  if (!shouldSkipAuth(url)) {
    const token = TokenStorage.getAccessToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const response = await fetch(url, { ...init, headers });
  if (response.status === 401 && !shouldSkipAuth(url)) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const retryHeaders = new Headers(headers);
      const newToken = TokenStorage.getAccessToken();
      if (newToken) {
        retryHeaders.set("Authorization", `Bearer ${newToken}`);
      }
      return fetch(url, { ...init, headers: retryHeaders });
    }
  }
  return response;
}

export function toApiError(error: unknown, status?: number): ApiError {
  const payload = error as {
    error?: {
      code?: string;
      message?: string;
      details?: Record<string, unknown>;
      retryable?: boolean;
      trace_id?: string;
    };
    message?: string;
  };
  const code = payload?.error?.code || "UNKNOWN_ERROR";
  const message = payload?.error?.message || payload?.message || "请求失败";
  return new ApiError(
    code,
    message,
    status,
    payload?.error?.details,
    payload?.error?.retryable,
    payload?.error?.trace_id
  );
}

export function withIdempotency(
  headers: Record<string, string> = {},
  autoIdempotency = false,
  idempotencyKey?: string
): Record<string, string> {
  let finalKey = idempotencyKey;
  if (!finalKey && autoIdempotency) {
    finalKey = generateIdempotencyKey();
  }
  if (finalKey) {
    return { ...headers, "Idempotency-Key": finalKey };
  }
  return headers;
}

export const sdkClient = createClient<import("./types").paths>({
  baseUrl: API_BASE_URL,
  fetch: fetchWithAuth,
});

export async function unwrap<T>(result: {
  data?: T;
  error?: unknown;
  response?: Response;
}): Promise<T> {
  if (result.error) {
    throw toApiError(result.error, result.response?.status);
  }
  return result.data as T;
}

export type SDKFetchOptions<T> = FetchOptions<T>;
