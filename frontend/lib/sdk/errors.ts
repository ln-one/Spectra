export { ApiError } from "./client";

export interface ApiErrorShape {
  code: string;
  message: string;
  status?: number;
  details?: Record<string, unknown>;
  retryable?: boolean;
  traceId?: string;
}

export function createApiError(error: Partial<ApiErrorShape>): ApiErrorShape {
  return {
    code: error.code || "UNKNOWN_ERROR",
    message: error.message || "请求失败",
    status: error.status,
    details: error.details,
    retryable: error.retryable,
    traceId: error.traceId,
  };
}

export function isRetryable(error: unknown): boolean {
  if (error && typeof error === "object" && "retryable" in error) {
    return (error as ApiErrorShape).retryable === true;
  }
  return false;
}

export function getErrorMessage(error: unknown): string {
  if (!error) return "未知错误";
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null) {
    const err = error as { message?: unknown };
    if (typeof err.message === "string") return err.message;
    if ("message" in err) return String(err.message);
  }
  return "未知错误";
}

export function getErrorCode(error: unknown): string {
  if (!error) return "UNKNOWN_ERROR";
  if (typeof error === "object" && error !== null) {
    const err = error as { code?: unknown };
    if (typeof err.code === "string") return err.code;
  }
  return "UNKNOWN_ERROR";
}
