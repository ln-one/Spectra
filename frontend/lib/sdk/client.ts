import createClient, { type FetchOptions } from "openapi-fetch";

const PUBLIC_API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const INTERNAL_API_BASE_URL = process.env.INTERNAL_API_URL || "";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function resolveApiBaseUrl(runtime?: "browser" | "server"): string {
  const effectiveRuntime =
    runtime ?? (typeof window !== "undefined" ? "browser" : "server");
  if (effectiveRuntime === "browser") {
    return trimTrailingSlash(PUBLIC_API_BASE_URL);
  }
  if (INTERNAL_API_BASE_URL) {
    return trimTrailingSlash(INTERNAL_API_BASE_URL);
  }
  return trimTrailingSlash(PUBLIC_API_BASE_URL);
}

export const API_BASE_URL = resolveApiBaseUrl();
export const API_VERSION = "/api/v1";
export const DEFAULT_CONTRACT_VERSION = "2026-03";
const REQUEST_TIMEOUT_MS = Number(
  process.env.NEXT_PUBLIC_API_TIMEOUT_MS ?? 180000
);
const CHAT_REQUEST_TIMEOUT_MS = Number(
  process.env.NEXT_PUBLIC_CHAT_TIMEOUT_MS ?? 300000
);

function generateUuidFallback(): string {
  const template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
  return template.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return generateUuidFallback();
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

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === "AbortError";
  }
  return error instanceof Error && error.name === "AbortError";
}

function createTimedSignal(
  sourceSignal?: AbortSignal,
  timeoutMs = REQUEST_TIMEOUT_MS
): {
  signal: AbortSignal | undefined;
  didTimeout: () => boolean;
  cleanup: () => void;
} {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return {
      signal: sourceSignal,
      didTimeout: () => false,
      cleanup: () => {},
    };
  }

  const controller = new AbortController();
  let timedOut = false;
  let sourceAbortHandler: (() => void) | null = null;

  if (sourceSignal) {
    if (sourceSignal.aborted) {
      controller.abort();
    } else {
      sourceAbortHandler = () => controller.abort();
      sourceSignal.addEventListener("abort", sourceAbortHandler, {
        once: true,
      });
    }
  }

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      if (sourceSignal && sourceAbortHandler) {
        sourceSignal.removeEventListener("abort", sourceAbortHandler);
      }
    },
  };
}

async function timedFetch(
  request: Request,
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const { signal, didTimeout, cleanup } = createTimedSignal(
    request.signal,
    timeoutMs
  );
  const timedRequest = signal
    ? new Request(request, {
        signal,
      })
    : request;
  try {
    return await fetch(timedRequest);
  } catch (error) {
    if (didTimeout() && isAbortError(error)) {
      throw new ApiError(
        "NETWORK_TIMEOUT",
        `Network request timeout after ${timeoutMs}ms: ${timedRequest.method} ${timedRequest.url}`,
        undefined,
        {
          url: timedRequest.url,
          method: timedRequest.method,
          timeout_ms: timeoutMs,
        },
        true
      );
    }
    throw error;
  } finally {
    cleanup();
  }
}

function resolveTimeoutMs(request: Request): number {
  const pathname = normalizePath(request.url);
  if (request.method === "POST" && pathname === "/api/v1/chat/messages") {
    return CHAT_REQUEST_TIMEOUT_MS;
  }
  return REQUEST_TIMEOUT_MS;
}

function normalizePath(input: string): string {
  try {
    return new URL(input, API_BASE_URL).pathname;
  } catch {
    return input;
  }
}

export function buildApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

export function shouldSkipAuth(path: string): boolean {
  const pathname = normalizePath(path);
  return (
    pathname === "/api/v1/auth/login" ||
    pathname === "/api/v1/auth/register" ||
    pathname === "/auth/login" ||
    pathname === "/auth/register"
  );
}

async function fetchWithAuth(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const baseRequest =
    input instanceof Request ? input : new Request(input, init);
  const headers = new Headers(baseRequest.headers);

  if (!headers.has("X-Contract-Version")) {
    headers.set("X-Contract-Version", DEFAULT_CONTRACT_VERSION);
  }

  const authedRequest = new Request(baseRequest, {
    headers,
    credentials: "include",
  });
  const timeoutMs = resolveTimeoutMs(authedRequest);
  let response: Response;
  try {
    response = await timedFetch(authedRequest, timeoutMs);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    const errorMessage =
      error instanceof Error ? error.message : "Unknown network error";
    throw new ApiError(
      "NETWORK_ERROR",
      `Network request failed: ${authedRequest.method} ${authedRequest.url}`,
      undefined,
      {
        url: authedRequest.url,
        method: authedRequest.method,
        cause: errorMessage,
      },
      true
    );
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

export async function apiFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const url = buildApiUrl(path);
  return fetchWithAuth(url, init);
}

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
