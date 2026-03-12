/**
 * 统一错误处理
 *
 * 提供标准化的 API 错误类型和错误处理工具函数
 */

export interface ApiError {
  code: string;
  message: string;
  status?: number;
  details?: Record<string, unknown>;
  retryable?: boolean;
  traceId?: string;
}

/**
 * 创建 ApiError 对象
 */
export function createApiError(error: Partial<ApiError>): ApiError {
  return {
    code: error.code || "UNKNOWN_ERROR",
    message: error.message || "请求失败",
    status: error.status,
    details: error.details,
    retryable: error.retryable,
    traceId: error.traceId,
  };
}

/**
 * 判断错误是否可重试
 */
export function isRetryable(error: unknown): boolean {
  if (error && typeof error === "object" && "retryable" in error) {
    return (error as ApiError).retryable === true;
  }
  return false;
}

/**
 * 获取错误显示消息
 */
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

/**
 * 获取错误代码
 */
export function getErrorCode(error: unknown): string {
  if (!error) return "UNKNOWN_ERROR";

  if (typeof error === "object" && error !== null) {
    const err = error as { code?: unknown };
    if (typeof err.code === "string") return err.code;
  }

  return "UNKNOWN_ERROR";
}
