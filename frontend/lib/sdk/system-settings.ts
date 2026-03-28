import { apiFetch, toApiError, withIdempotency } from "./client";

export interface SystemSettingsPayload {
  models: {
    default_model: string;
    large_model: string;
    small_model: string;
  };
  generation_defaults: {
    default_output_type: string;
    default_page_count: number;
    default_outline_style: string;
  };
  feature_flags: {
    enable_ai_generation: boolean;
    enable_file_upload: boolean;
    feature_flags?: Record<string, boolean>;
  };
  experience: {
    chat_timeout_seconds: number;
    ai_request_timeout_seconds: number;
  };
}

export type SystemSettingsUpdateRequest = Partial<{
  models: Partial<SystemSettingsPayload["models"]>;
  generation_defaults: Partial<SystemSettingsPayload["generation_defaults"]>;
  feature_flags: Partial<SystemSettingsPayload["feature_flags"]>;
  experience: Partial<SystemSettingsPayload["experience"]>;
}>;

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  message: string;
};

async function parseResponse<T>(
  response: Response,
  fallbackMessage: string
): Promise<T> {
  if (!response.ok) {
    let payload: unknown = { message: fallbackMessage };
    try {
      payload = await response.json();
    } catch {
      // Keep fallback payload when body is not JSON.
    }
    throw toApiError(payload, response.status);
  }
  return (await response.json()) as T;
}

export const systemSettingsApi = {
  async get(): Promise<ApiEnvelope<SystemSettingsPayload>> {
    const response = await apiFetch("/api/v1/system-settings");
    return parseResponse<ApiEnvelope<SystemSettingsPayload>>(
      response,
      "获取系统设置失败"
    );
  },

  async patch(
    body: SystemSettingsUpdateRequest
  ): Promise<ApiEnvelope<SystemSettingsPayload>> {
    const headers = withIdempotency(
      {
        "Content-Type": "application/json",
      },
      true
    );
    const response = await apiFetch("/api/v1/system-settings", {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    });
    return parseResponse<ApiEnvelope<SystemSettingsPayload>>(
      response,
      "更新系统设置失败"
    );
  },
};
