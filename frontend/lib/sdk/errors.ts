import { ApiError } from "./client";

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

function readErrorCause(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const details = (error as { details?: Record<string, unknown> }).details;
  const cause = details?.cause;
  return typeof cause === "string" ? cause : "";
}

export function getChatRequestErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "NETWORK_TIMEOUT") {
      return "聊天请求超时，模型还没有在限定时间内返回。请稍后重试。";
    }
    if (error.code === "NETWORK_ERROR") {
      const cause = readErrorCause(error).toLowerCase();
      if (cause.includes("econnreset") || cause.includes("socket hang up")) {
        return "聊天连接被中途断开，请重试。开发环境下请确认前端直连 backend。";
      }
      return "聊天网络连接失败，请检查后端是否可达后重试。";
    }
    if ((error.status ?? 0) >= 500) {
      return "后端聊天服务暂时不可用，请稍后重试。";
    }
  }
  return getErrorMessage(error);
}

export function getChatLatencyNotice(observability: unknown): string | null {
  if (!observability || typeof observability !== "object") return null;
  const totalDurationMs = (observability as { total_duration_ms?: unknown })
    .total_duration_ms;
  if (typeof totalDurationMs !== "number" || totalDurationMs < 15000) {
    return null;
  }
  const seconds = Math.max(1, Math.round(totalDurationMs / 1000));
  return `本次聊天响应较慢，模型大约用了 ${seconds} 秒返回。`;
}
